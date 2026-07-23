#!/usr/bin/env node
/**
 * G8 deployment gate (repeatable): dynamic ACP session config options,
 * end-to-end against the live serving topology (static shell + ingress +
 * fork agent-server) — no mocks anywhere.
 *
 *   G-fork-serving   The live agent-server is the fork build: OpenAPI
 *                    advertises POST /set_acp_config_option and
 *                    ConversationInfo.config_options.
 *   G-options-shape  The gate conversation relays well-formed config_options
 *                    (valid ids/types; select options carry choices; at least
 *                    one non-"model" option exists so the UI has real pills).
 *   G-set-api        Live set round-trip through the ingress: flip a select
 *                    option to a different advertised value (200 + re-read
 *                    shows the new current_value), then restore the original
 *                    (verified). Fail-closed: no API key → 401/403, unknown
 *                    config_id → 4xx, unknown conversation → 404.
 *   G-ui-pills       The deployed shell renders one pill per non-model option
 *                    on the conversation page, suppresses the "model" config
 *                    pill (the model chip owns model switching), and keeps
 *                    the model chip visible.
 *   G-ui-select      Full UI loop: open a select pill's popover (choices
 *                    listed), pick a different value, and watch the pill
 *                    re-label from the invalidated conversation query. The
 *                    original value is restored via the API afterwards
 *                    (verified) so the gate leaves no residue.
 *
 * A boolean-toggle UI gate is intentionally conditional: opencode currently
 * advertises no boolean option, so when none exists the gate reports
 * SKIP (not counted) rather than pretending coverage. Unit coverage for the
 * toggle lives in chat-input-config-options.test.tsx.
 *
 * Usage:
 *   CANVAS_URL=http://127.0.0.1:8010 \
 *   BACKEND_API_KEY=<LOCAL_BACKEND_API_KEY> \
 *   G8_CONVERSATION_ID=<resident ACP conversation id> \
 *     node scripts/g8_configoptions_gate.mjs
 *
 * G8_CONVERSATION_ID defaults to the resident "Monday - launch planning"
 * opencode conversation. The conversation must exist and be ACP. The set
 * round-trip needs a live ACP session; when the probe set 409s (fresh
 * agent-server restart), the gate warms the session itself with a bare
 * POST /run - a no-LLM-turn re-initialization (see ensureLiveSession).
 *
 * Requires: node >= 20, playwright + chromium. Exits 0 only if every
 * counted gate passes.
 */
import { chromium } from "playwright";

const CANVAS_URL = (process.env.CANVAS_URL || "http://127.0.0.1:8010").replace(
  /\/$/,
  "",
);
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";
const CONVERSATION_ID =
  process.env.G8_CONVERSATION_ID || "0b3c2956-8e02-4605-a844-9dc45c00d0ca";

if (!BACKEND_API_KEY) {
  console.error("BACKEND_API_KEY is required (LOCAL_BACKEND_API_KEY).");
  process.exit(2);
}

const results = [];
const gate = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
};
const skip = (name, detail) => {
  console.log(`SKIP  ${name}  ${detail} (not counted)`);
};

async function api(method, path, { key = BACKEND_API_KEY, body } = {}) {
  const headers = {};
  if (key) headers["X-Session-API-Key"] = key;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${CANVAS_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await r.json();
  } catch {
    /* empty body */
  }
  return { status: r.status, data };
}

const setOption = (conversationId, configId, value, opts = {}) =>
  api("POST", `/api/conversations/${conversationId}/set_acp_config_option`, {
    body: { config_id: configId, value },
    ...opts,
  });

const readOptions = async (conversationId) => {
  const r = await api("GET", `/api/conversations/${conversationId}`);
  return { status: r.status, options: r.data?.config_options ?? null };
};

const nonModel = (options) => (options || []).filter((o) => o.id !== "model");

// -------------------------------------------------------------- G-fork-serving
async function gateForkServing() {
  const r = await fetch(`${CANVAS_URL}/openapi.json`);
  const spec = r.status === 200 ? await r.json() : null;
  const routeOk = Object.keys(spec?.paths ?? {}).some((p) =>
    p.endsWith("/set_acp_config_option"),
  );
  const schemaOk = Boolean(
    spec?.components?.schemas?.ConversationInfo?.properties?.config_options,
  );
  gate(
    "G-fork-serving",
    r.status === 200 && routeOk && schemaOk,
    `openapi=${r.status} route=${routeOk} schemaField=${schemaOk}`,
  );
}

// ------------------------------------------------------------- G-options-shape
async function gateOptionsShape() {
  const { status, options } = await readOptions(CONVERSATION_ID);
  const shapeOk =
    Array.isArray(options) &&
    options.length > 0 &&
    options.every(
      (o) =>
        typeof o.id === "string" &&
        o.id &&
        (o.type === "select" || o.type === "boolean") &&
        (o.type !== "select" ||
          (Array.isArray(o.choices) &&
            o.choices.length > 0 &&
            o.choices.every((c) => typeof c.value === "string"))),
    );
  const pillOptions = nonModel(options);
  const ok = status === 200 && shapeOk && pillOptions.length > 0;
  gate(
    "G-options-shape",
    ok,
    `status=${status} options=${(options || []).map((o) => `${o.id}:${o.type}`).join(",") || "none"} nonModel=${pillOptions.length}`,
  );
  return ok ? pillOptions : [];
}

// -------------------------------------------------------- session warm-up
/**
 * Config options are discovered from the RUNNING ACP session; after an
 * agent-server restart the subprocess is down and every set correctly 409s
 * (fork contract: pre-session set is a conflict, never a 500). A bare
 * POST /run re-initializes the ACP session without an LLM turn - run()
 * calls _ensure_agent_ready() (spawn + session/new|load) and the loop then
 * sees FINISHED and exits before any prompt. Not a counted gate: this is
 * environment preparation; a warm-up failure surfaces as G-set-api /
 * G-ui-select FAILs. The probe set re-sends the option's CURRENT value, so
 * it mutates nothing.
 */
async function ensureLiveSession(pillOptions) {
  const probe = pillOptions.find(
    (o) => o.type === "select" && (o.choices?.length ?? 0) >= 1,
  );
  if (!probe) return;
  const probeValue =
    typeof probe.current_value === "string"
      ? probe.current_value
      : probe.choices[0].value;
  const first = await setOption(CONVERSATION_ID, probe.id, probeValue);
  if (first.status !== 409) return; // already live (real defects stay G-set-api's job)
  console.log(
    "INFO  session warm-up: ACP session not started (set=409); POST /run to re-initialize",
  );
  const run = await api("POST", `/api/conversations/${CONVERSATION_ID}/run`);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120000) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const retry = await setOption(CONVERSATION_ID, probe.id, probeValue);
    if (retry.status !== 409) {
      console.log(
        `INFO  session warm-up: live after ${Math.round((Date.now() - startedAt) / 1000)}s (run=${run.status} probe=${retry.status})`,
      );
      return;
    }
  }
  console.log(
    `INFO  session warm-up: still 409 after 120s (run=${run.status}); set gates will fail`,
  );
}

// ------------------------------------------------------------------- G-set-api
async function gateSetApi(pillOptions) {
  const target = pillOptions.find(
    (o) => o.type === "select" && (o.choices?.length ?? 0) >= 2,
  );
  if (!target) {
    gate("G-set-api", false, "no select option with >=2 choices to exercise");
    return;
  }
  const original = target.current_value;
  const alternate = target.choices.find((c) => c.value !== original)?.value;

  const set = await setOption(CONVERSATION_ID, target.id, alternate);
  const after = await readOptions(CONVERSATION_ID);
  const changed =
    after.options?.find((o) => o.id === target.id)?.current_value === alternate;

  const restore = await setOption(CONVERSATION_ID, target.id, original);
  const afterRestore = await readOptions(CONVERSATION_ID);
  const restored =
    afterRestore.options?.find((o) => o.id === target.id)?.current_value ===
    original;

  // Fail-closed paths.
  const noKey = await setOption(CONVERSATION_ID, target.id, original, {
    key: "",
  });
  const badOption = await setOption(
    CONVERSATION_ID,
    `no-such-option-${Date.now()}`,
    "x",
  );
  const badConversation = await setOption(
    "00000000-0000-0000-0000-000000000000",
    target.id,
    original,
  );

  const ok =
    set.status === 200 &&
    changed &&
    restore.status === 200 &&
    restored &&
    (noKey.status === 401 || noKey.status === 403) &&
    badOption.status >= 400 &&
    badOption.status < 500 &&
    badConversation.status === 404;
  gate(
    "G-set-api",
    ok,
    `set(${target.id}=${alternate})=${set.status} changed=${changed} restored=${restored} noKey=${noKey.status} badOption=${badOption.status} badConversation=${badConversation.status}`,
  );
}

// ------------------------------------------------------------------ UI gates
const SKIP_ONBOARDING = `try {
  localStorage.setItem("openhands-onboarded", "1");
  localStorage.setItem("openhands-telemetry-consent", "denied");
  localStorage.setItem("openhands-backends", JSON.stringify([
    { id: "default-local", name: "Local", host: "${CANVAS_URL}", apiKey: ${JSON.stringify(BACKEND_API_KEY)}, kind: "local" },
  ]));
  localStorage.setItem("openhands-active-backend", JSON.stringify({ backendId: "default-local" }));
} catch {}`;

async function gateUi(pillOptions) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(SKIP_ONBOARDING);
    await page.goto(`${CANVAS_URL}/conversations/${CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // ------------------------------------------------------------ G-ui-pills
    let pillsOk = false;
    let pillDetail = "";
    try {
      await page.waitForSelector('[data-testid="chat-input-config-options"]', {
        timeout: 90000,
      });
      const seen = [];
      for (const option of pillOptions) {
        const visible = await page
          .getByTestId(`chat-input-config-option-${option.id}`)
          .isVisible();
        seen.push(`${option.id}=${visible}`);
      }
      const modelConfigPill = await page
        .locator('[data-testid="chat-input-config-option-model"]')
        .count();
      const modelChip = await page
        .locator('[data-testid="chat-input-llm-model"]')
        .count();
      pillsOk =
        seen.every((s) => s.endsWith("=true")) &&
        modelConfigPill === 0 &&
        modelChip >= 1;
      pillDetail = `pills=[${seen.join(",")}] modelConfigPill=${modelConfigPill} modelChip=${modelChip}`;
    } catch (error) {
      pillDetail = `container never rendered: ${String(error).slice(0, 120)}`;
    }
    gate("G-ui-pills", pillsOk, pillDetail);

    // ----------------------------------------------------------- G-ui-select
    const target = pillOptions.find(
      (o) => o.type === "select" && (o.choices?.length ?? 0) >= 2,
    );
    if (!pillsOk || !target) {
      gate("G-ui-select", false, "prerequisites unmet (pills or target)");
      return;
    }
    const original = target.current_value;
    const altChoice = target.choices.find((c) => c.value !== original);
    const altLabel = altChoice.name?.trim() ? altChoice.name : altChoice.value;
    let selectOk = false;
    let selectDetail = "";
    try {
      const pill = page.getByTestId(`chat-input-config-option-${target.id}`);
      await pill.click();
      await page.waitForSelector(
        `[data-testid="chat-input-config-option-${target.id}-popover"]`,
        { timeout: 15000 },
      );
      const choiceCount = await page
        .locator(
          `[data-testid^="chat-input-config-option-${target.id}-choice-"]`,
        )
        .count();
      await page
        .getByTestId(
          `chat-input-config-option-${target.id}-choice-${altChoice.value}`,
        )
        .click();
      // The mutation invalidates the conversation query; the pill re-labels
      // once the refetch lands.
      await page.waitForFunction(
        ([testId, label]) =>
          document
            .querySelector(`[data-testid="${testId}"]`)
            ?.textContent?.includes(label),
        [`chat-input-config-option-${target.id}`, altLabel],
        { timeout: 60000 },
      );
      const serverValue = (await readOptions(CONVERSATION_ID)).options?.find(
        (o) => o.id === target.id,
      )?.current_value;
      selectOk =
        choiceCount === target.choices.length &&
        serverValue === altChoice.value;
      selectDetail = `choices=${choiceCount}/${target.choices.length} uiRelabeled=true serverValue=${serverValue}`;
    } catch (error) {
      selectDetail = String(error).slice(0, 160);
    } finally {
      // Restore the original value via the API and verify (no residue).
      await setOption(CONVERSATION_ID, target.id, original);
      const restoredValue = (await readOptions(CONVERSATION_ID)).options?.find(
        (o) => o.id === target.id,
      )?.current_value;
      selectDetail += ` restored=${restoredValue === original}`;
      if (restoredValue !== original) selectOk = false;
    }
    gate("G-ui-select", selectOk, selectDetail);

    // ----------------------------------------------------------- G-ui-toggle
    const boolTarget = pillOptions.find((o) => o.type === "boolean");
    if (!boolTarget) {
      skip(
        "G-ui-toggle",
        "no boolean option advertised by this ACP server; covered by unit tests",
      );
    } else {
      let toggleOk = false;
      let toggleDetail = "";
      const before = boolTarget.current_value === true;
      try {
        await page
          .getByTestId(`chat-input-config-option-${boolTarget.id}`)
          .click();
        await page.waitForFunction(
          ([testId, pressed]) =>
            document
              .querySelector(`[data-testid="${testId}"]`)
              ?.getAttribute("aria-pressed") === pressed,
          [`chat-input-config-option-${boolTarget.id}`, String(!before)],
          { timeout: 60000 },
        );
        toggleOk = true;
        toggleDetail = `toggled ${boolTarget.id} ${before}->${!before}`;
      } catch (error) {
        toggleDetail = String(error).slice(0, 160);
      } finally {
        await setOption(CONVERSATION_ID, boolTarget.id, before);
      }
      gate("G-ui-toggle", toggleOk, toggleDetail);
    }
  } finally {
    await browser.close();
  }
}

const pillOptions = [];
await gateForkServing();
pillOptions.push(...(await gateOptionsShape()));
await ensureLiveSession(pillOptions);
await gateSetApi(pillOptions);
await gateUi(pillOptions);

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${failed.length === 0 ? "ALL GATES PASS" : `${failed.length} GATE(S) FAILED`} (${results.length} counted)`,
);
process.exit(failed.length === 0 ? 0 : 1);
