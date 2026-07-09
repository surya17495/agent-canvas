# Extension System Issues & Proposals

This directory contains detailed issue documents for planned improvements to the Agent Canvas
extension system.

## First-Class GitHub Repository Support

**Goal:** Enable extensions hosted in GitHub repositories to work seamlessly, including
branches with slashes, commit SHAs, and eventually private repos.

### Current Limitation

Extensions installed via `gh:owner/repo/path@ref` fail when:
- The ref contains slashes (e.g., `feature/my-branch`) — jsDelivr API returns 500
- The webview tries to load — CSP blocks external origins

### Solution Overview

> **Architecture Decision (2025-07-01):** We chose a **postMessage relay** approach over a
> backend proxy. This follows the VS Code extension model and keeps all extension-specific
> code in agent-canvas without requiring changes to the shared agent-server.
>
> See [Asset Relay System](./asset-relay-system.md) for the full rationale.

Three interconnected changes are needed:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Extension Install Flow (postMessage Relay)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User Input: gh:owner/repo@feature/branch                                   │
│       │                                                                      │
│       ▼                                                                      │
│   ┌─────────────────┐     ┌─────────────────┐                               │
│   │ GitHub API      │────▶│ Resolve ref to  │  Issue #1: GitHub API Resolver│
│   │ Resolver        │     │ commit SHA      │                               │
│   └────────┬────────┘     └─────────────────┘                               │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ Source          │  Returns relay-compatible descriptor                   │
│   │ Resolution      │  Issue #3: Source Resolution Updates                   │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐     ┌─────────────────┐                               │
│   │ Asset Loader    │────▶│ Fetch from      │  Issue #2: Asset Relay System │
│   │ (parent window) │     │ GitHub (no CSP) │                               │
│   └────────┬────────┘     └─────────────────┘                               │
│            │                                                                 │
│       postMessage                                                            │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ Webview loads   │  Receives assets via postMessage                      │
│   │ (sandboxed)     │  CSP satisfied ✓  No backend needed ✓                 │
│   └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why postMessage Relay Instead of Backend Proxy?

| Consideration | Backend Proxy | postMessage Relay |
|---------------|---------------|-------------------|
| Backend changes | Requires agent-server changes | ✅ Frontend only |
| Deployment | Must deploy backend first | ✅ Ships with agent-canvas |
| Security model | Proxy accessible to any HTTP caller | ✅ Parent controls all access |
| VS Code alignment | Different architecture | ✅ Same pattern as VS Code |
| External service access | Needs allowlist in proxy | ✅ Extension author controls |

The postMessage relay follows VS Code's proven extension model:
- **Webviews are sandboxed** — strict CSP, no direct network access
- **Extension host is privileged** — can fetch from anywhere
- **Message passing bridges them** — parent relays content to webview

### Issue Documents

| # | Issue | Status | Priority | Description |
|---|-------|--------|----------|-------------|
| 1 | [GitHub API Resolver](./github-api-resolver.md) | ✅ Done | High | Replace jsDelivr resolution with GitHub API for `gh:` refs |
| 2 | [Asset Relay System](./asset-relay-system.md) | ✅ Done | High | Parent-side fetching + postMessage bridge for webviews |
| 3 | [Source Resolution Updates](./source-resolution-updates.md) | ✅ Done | Medium | Wire resolver and relay into the install flow |

### Implementation Order

**Phase 1: Resolution (Issue #1)** ✅ Complete
1. ✅ Implement GitHub API resolver (`github-api.ts`)
2. ✅ Handle branches with slashes, tags, SHAs
3. ✅ Add caching for resolved refs

**Phase 2: Asset Relay (Issue #2)** ✅ Complete
1. ✅ Implement asset loader in parent window (`asset-loader.ts`)
2. ✅ Create postMessage protocol for webview requests (`webview-bridge.ts`)
3. ✅ Support blob URLs for initial load (`relay-bundle-source.ts`)
4. ✅ Handle runtime asset requests (`sdk/asset-relay.ts`)

**Phase 3: Integration (Issue #3)** ✅ Complete
1. ✅ `resolveSourceRef` uses GitHub API for `gh:` sources, returns `requiresProxy: true`
2. ✅ `toBundleSource` routes `gh:` sources to `createRelayBundleSource`
3. ✅ Extension manager passes `extensionSource` for asset relay
4. ✅ Webview components create `WebviewBridge` for runtime asset requests
5. ✅ Persisted extension restore correctly handles `gh:` sources
6. ✅ Integration tests verify end-to-end flow with slashed branches

**Phase 4: Polish**
1. Add permission model for external URLs
2. Support GitHub tokens for private repos
3. Improve error messages
4. Update documentation

### Success Criteria

After all three issues are resolved:

- [x] `gh:owner/repo@feature/my-branch` installs successfully
- [x] Extension webview loads without CSP errors
- [x] Extension worker activates and commands work
- [ ] Extensions can request external resources (with permission) — Phase 4
- [x] Settings pages load correctly
- [x] Icons and assets display properly
- [x] `npm:` extensions continue working (no regression)
- [x] No backend/agent-server changes required

---

## Security Model

Extensions follow VS Code's security model with postMessage relay:

1. **Webview sandbox** — `connect-src 'none'` prevents direct network access
2. **Parent mediation** — All network requests go through parent window
3. **Source validation** — Parent only fetches from the installed extension's source
4. **Permission grants** — External URLs require explicit permission (future)

This is **more secure** than a backend proxy because:
- The parent has full visibility into every request
- Requests are scoped to specific webview instances
- No server-side endpoint exposed to arbitrary callers

---

## Other Planned Improvements

- [ ] Permission model for external service access
- [ ] Private GitHub repository support (requires token management UI)
- [ ] Extension marketplace integration
- [ ] Offline extension caching (IndexedDB)
- [ ] Extension integrity verification (content hashes)
