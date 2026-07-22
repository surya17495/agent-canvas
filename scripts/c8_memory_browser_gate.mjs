#!/usr/bin/env node
/**
 * C8 browser deployment gate (repeatable).
 *
 * Drives the deployed Agent Canvas **Memory** page (`/memory` — C8: graph view
 * + editable memory blocks, SPEC §2 C8 / §3.10 / §3.12) end-to-end in a fresh
 * browser context against the **live serving topology** (shell + same-origin
 * `/centri` proxy + live `centrid` + pinned engine) and verifies:
 *
 *   G-live-api    Direct contract check against live `centrid`: graph feed
 *                 shape (`GET /api/memory/graph` — documents[] with id +
 *                 memoryEntries[]), fail-closed mutations (no token / wrong
 *                 token → 401, invalid body → 422), then a real spine-first
 *                 create (201, spine_event_id) → revise (PATCH) → forget
 *                 (DELETE, forgotten:true) round-trip with cleanup. No mocks.
 *   G-graph       The live `/memory` page renders the graph panel (canvas
 *                 present, no error boundary, no "not iterable" regression —
 *                 the PR #13 lib-shape adapter working against real data).
 *   G-blocks      The editable-blocks panel + add-memory form render.
 *   G-proxy-auth  §3.12 posture in the real browser: the page reports
 *                 server-side proxy auth (window.__CENTRI_PANEL_PROXY_AUTH__),
 *                 no mutations-disabled banner, and an in-page mutation via the
 *                 same-origin proxy is authenticated (422 on invalid body,
 *                 never 401) while the token never appears in the page.
 *   G-add-ui      The add-memory form runs the real POST through the proxy
 *                 (201 + spine_event_id), and the gate forgets the created
 *                 memory afterwards (cleanup via the authenticated API).
 *   G-loading     An explicit loading state shows before the graph resolves
 *                 (verified by delaying the live graph response).
 *   G-empty       Zero documents renders the explicit empty state, not a
 *                 crash (graph response fulfilled with an empty page).
 *   G-backend-unavailable  The UI renders the error state when the graph
 *                 feed is unreachable (request aborted at the boundary).
 *   G-mobile      No horizontal overflow at 375 px.
 *
 * The live daemon/engine are never taken down; loading/empty/unavailable are
 * exercised via request interception on a scoped page, exactly like the U2/U3
 * gates — the underlying data path stays live.
 *
 * Usage:
 *   CANVAS_URL=http://127.0.0.1:8010 \
 *   CENTRID_URL=http://127.0.0.1:6789 \
 *   CENTRID_TOKEN=<panel token> \
 *   BACKEND_API_KEY=<agent-server session key (LOCAL_BACKEND_API_KEY)> \
 *   GATE_ROLE=gate-writer \
 *     node scripts/c8_memory_browser_gate.mjs
 *
 * BACKEND_API_KEY must be the deployment's real session key: the shell
 * health-checks the seeded backend and refuses to render the app shell
 * behind a bogus key (observed live — it lands on "Add a backend").
 *
 * Requires: node >= 20, `playwright` with chromium installed. Exits 0 only if
 * every gate passes.
 */
import { chromium } from "playwright";

const CANVAS_URL = (process.env.CANVAS_URL || "http://127.0.0.1:8010").replace(
  /\/$/,
  "",
);
const CENTRID_URL = (
  process.env.CENTRID_URL || "http://127.0.0.1:6789"
).replace(/\/$/, "");
const CENTRID_TOKEN = process.env.CENTRID_TOKEN || "";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";
const GATE_ROLE = process.env.GATE_ROLE || "gate-writer";
const MEMORY_PATH = "/memory";
const GRAPH_ROUTE = "**/centri/api/memory/graph*";

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

const enginePath = (role, memoryId) =>
  `/api/memory/engine/${encodeURIComponent(role)}${
    memoryId ? `/${encodeURIComponent(memoryId)}` : ""
  }`;

// Skip onboarding and seed a backend so the /memory route renders directly
// (same pattern as the U2/U3 gates).
const SKIP_ONBOARDING = `try {
  localStorage.setItem("openhands-onboarded", "1");
  localStorage.setItem("openhands-telemetry-consent", "denied");
  localStorage.setItem("openhands-backends", JSON.stringify([
    { id: "default-local", name: "Local", host: "${CANVAS_URL}", apiKey: ${JSON.stringify(BACKEND_API_KEY)}, kind: "local" },
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

// ---------------------------------------------------------------- G-live-api
async function gateLiveApi() {
  // Graph feed contract (the exact shape PR #13 adapts for the graph lib).
  const graph = await centridFetch("GET", "/api/memory/graph");
  const g = graph.data;
  const graphOk =
    graph.status === 200 &&
    typeof g?.user === "string" &&
    Array.isArray(g?.roles) &&
    Array.isArray(g?.documents) &&
    g.documents.every(
      (d) => typeof d?.id === "string" && Array.isArray(d?.memoryEntries),
    );

  // Fail-closed mutation paths (§3.10/§3.15): no token / wrong token → 401.
  const spec = { memories: [{ content: `c8 gate probe ${Date.now()}` }] };
  const noToken = await centridFetch("POST", enginePath(GATE_ROLE), {
    body: spec,
  });
  const wrongToken = await centridFetch("POST", enginePath(GATE_ROLE), {
    token: "definitely-wrong",
    body: spec,
  });
  // Invalid body with a valid token → 422 (validated, not dropped).
  const badBody = await centridFetch("POST", enginePath(GATE_ROLE), {
    token: CENTRID_TOKEN,
    body: {},
  });

  // Real spine-first round-trip: create → revise → forget (with cleanup).
  const created = await centridFetch("POST", enginePath(GATE_ROLE), {
    token: CENTRID_TOKEN,
    body: spec,
  });
  const createdId = created.data?.memories?.[0]?.id ?? null;
  const createOk =
    created.status === 201 &&
    typeof created.data?.spine_event_id === "number" &&
    typeof createdId === "string";

  let reviseOk = false;
  let forgetOk = false;
  if (createdId) {
    const revised = await centridFetch(
      "PATCH",
      enginePath(GATE_ROLE, createdId),
      { token: CENTRID_TOKEN, body: { new_content: "c8 gate probe (revised)" } },
    );
    const revisedId = revised.data?.memory?.id ?? createdId;
    reviseOk =
      revised.status === 200 &&
      typeof revised.data?.spine_event_id === "number";
    const forgotten = await centridFetch(
      "DELETE",
      enginePath(GATE_ROLE, revisedId),
      { token: CENTRID_TOKEN },
    );
    forgetOk =
      forgotten.status === 200 && forgotten.data?.forgotten === true;
    // Best-effort cleanup of the pre-revision version too (idempotent).
    if (revisedId !== createdId) {
      await centridFetch("DELETE", enginePath(GATE_ROLE, createdId), {
        token: CENTRID_TOKEN,
      });
    }
  }

  const ok =
    graphOk &&
    noToken.status === 401 &&
    wrongToken.status === 401 &&
    badBody.status === 422 &&
    createOk &&
    reviseOk &&
    forgetOk;
  gate(
    "G-live-api",
    ok,
    `graph=${graph.status} shapeOk=${graphOk} noToken=${noToken.status} wrongToken=${wrongToken.status} badBody=${badBody.status} create=${created.status} reviseOk=${reviseOk} forgetOk=${forgetOk}`,
  );
}

// ------------------------------------------------------------------- browser
async function gateGraph(ctx) {
  const page = await openMemory(ctx);
  await page.waitForSelector('[data-testid="memory-graph-panel"]', {
    timeout: 30000,
  });
  // Give the lib a beat to mount its canvas.
  await page
    .waitForSelector('[data-testid="memory-graph-panel"] canvas', {
      timeout: 15000,
    })
    .catch(() => {});
  const state = await page.evaluate(() => ({
    hasCanvas: !!document.querySelector(
      '[data-testid="memory-graph-panel"] canvas',
    ),
    hasError: !!document.querySelector('[data-testid="memory-graph-error"]'),
    notIterable: document.body.innerText.includes("not iterable"),
  }));
  const ok = state.hasCanvas && !state.hasError && !state.notIterable;
  gate(
    "G-graph",
    ok,
    `canvas=${state.hasCanvas} error=${state.hasError} notIterable=${state.notIterable}`,
  );
  await page.close();
  return ok;
}

async function gateBlocksAndProxyAuth(ctx) {
  const page = await openMemory(ctx);
  await page.waitForSelector('[data-testid="engine-memories-panel"]', {
    timeout: 30000,
  });
  const blocks = await page.evaluate(() => ({
    panel: !!document.querySelector('[data-testid="engine-memories-panel"]'),
    addForm: !!document.querySelector('[data-testid="engine-memory-add"]'),
    addInput: !!document.querySelector(
      '[data-testid="engine-memory-add-input"]',
    ),
    roleFilter: !!document.querySelector('[data-testid="memory-role-filter"]'),
  }));
  const blocksOk =
    blocks.panel && blocks.addForm && blocks.addInput && blocks.roleFilter;
  gate(
    "G-blocks",
    blocksOk,
    `panel=${blocks.panel} addForm=${blocks.addForm} addInput=${blocks.addInput} roleFilter=${blocks.roleFilter}`,
  );

  // §3.12 posture, as observed by the real page.
  const auth = await page.evaluate(async () => {
    const proxyAuth = window.__CENTRI_PANEL_PROXY_AUTH__ === true;
    const banner = !!document.querySelector(
      '[data-testid="memory-mutations-disabled-banner"]',
    );
    // Invalid body through the same-origin proxy: bearer must be injected
    // server-side, so centrid validates (422) instead of rejecting auth (401).
    const r = await fetch("/centri/api/memory/engine/c8-gate-proxy-probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const tokenLeaked =
      document.documentElement.outerHTML.includes("CENTRI_PANEL_TOKEN=") ||
      Object.keys(localStorage).some((k) =>
        (localStorage.getItem(k) || "").includes("centri-panel-token"),
      );
    return { proxyAuth, banner, mutStatus: r.status, tokenLeaked };
  });
  const authOk =
    auth.proxyAuth &&
    !auth.banner &&
    auth.mutStatus === 422 &&
    !auth.tokenLeaked;
  gate(
    "G-proxy-auth",
    authOk,
    `proxyAuth=${auth.proxyAuth} banner=${auth.banner} invalidBodyViaProxy=${auth.mutStatus} tokenLeaked=${auth.tokenLeaked}`,
  );
  await page.close();
}

async function gateAddUi(ctx) {
  const page = await openMemory(ctx);
  await page.waitForSelector('[data-testid="engine-memory-add-input"]', {
    timeout: 30000,
  });
  const content = `c8 gate ui memory ${Date.now()}`;
  await page.fill('[data-testid="engine-memory-add-input"]', content);
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/centri/api/memory/engine/") &&
        r.request().method() === "POST",
      { timeout: 20000 },
    ),
    // `engine-memory-add` is the form container; the real button is inside.
    page.click('[data-testid="engine-memory-add"] button'),
  ]);
  let body = null;
  try {
    body = await resp.json();
  } catch {
    /* ignore */
  }
  const createdId = body?.memories?.[0]?.id ?? null;
  const role = body?.role ?? null;
  const ok =
    resp.status() === 201 &&
    typeof body?.spine_event_id === "number" &&
    typeof createdId === "string";
  gate(
    "G-add-ui",
    ok,
    `post=${resp.status()} spineEvent=${body?.spine_event_id} id=${createdId}`,
  );
  // Cleanup: forget the UI-created memory through the authenticated API.
  if (createdId && role) {
    await centridFetch("DELETE", enginePath(role, createdId), {
      token: CENTRID_TOKEN,
    });
  }
  await page.close();
}

async function gateLoading(ctx) {
  const page = await ctx.newPage();
  await page.addInitScript(SKIP_ONBOARDING);
  await page.route(GRAPH_ROUTE, async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const sawLoading = await page
    .waitForSelector('[data-testid="memory-page-loading"]', { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  gate("G-loading", sawLoading, `loadingState=${sawLoading}`);
  await page.close();
}

async function gateEmpty(ctx) {
  const page = await ctx.newPage();
  await page.addInitScript(SKIP_ONBOARDING);
  await page.route(GRAPH_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: "gate",
        roles: [],
        container_tags: [],
        documents: [],
        pagination: { currentPage: 1, totalPages: 1, totalItems: 0, limit: 50 },
      }),
    }),
  );
  await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const sawEmpty = await page
    .waitForSelector('[data-testid="engine-memories-empty"]', {
      timeout: 15000,
    })
    .then(() => true)
    .catch(() => false);
  const crashed = await page.evaluate(() =>
    document.body.innerText.includes("not iterable"),
  );
  gate("G-empty", sawEmpty && !crashed, `empty=${sawEmpty} crashed=${crashed}`);
  await page.close();
}

async function gateBackendUnavailable(ctx) {
  const page = await ctx.newPage();
  await page.addInitScript(SKIP_ONBOARDING);
  await page.route(GRAPH_ROUTE, (route) => route.abort("connectionrefused"));
  await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const sawError = await page
    .waitForSelector('[data-testid="memory-graph-error"]', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  gate("G-backend-unavailable", sawError, `errorState=${sawError}`);
  await page.close();
}

async function gateMobile(ctx) {
  const page = await ctx.newPage();
  await page.addInitScript(SKIP_ONBOARDING);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${CANVAS_URL}${MEMORY_PATH}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForSelector('[data-testid="memory-page"]', {
    timeout: 30000,
  });
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
  const ok = overflow.scroll <= overflow.client + 1;
  gate(
    "G-mobile",
    ok,
    `scrollWidth=${overflow.scroll} clientWidth=${overflow.client}`,
  );
  await page.close();
}

// ----------------------------------------------------------------------- run
(async () => {
  if (!CENTRID_TOKEN || !BACKEND_API_KEY) {
    console.error(
      "CENTRID_TOKEN and BACKEND_API_KEY are required (fail-closed: not defaulted).",
    );
    process.exit(2);
  }
  await gateLiveApi();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await gateGraph(ctx);
    await gateBlocksAndProxyAuth(ctx);
    await gateAddUi(ctx);
    await gateLoading(ctx);
    await gateEmpty(ctx);
    await gateBackendUnavailable(ctx);
    await gateMobile(ctx);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} gates passed`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
})();
