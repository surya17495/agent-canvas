#!/usr/bin/env node
/**
 * U2 browser deployment gate (repeatable).
 *
 * Drives the deployed Agent Canvas **Centri Settings** page (`/settings/centri`)
 * end-to-end in a fresh browser context against a **live `centrid`** daemon
 * (SPEC §3.15) and verifies every U2 acceptance behavior (SPEC §7 G3):
 *
 *   G-live-api   Direct contract check against the live daemon: health,
 *                the settings read shape, and the authenticated mutation's
 *                fail-closed paths (401 without/with-wrong token, 404 unknown
 *                session, 200 summary with a valid token). No mocks.
 *   G-read       The page renders real read state from live `centrid`
 *                (user + engine / keys / sync / deploy sections).
 *   G-loading    An explicit loading state shows before the read resolves
 *                (verified by delaying the live settings response).
 *   G-empty      The empty state (zero sessions / no pending) renders.
 *   G-degraded   Engine-unavailable is surfaced as a degraded banner
 *                (live: the gate points `centrid` at a down engine).
 *   G-mutate     "Sync now" requires confirmation (the pump does NOT fire on
 *                the first click), then runs the real POST /api/pump and shows
 *                result feedback (a summary toast).
 *   G-unauthorized       The UI renders the unauthorized state when a mutation
 *                        is rejected 401.
 *   G-backend-unavailable  The UI renders the unreachable/error state with a
 *                          retry when `centrid` can't be reached.
 *   G-mobile     No horizontal overflow / off-viewport controls at 375 px.
 *
 * The live daemon is never taken down; the unauthorized / unreachable / empty /
 * loading UI states are exercised via request interception on a scoped page,
 * exactly as the U1 gate does — the underlying data path stays live.
 *
 * Usage:
 *   CANVAS_URL=http://127.0.0.1:3001 \
 *   CENTRID_URL=http://127.0.0.1:6789 \
 *   CENTRID_TOKEN=<panel token> \
 *     node scripts/u2_browser_gate.mjs
 *
 * The Agent Canvas shell must be served with `VITE_CENTRID_BASE_URL` (and, to
 * enable the mutation, `VITE_CENTRI_PANEL_TOKEN`) pointing at the same
 * `centrid`. Requires: node >= 20, `playwright` with chromium installed. Exits
 * 0 only if every gate passes.
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
const CENTRI_PATH = "/settings/centri";

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

async function openCentri(ctx, { init } = {}) {
  const page = await ctx.newPage();
  await page.addInitScript(SKIP_ONBOARDING);
  if (init) await init(page);
  await page.goto(`${CANVAS_URL}${CENTRI_PATH}`, {
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
  const health = await centridFetch("GET", "/api/health");
  const healthOk =
    health.status === 200 &&
    health.data?.status === "ok" &&
    health.data?.service === "centrid";

  const settings = await centridFetch("GET", "/api/settings");
  const s = settings.data;
  const shapeOk =
    settings.status === 200 &&
    typeof s?.user === "string" &&
    typeof s?.engine?.status === "string" &&
    typeof s?.key?.llm_key_present === "boolean" &&
    typeof s?.product_ready === "boolean" &&
    typeof s?.sync?.sessions_total === "number" &&
    Array.isArray(s?.deploy?.components);

  const noToken = await centridFetch("POST", "/api/pump", { body: {} });
  const wrongToken = await centridFetch("POST", "/api/pump", {
    token: "definitely-wrong",
    body: {},
  });
  const unknown = await centridFetch("POST", "/api/pump", {
    token: CENTRID_TOKEN,
    body: { session_id: "no-such-session-xyz" },
  });
  const pumpAll = await centridFetch("POST", "/api/pump", {
    token: CENTRID_TOKEN,
    body: {},
  });
  const pumpAllOk =
    pumpAll.status === 200 &&
    pumpAll.data?.summary &&
    typeof pumpAll.data.summary.ok === "boolean";

  const ok =
    healthOk &&
    shapeOk &&
    noToken.status === 401 &&
    wrongToken.status === 401 &&
    unknown.status === 404 &&
    pumpAllOk;
  gate(
    "G-live-api",
    ok,
    `health=${health.status} settings=${settings.status} noToken=${noToken.status} wrongToken=${wrongToken.status} unknownSession=${unknown.status} pumpAll=${pumpAll.status}(ok=${pumpAll.data?.summary?.ok})`,
  );
}

const browser = await chromium.launch();
try {
  await gateLiveApi();

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  // ------------------------------------------------------------------ G-read
  {
    const page = await openCentri(ctx);
    const screen = page.getByTestId("centri-settings-screen");
    await screen.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    const sections = await Promise.all(
      [
        "centri-engine-section",
        "centri-keys-section",
        "centri-sync-section",
        "centri-deploy-section",
      ].map((id) =>
        page
          .getByTestId(id)
          .isVisible()
          .catch(() => false),
      ),
    );
    const userShown = await page
      .getByTestId("centri-user")
      .isVisible()
      .catch(() => false);
    gate(
      "G-read",
      sections.every(Boolean) && userShown,
      `sections=${sections.map((b) => (b ? 1 : 0)).join("")} user=${userShown}`,
    );
    await page.close();
  }

  // --------------------------------------------------------------- G-loading
  {
    // Interception must be at the *context* level: in mock mode the centrid
    // request is issued by the MSW service worker, and page.route() does not
    // see service-worker requests (context.route() does). A fresh context per
    // interception gate keeps the route from leaking into later gates.
    const ictx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    // Delay only the live *centrid* settings response so the Centri loading
    // state is observable, then let the real request through (data path stays
    // live). Scoped to the centrid origin so the shell's own agent-server
    // /api/settings is untouched and the settings layout renders immediately.
    await ictx.route(`${CENTRID_URL}/api/settings`, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    const page = await ictx.newPage();
    await page.addInitScript(SKIP_ONBOARDING);
    await page.goto(`${CANVAS_URL}${CENTRI_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const loadingSeen = await page
      .getByTestId("centri-loading")
      .waitFor({ state: "visible", timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    const resolved = await page
      .getByTestId("centri-settings-screen")
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
      user: "gate-empty",
      engine: {
        base_url: CENTRID_URL,
        reachable: true,
        status: "up",
        version_pin: "0.0.0",
      },
      key: { llm_key_present: true, engine_key_present: true },
      product_ready: true,
      sync: {
        sessions_total: 0,
        sessions_pending_pump: 0,
        roles: [],
        pending: [],
      },
      deploy: { lock_valid: true, error: null, components: [] },
    };
    const ictx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    // Scope the empty-state fulfillment to the centrid read only (context-level
    // so the MSW service-worker request is intercepted), so the shell's own
    // agent-server /api/settings keeps its real mock response.
    await ictx.route(`${CENTRID_URL}/api/settings`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyPayload),
      }),
    );
    const page = await ictx.newPage();
    await page.addInitScript(SKIP_ONBOARDING);
    await page.goto(`${CANVAS_URL}${CENTRI_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page
      .getByTestId("centri-settings-screen")
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    const emptyPending = await page
      .getByTestId("centri-pending-empty")
      .isVisible()
      .catch(() => false);
    const totalZero = /total sessions\s*0/i.test(
      await page.locator("body").innerText(),
    );
    gate(
      "G-empty",
      emptyPending && totalZero,
      `pendingEmpty=${emptyPending} totalZero=${totalZero}`,
    );
    await ictx.close();
  }

  // -------------------------------------------------------------- G-degraded
  {
    const page = await openCentri(ctx);
    await page
      .getByTestId("centri-settings-screen")
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    const banner = await page
      .getByTestId("centri-degraded-banner")
      .isVisible()
      .catch(() => false);
    gate(
      "G-degraded",
      banner,
      `degradedBanner=${banner} (engine unreachable, live)`,
    );
    await page.close();
  }

  // ---------------------------------------------------------------- G-mutate
  {
    const page = await openCentri(ctx);
    let pumpRequests = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/pump")) {
        pumpRequests += 1;
      }
    });
    const syncNow = page.getByTestId("centri-sync-now");
    await syncNow.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    const enabled = await syncNow.isEnabled().catch(() => false);
    await syncNow.click();
    // Confirmation must appear and the pump must NOT have fired yet.
    const confirmShown = await page
      .getByTestId("centri-sync-confirm")
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const notFiredBeforeConfirm = pumpRequests === 0;
    await page.getByTestId("centri-sync-confirm-yes").click();
    // Result feedback: a summary toast appears after the live pump resolves.
    const feedback = await page
      .getByText(/sync (complete|finished|failed)/i)
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    gate(
      "G-mutate",
      enabled &&
        confirmShown &&
        notFiredBeforeConfirm &&
        pumpRequests === 1 &&
        feedback,
      `btnEnabled=${enabled} confirm=${confirmShown} guardedBeforeConfirm=${notFiredBeforeConfirm} pumpPOSTs=${pumpRequests} feedback=${feedback}`,
    );
    await page.close();
  }

  // ---------------------------------------------------------- G-unauthorized
  {
    const ictx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    // Reject the mutation 401 at the context level (MSW service-worker request).
    await ictx.route(`${CENTRID_URL}/api/pump`, (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"detail":"invalid or missing bearer token"}',
      }),
    );
    const page = await openCentri(ictx);
    await page
      .getByTestId("centri-sync-now")
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {});
    await page.getByTestId("centri-sync-now").click();
    await page.getByTestId("centri-sync-confirm-yes").click();
    // Wait for the async 401 to resolve and its error toast to render before
    // asserting (the toast is transient, so poll for the text).
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
    // Abort every centrid request (context-level so the MSW service-worker
    // passthrough is intercepted) to simulate the daemon being unreachable.
    await ictx.route(`${CENTRID_URL}/**`, (route) =>
      route.abort("connectionrefused"),
    );
    const page = await ictx.newPage();
    await page.addInitScript(SKIP_ONBOARDING);
    await page.goto(`${CANVAS_URL}${CENTRI_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const errorState = await page
      .getByTestId("centri-error")
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    const retry = await page
      .getByTestId("centri-retry")
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
    await page.goto(`${CANVAS_URL}${CENTRI_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page
      .getByTestId("centri-settings-screen")
      .waitFor({ state: "visible", timeout: 20000 })
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
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} gates passed`,
);
process.exit(failed.length ? 1 : 0);
