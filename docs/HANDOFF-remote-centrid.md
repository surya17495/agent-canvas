# HANDOFF: Remote centrid access + Centri identity (WIP)

Status: **IN PROGRESS — do not merge.** Branch `centri/remote-centrid`, worktree on VM at
`/tmp/remote-centrid` (node_modules symlinked to `~/u1-live/agent-canvas/node_modules`).
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

### TODO (in order)

1. `scripts/static-server.mjs`:
   - `startStaticServer` (~line 541): switch `createRouter(config.routes)` →
     `createRewriteRouter(config.routes)` (no default arg — static handler is the
     fallback); in both the request handler and `upgrade` handler, when match non-null set
     `req.url = match.url` then proxy to `match.backend`.
   - New arg `--centrid-base-url <url-or-path>` → `config.centridBaseUrl` (default null)
     → `injectionOpts.centridBaseUrl` → `makeConfigInjectionScript` emits
     `window.__CENTRI_CENTRID_BASE_URL__=<JSON.stringify(value)>;` → include in
     `needsRuntimeInjection`. Update help text. Note: `makeConfigInjectionScript` takes
     positional args; `serveInjectedIndexHtml` destructures an opts object — add the new
     field to both.
2. `src/api/centri/centri-config.ts` `normalizeBaseUrl`: accept path-relative values —
   after trimming trailing slashes, `if (trimmed.startsWith("/")) return trimmed;` before
   the `https?://` test ("/" alone already normalizes to null). Update file doc comment.
   `centri-service.api.ts` concatenates `${getCentridBaseUrl()}${path}` so `/centri` works
   as-is.
3. `scripts/dev-with-automation.mjs` (THE production path — `bin/agent-canvas.mjs` calls
   its `main({staticMode:true})`):
   - `buildConfig` (~line 328, return ~419): add `centridUrl`: `env.CENTRID_URL === undefined
     ? "http://127.0.0.1:6789" : (env.CENTRID_URL.trim() || null)` (empty string disables).
   - `getLocalServiceRoutes` (~line 653): when `config.centridUrl`, push
     `["/centri", `${config.centridUrl};strip-prefix`]`. This feeds BOTH `startIngress`
     (~line 915) and the static-server `--route` args (~line 1395) automatically.
   - `startStaticFrontend` (~line 1357): add `...(config.centridUrl ?
     ["--centrid-base-url", "/centri"] : [])`.
   - Define `const CENTRI_ROUTE_PREFIX = "/centri"` next to `AUTOMATION_ROUTE_PREFIX`.
4. `scripts/dev-static.mjs`: mirrors the route tables by hand — add the same `/centri`
   route to `startStaticServer` args (~line 384) and `startIngress` args (~line 431), plus
   `--centrid-base-url /centri`. It imports `buildConfig` from dev-with-automation so
   `config.centridUrl` is available.
5. Tests (existing files):
   - `__tests__/scripts/ingress.test.ts` — add strip-prefix routing cases (match/strip,
     query preservation, `/centri` exact → `/`, longest-prefix still wins, unknown flag
     throws).
   - `__tests__/scripts/static-server.test.ts` — `--centrid-base-url` parse + injection
     (script contains window key) + needsRuntimeInjection.
   - `__tests__/api/centri/centri-service.test.ts` — relative base URL cases for
     `getCentridBaseUrl` via injected window key.
   - CHECK `__tests__/scripts/dev-with-automation.test.ts` and `dev-static.test.ts` for
     route-table assertions that now need `/centri` (getLocalServiceRoutes is exported and
     likely asserted).
6. Verify on VM worktree: `npm run typecheck`, targeted `npx vitest run __tests__/scripts
   __tests__/api/centri`, `npm run build`. Full suite needs
   `OH_CANVAS_SAFE_STATE_DIR=/tmp/...`. Open PR A (respect HUMAN: template section — do
   not fill/edit it). After owner approval + squash-merge: pull in `~/u1-live/agent-canvas`,
   `npm run build`, restart `agent-canvas.service`, rerun
   `scripts/u1_browser_gate.mjs` (5/5 pattern in docs/U1-Status.md), then user retests
   Settings → Centri / Memory from laptop at http://100.102.101.100:8010.

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
