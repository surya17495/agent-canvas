#!/usr/bin/env node
/**
 * U3 browser deployment gate (repeatable).
 *
 * Drives the deployed Agent Canvas **Memory** page (`/settings/memory`)
 * end-to-end in a fresh browser context against a **live `centrid`** daemon
 * (SPEC §3.15) and verifies every U3 acceptance behavior (SPEC §7 G3):
 *
 *   G-live-api   Direct contract check against the live daemon: the store
 *                list shape (frames_dir / roles / omitted engine_sections),
 *                reading a present and an absent store, and the authenticated
 *                mutation fail-closed paths — edit without a token (401) and
 *                with a wrong token (401), edit with a valid token (200) whose
 *                content the subsequent read reflects, forget (200), forgetting
 *                an already-gone store (404), and an invalid kind (422). No mocks.
 *   G-read       The page renders real browse state from live `centrid`
 *                (frames dir, at least one role card + store row, and the
 *                omitted engine-sections note).
 *   G-loading    An explicit loading state shows before the list resolves
 *                (verified by delaying the live stores response).
 *   G-empty      The empty state (no authored roles) renders.
 *   G-edit       Opening a store loads its live content; editing + Save runs
 *                the real PUT and shows the saved toast.
 *   G-forget     Forget requires confirmation (the DELETE does NOT fire on the
 *                first click), then runs the real DELETE and shows the
 *                forgotten toast.
 *   G-unauthorized       The UI surfaces the unauthorized state when a mutation
 *                        is rejected 401.
 *   G-backend-unavailable  The UI renders the unreachable/error state with a
 *                          retry when `centrid` can't be reached.
 *   G-mobile     No horizontal overflow / off-viewport controls at 375 px.
 *
 * The live daemon is never taken down; the unauthorized / unreachable / empty /
 * loading UI states are exercised via request interception on a scoped page,
 * exactly as the U2 gate does — the underlying data path stays live. Before the
 * browser gates run, the gate seeds two authored stores on disk through the
 * live API (a `rules` store to browse/edit and an `identity` store to forget),
 * so G-read / G-edit / G-forget have deterministic real targets.
 *
 * Usage:
 *   CANVAS_URL=http://127.0.0.1:3001 \
 *   CENTRID_URL=http://127.0.0.1:6789 \
 *   CENTRID_TOKEN=<panel token> \
 *   GATE_ROLE=gate-writer \
 *     node scripts/u3_browser_gate.mjs
 *
 * The Agent Canvas shell must be served with `VITE_CENTRID_BASE_URL` (and, to
 * enable mutations, `VITE_CENTRI_PANEL_TOKEN`) pointing at the same `centrid`.
 * Requires: node >= 20, `playwright` with chromium installed. Exits 0 only if
 * every gate passes.
 */
import { chromium } from "playwright";

const CANVAS_URL = (process.env.CANVAS_URL || "http://127.0.0.1:3001").replace(
  /\/$/,
  "",
);
const CENTRID_URL = (
  process.env.CENTRID_URL || "http://127.0.0.1:6789"
).replace(/\/$/, "");
const CENTRID_TOKEN = process.env.CENTRID_TOKEN || "";
const GATE_ROLE = process.env.GATE_ROLE || "gate-writer";
const MEMORY_PATH = "/settings/memory";

const results = [];
const gate = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
};

async function centridFetch(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${CENTRID_URL}${path}`, {
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

const storePath = (role, kind) =>
  `/api/memory/stores/${encodeURIComponent(role)}/${encodeURIComponent(kind)}`;

// Skip onboarding and seed a backend so the settings route renders directly
// (the shell blocks settings until an agent-server backend is configured).
const SKIP_ONBOARDING = `try {
  localStorage.setItem("openhands-onboarded", "1");
  localStorage.setItem("openhands-telemetry-consent", "denied");
  localStorage.setItem("openhands-backends", JSON.stringify([
    { id: "default-local", name: "Local", host: "${CANVAS_URL}", apiKey: "gate-key", kind: "local" },
  ]));
  localStorage.setItem("openhands-active-backend", JSON.stringify({ backendId: "default-local" }));
} catch {}`;

async function openMemory(ctx, { init } = {}) {
  const page = await ctx.newPage();
  await page.addInitScript(SKIP_ONBOARDING);
  if (init) await init(page);
  await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  return page;
}

async function bodyText(page) {
  return (await page.locator("body").innerText()).toLowerCase();
}

// ---------------------------------------------------------------- G-live-api
async function gateLiveApi() {
  // Start from a clean slate for the two gate stores.
  await centridFetch("DELETE", storePath(GATE_ROLE, "rules"), {
    token: CENTRID_TOKEN,
  });
  await centridFetch("DELETE", storePath(GATE_ROLE, "identity"), {
    token: CENTRID_TOKEN,
  });

  // Absent read: a not-yet-authored store is a valid empty state, not an error.
  const absent = await centridFetch("GET", storePath(GATE_ROLE, "rules"));
  const absentOk =
    absent.status === 200 &&
    absent.data?.store?.present === false &&
    absent.data?.content === "";

  // Fail-closed mutation paths (SPEC §3.15): no token / wrong token → 401.
  const noToken = await centridFetch("PUT", storePath(GATE_ROLE, "rules"), {
    body: { content: "x" },
  });
  const wrongToken = await centridFetch("PUT", storePath(GATE_ROLE, "rules"), {
    token: "definitely-wrong",
    body: { content: "x" },
  });

  // Authenticated edit creates the store; the read then reflects it.
  const seedContent = "Be concise. Cite sources.";
  const edit = await centridFetch("PUT", storePath(GATE_ROLE, "rules"), {
    token: CENTRID_TOKEN,
    body: { content: seedContent },
  });
  const readBack = await centridFetch("GET", storePath(GATE_ROLE, "rules"));
  const editOk =
    edit.status === 200 &&
    edit.data?.store?.present === true &&
    readBack.status === 200 &&
    readBack.data?.content === seedContent;

  // List shape: frames_dir + roles[] + omitted engine_sections[] (never mocked).
  const list = await centridFetch("GET", "/api/memory/stores");
  const l = list.data;
  const listOk =
    list.status === 200 &&
    typeof l?.frames_dir === "string" &&
    Array.isArray(l?.roles) &&
    Array.isArray(l?.engine_sections) &&
    l.engine_sections.length > 0 &&
    l.engine_sections.every(
      (s) => typeof s?.name === "string" && typeof s?.reason === "string",
    ) &&
    l.roles.some(
      (r) =>
        r.role === GATE_ROLE &&
        Array.isArray(r.stores) &&
        r.stores.some((s) => s.kind === "rules" && s.present === true),
    );

  // Forget: 200 first time, 404 when it is already gone.
  const forget = await centridFetch("DELETE", storePath(GATE_ROLE, "rules"), {
    token: CENTRID_TOKEN,
  });
  const forgetAgain = await centridFetch(
    "DELETE",
    storePath(GATE_ROLE, "rules"),
    { token: CENTRID_TOKEN },
  );
  const forgetOk =
    forget.status === 200 &&
    forget.data?.forgotten === true &&
    forgetAgain.status === 404;

  // Invalid kind → 422 (fail closed on bad input).
  const badKind = await centridFetch(
    "GET",
    storePath(GATE_ROLE, "not-a-kind"),
  );

  const ok =
    absentOk &&
    noToken.status === 401 &&
    wrongToken.status === 401 &&
    editOk &&
    listOk &&
    forgetOk &&
    badKind.status === 422;
  gate(
    "G-live-api",
    ok,
    `absent=${absent.status}(present=${absent.data?.store?.present}) noToken=${noToken.status} wrongToken=${wrongToken.status} edit=${edit.status} readBack=${readBack.status}(match=${readBack.data?.content === seedContent}) list=${list.status}(shape=${listOk}) forget=${forget.status} forgetAgain=${forgetAgain.status} badKind=${badKind.status}`,
  );
}

// Seed the two authored stores the browser gates depend on (real files on disk).
async function seedStores() {
  await centridFetch("PUT", storePath(GATE_ROLE, "rules"), {
    token: CENTRID_TOKEN,
    body: { content: "Be concise." },
  });
  await centridFetch("PUT", storePath(GATE_ROLE, "identity"), {
    token: CENTRID_TOKEN,
    body: { content: "A precise editor." },
  });
}

const browser = await chromium.launch();
try {
  await gateLiveApi();
  await seedStores();

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  // ------------------------------------------------------------------ G-read
  {
    const page = await openMemory(ctx);
    const screen = page.getByTestId("centri-memory-screen");
    await screen.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    const roleCard = await page
      .getByTestId(`centri-memory-role-${GATE_ROLE}`)
      .isVisible()
      .catch(() => false);
    const storeRow = await page
      .getByTestId(`centri-memory-store-${GATE_ROLE}-rules`)
      .isVisible()
      .catch(() => false);
    const engineNote = await page
      .getByTestId("centri-memory-engine-sections")
      .isVisible()
      .catch(() => false);
    const framesDir = /frames directory/i.test(await bodyText(page));
    gate(
      "G-read",
      roleCard && storeRow && engineNote && framesDir,
      `roleCard=${roleCard} storeRow=${storeRow} engineNote=${engineNote} framesDir=${framesDir}`,
    );
    await page.close();
  }

  // --------------------------------------------------------------- G-loading
  {
    // Context-level interception: in mock mode the centrid request is issued by
    // the MSW service worker, which page.route() cannot see (context.route can).
    const ictx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await ictx.route(`${CENTRID_URL}/api/memory/stores`, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    const page = await ictx.newPage();
    await page.addInitScript(SKIP_ONBOARDING);
    await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const loadingSeen = await page
      .getByTestId("centri-memory-loading")
      .waitFor({ state: "visible", timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    const resolved = await page
      .getByTestId("centri-memory-screen")
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    gate(
      "G-loading",
      loadingSeen && resolved,
      `loading=${loadingSeen} resolved=${resolved}`,
    );
    await ictx.close();
  }

  // ----------------------------------------------------------------- G-empty
  {
    const emptyPayload = {
      frames_dir: "/home/gate/.centri/frames",
      roles: [],
      engine_sections: [],
    };
    const ictx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await ictx.route(`${CENTRID_URL}/api/memory/stores`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyPayload),
      }),
    );
    const page = await ictx.newPage();
    await page.addInitScript(SKIP_ONBOARDING);
    await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const emptySeen = await page
      .getByTestId("centri-memory-empty")
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    gate("G-empty", emptySeen, `empty=${emptySeen}`);
    await ictx.close();
  }

  // ------------------------------------------------------------------ G-edit
  {
    const page = await openMemory(ctx);
    let putRequests = 0;
    page.on("request", (req) => {
      if (
        req.method() === "PUT" &&
        req.url().includes("/api/memory/stores/")
      ) {
        putRequests += 1;
      }
    });
    await page
      .getByTestId(`centri-memory-open-${GATE_ROLE}-rules`)
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    await page.getByTestId(`centri-memory-open-${GATE_ROLE}-rules`).click();
    const textarea = page.getByTestId("centri-memory-content");
    await textarea.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    const loadedLive = (await textarea.inputValue().catch(() => "")).includes(
      "Be concise.",
    );
    await textarea.click();
    await textarea.type(" Cite sources.");
    await page.getByTestId("centri-memory-save").click();
    const savedToast = await page
      .getByText(/memory saved/i)
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    gate(
      "G-edit",
      loadedLive && putRequests === 1 && savedToast,
      `loadedLive=${loadedLive} putPUTs=${putRequests} savedToast=${savedToast}`,
    );
    await page.close();
  }

  // ---------------------------------------------------------------- G-forget
  {
    const page = await openMemory(ctx);
    let deleteRequests = 0;
    page.on("request", (req) => {
      if (
        req.method() === "DELETE" &&
        req.url().includes("/api/memory/stores/")
      ) {
        deleteRequests += 1;
      }
    });
    await page
      .getByTestId(`centri-memory-open-${GATE_ROLE}-identity`)
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    await page.getByTestId(`centri-memory-open-${GATE_ROLE}-identity`).click();
    await page
      .getByTestId("centri-memory-content")
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});
    // Forget requires confirmation: the DELETE must NOT fire on the first click.
    await page.getByTestId("centri-memory-forget").click();
    const confirmShown = await page
      .getByTestId("centri-memory-forget-confirm")
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const notFiredBeforeConfirm = deleteRequests === 0;
    await page.getByTestId("centri-memory-forget-yes").click();
    const forgotToast = await page
      .getByText(/memory forgotten/i)
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    gate(
      "G-forget",
      confirmShown &&
        notFiredBeforeConfirm &&
        deleteRequests === 1 &&
        forgotToast,
      `confirm=${confirmShown} guardedBeforeConfirm=${notFiredBeforeConfirm} deletePOSTs=${deleteRequests} forgotToast=${forgotToast}`,
    );
    await page.close();
  }

  // ---------------------------------------------------------- G-unauthorized
  {
    const ictx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    // Reject the edit mutation 401 at the context level (MSW service-worker).
    await ictx.route(`${CENTRID_URL}/api/memory/stores/**`, (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: '{"detail":"invalid or missing bearer token"}',
        });
      }
      return route.continue();
    });
    const page = await openMemory(ictx);
    await page
      .getByTestId(`centri-memory-open-${GATE_ROLE}-rules`)
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    await page.getByTestId(`centri-memory-open-${GATE_ROLE}-rules`).click();
    const textarea = page.getByTestId("centri-memory-content");
    await textarea.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await textarea.click();
    await textarea.type(" tweak.");
    await page.getByTestId("centri-memory-save").click();
    const unauthShown = await page
      .getByText(/token is missing or invalid/i)
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    gate("G-unauthorized", unauthShown, `unauthorizedFeedback=${unauthShown}`);
    await ictx.close();
  }

  // ------------------------------------------------------- G-backend-unavailable
  {
    const ictx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await ictx.route(`${CENTRID_URL}/**`, (route) =>
      route.abort("connectionrefused"),
    );
    const page = await ictx.newPage();
    await page.addInitScript(SKIP_ONBOARDING);
    await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const errorState = await page
      .getByTestId("centri-memory-error")
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    const retry = await page
      .getByTestId("centri-memory-retry")
      .isVisible()
      .catch(() => false);
    const unreachableMsg = /can't reach the centri panel daemon/i.test(
      await bodyText(page),
    );
    gate(
      "G-backend-unavailable",
      errorState && retry && unreachableMsg,
      `errorState=${errorState} retry=${retry} unreachableMsg=${unreachableMsg}`,
    );
    await ictx.close();
  }

  // ----------------------------------------------------------------- G-mobile
  {
    const page = await ctx.newPage();
    await page.addInitScript(SKIP_ONBOARDING);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page
      .getByTestId("centri-memory-screen")
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    // Open the editor too, so its controls are included in the overflow check.
    await page
      .getByTestId(`centri-memory-open-${GATE_ROLE}-rules`)
      .click()
      .catch(() => {});
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const d = document.documentElement;
      const offenders = [...document.querySelectorAll("*")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > 376 || r.left < -1);
      }).length;
      return { sw: d.scrollWidth, cw: d.clientWidth, offenders };
    });
    gate(
      "G-mobile",
      m.sw <= m.cw && m.offenders === 0,
      `scrollWidth=${m.sw} clientWidth=${m.cw} offenders=${m.offenders}`,
    );
    await page.close();
  }
} finally {
  // Best-effort cleanup of the gate's authored stores.
  await centridFetch("DELETE", storePath(GATE_ROLE, "rules"), {
    token: CENTRID_TOKEN,
  }).catch(() => {});
  await centridFetch("DELETE", storePath(GATE_ROLE, "identity"), {
    token: CENTRID_TOKEN,
  }).catch(() => {});
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} gates passed`,
);
process.exit(failed.length ? 1 : 0);
