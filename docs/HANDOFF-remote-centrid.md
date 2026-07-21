# HANDOFF: Remote centrid access + Centri identity

Status: **PR A implementation complete — awaiting owner review.** Branch
`centri/remote-centrid`, worktree on VM at `/tmp/remote-centrid` (node_modules symlinked
to `~/u1-live/agent-canvas/node_modules`). Verified on the VM: `npm run typecheck` clean,
targeted vitest suites green (`__tests__/scripts/{ingress,static-server,
dev-with-automation,dev-static}.test.ts`, `__tests__/api/centri/`), `npm run build` OK.
PR B (Centri identity) is not started — see below.
Owner protocol: never touch the `HUMAN:` section of PR templates; no merge without owner
approval; squash-merge + delete branch.

## Problem (user laptop test, 2026-07-20)

Testing http://100.102.101.100:8010 (tailnet) from the laptop found 3 issues:

1. **Centri Settings/Memory pages error**: "Can't reach the Centri panel daemon."
   Root cause: frontend default centrid base URL is `http://127.0.0.1:6789`, which
   resolves to the *laptop's* loopback. centrid binds VM loopback only; its CORS
   allows loopback origins only. Worked on-VM, never remotely.
2. Still OpenHands logo/branding + document title.
3. No Memory entry in the main sidebar.

Interim workaround given to user:
`ssh -L 8010:127.0.0.1:8010 -L 6789:127.0.0.1:6789 ubuntu@150.136.127.246`, then browse
http://127.0.0.1:8010 (loopback origin satisfies centrid CORS).

## Fix design — PR A: same-origin proxy for centrid

centrid serves `/api/settings`, `/api/memory/...`, `/api/health` etc., which collide with
the existing `/api → agent-server` route, so it is mounted under `/centri` with the matched
prefix stripped before proxying. Ingress does longest-prefix matching, no rewrite —
strip support added in shared `scripts/proxy-utils.mjs`.

Chain: browser → `<origin>/centri/api/...` (same-origin, no CORS) → ingress strip-prefix
route → `http://127.0.0.1:6789/api/...`. Frontend learns the base URL `/centri` via
serve-time injection `window.__CENTRI_CENTRID_BASE_URL__` (seam already exists in
`src/api/centri/centri-config.ts`).

Decision: panel-token injection deliberately NOT included (mutations from laptop will show
the UI's 401/unauthorized state; reads work). Token stays loopback-only pending a §3.12
posture decision.

### DONE (committed here)

- `scripts/proxy-utils.mjs`: added `parseRouteTarget` (parses `;strip-prefix` flag,
  rejects unknown flags), `stripPathPrefix` (query-safe, always returns leading `/`),
  `createRewriteRouter` (longest-prefix, returns `{backend, url}`; default backend never
  strips; returns null on no match). `createRouter` untouched (other callers).
- `scripts/ingress.mjs`: switched to `createRewriteRouter`; HTTP + WebSocket handlers set
  `req.url = match.url` before proxying; help/docs updated.
- `scripts/static-server.mjs`: routes now go through `createRewriteRouter` (static
  handler stays the fallback; HTTP + upgrade handlers rewrite `req.url`); new
  `--centrid-base-url` arg → injected `window.__CENTRI_CENTRID_BASE_URL__` (wired
  through `makeConfigInjectionScript`, `serveInjectedIndexHtml`,
  `needsRuntimeInjection`); help text updated.
- `src/api/centri/centri-config.ts`: `normalizeBaseUrl` accepts path-relative values
  (`/centri`); doc comment updated.
- `scripts/dev-with-automation.mjs`: `buildConfig` gains `centridUrl` (CENTRID_URL env
  override, empty string disables, default loopback :6789); `CENTRI_ROUTE_PREFIX`
  constant; `getLocalServiceRoutes` pushes the strip-prefix `/centri` route (feeds both
  ingress and static-server); `startStaticFrontend` passes `--centrid-base-url /centri`.
- `scripts/dev-static.mjs`: same `/centri` route added by hand to its static-server and
  ingress args, plus `--centrid-base-url /centri`.
- Tests: `ingress.test.ts` strip-prefix suite (strip, query preservation, exact-match →
  `/`, longest-prefix precedence, no-strip default, unknown flag rejection);
  `static-server.test.ts` `--centrid-base-url` parse/injection suite + child-process
  strip-prefix proxy test (in-process proxying stalls under msw's interceptor — see
  comment in the test); new `centri-config.test.ts` (path-relative base URLs, env
  precedence, token seam); `dev-with-automation.test.ts` route-table assertions updated
  (`/centri` present in every launch mode, CENTRID_URL override/disable).

### Remaining (after owner approval + squash-merge)

Deploy: pull in `~/u1-live/agent-canvas`, `npm run build`, restart
`agent-canvas.service`, rerun `scripts/u1_browser_gate.mjs` (5/5 pattern in
docs/U1-Status.md), then user retests Settings → Centri / Memory from laptop at
http://100.102.101.100:8010.

## PR B (not started): Centri identity

- Logo: `src/assets/branding/openhands-logo{,-white}.svg` referenced from
  `src/components/features/sidebar/sidebar-rail-body.tsx`. **No Centri brand asset exists**
  (checked ~/centri) — use a clean text wordmark "Centri" (owner not yet asked about a
  logo; confirm or ship wordmark as swappable placeholder).
- Document title: grep for "OpenHands" in `index.html` / root route meta (not yet located).
- Sidebar: add Memory nav item (→ Memory settings page) in sidebar-rail-body.tsx; i18n
  label in all 15 locales per fork convention (`npm run make-i18n` after locale edits).
- Keep diff isolated for upstream-merge friendliness.

## Context

- VM: ssh ubuntu@150.136.127.246; deployed checkout `~/u1-live/agent-canvas` (main @
  142cddb0); service `agent-canvas.service`; centrid loopback :6789 (`centri up`);
  engine :6767. Port 8010 is tailnet-only (iptables verified).
- Only other open PR: centri #20 (docs, awaiting owner review).
- Local sandbox copies of edited files: /home/user/workspace/remote-centrid/.
