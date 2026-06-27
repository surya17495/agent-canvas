# UI Extension Points: current and future

This is a **design / roadmap** guide for contributors. It describes how the UI extension
system plugs into Agent Canvas today, the seam for adding a new extension point, and a
catalog of candidate future extension points mapped to the actual UI surfaces that would
host them. It complements:

- [`EXTENSIONS.md`](./EXTENSIONS.md) - the user/author guide (try and publish extensions).
- [`../src/extensions/README.md`](../src/extensions/README.md) - the implementation reference.
- [`proposals/ui-extensions.md`](./proposals/ui-extensions.md) - the original design proposal
  (its sections 2, 6, and 7 already sketch several of the items below).

> Scope note: nothing here is committed work. It is a map of where the architecture is
> *designed* to grow, so new contribution points land consistently instead of ad hoc.

---

## How an extension plugs in today

Extensions extend the UI through **two complementary mechanisms**, both deliberately
narrow:

1. **Declarative contribution points** - static JSON under `contributes` in
   `extension.json`. The shell renders them; **showing them runs no extension code**. Today:

   | Contribution | Manifest key | Hosted by |
   |---|---|---|
   | Activity-bar (rail) button | `contributes.viewsContainers.activitybar` | `src/components/features/sidebar/sidebar-rail-body.tsx` |
   | View / panel (webview) | `contributes.views` | the panel host + `extension-webview.tsx` |
   | Command | `contributes.commands` | the Command-K menu (`src/components/features/command-menu/`) |

2. **A capability-gated host API** - the imperative surface an extension's **Web Worker**
   (and sandboxed webview) calls over RPC. Today (`src/extensions/host/host-api.ts`):

   | RPC method | Capability required | Backed by (`create-app-host-deps.ts`) |
   |---|---|---|
   | `window.showInformationMessage` | none | a host toast |
   | `commands.execute` | none | dispatch a contributed command |
   | `conversation.getActive` | `conversation:read` | the active conversation summary |
   | `storage.get` / `storage.set` | `storage` | namespaced `localStorage` |

Supporting pieces: contributions are collected in `contribution-registry.ts` (keyed by
`extensionId`, with derived flat lists for stable selectors), consumed by host components
through the hooks in `use-contributions.ts` (`useActivityBarItems`, `useExtensionCommands`,
`useExtensionViews`), and a worker activates lazily on an **activation event**
(`"*"`, `"onStartup"`, `onCommand:<id>`, `onView:<id>` - see `types.ts`/`manifest.ts`).

### Two kinds of "extension point"

Every idea below is one (or both) of:

- **Declarative point** - a new `contributes.*` key that places extension-described items
  into a host surface. Runs no extension code, so it needs **no new capability**.
- **Imperative API** - a new host RPC method the worker/webview can call. If it exposes data
  or performs an action, it needs a **capability + install-time consent**.

---

## The recipe for adding a new extension point

Adding a point is a small, well-bounded change across the same files each time.

**To add a declarative contribution point:**

1. **Schema** - extend `ContributesManifest` and its hand-rolled validator in
   `src/extensions/manifest.ts` (fail loudly on malformed input - this is the trust
   boundary for declarative data).
2. **Type** - add the resolved item type to `src/extensions/types.ts` and include it in
   `ExtensionContributions`.
3. **Registry** - add it to the derived flat lists in `contribution-registry.ts` so
   register/unregister stays atomic per extension.
4. **Hook** - expose a `useX()` selector in `use-contributions.ts`.
5. **Host** - have the target UI component subscribe to the hook and render the items.
6. **Activation (optional)** - if the point should lazily wake the worker, extend the
   `ActivationEvent` union and `ACTIVATION_PATTERN` (e.g. an `onMenu:<id>` trigger).

**To add an imperative API method:**

1. **Method** - add it to the map in `host-api.ts`; gate any privileged call with
   `requireCapability(...)`.
2. **Dep** - wire the real implementation in `create-app-host-deps.ts` (keep the subsystem
   app-agnostic via the `HostApiDeps` interface).
3. **Capability** - if it needs a new permission, add it to `KNOWN_CAPABILITIES`
   (`manifest.ts`), give it a consent label in
   `src/components/features/extensions/capability-labels.ts` + an i18n key, and remember the
   label is shown in the install dialog.
4. **SDK type** - surface it on the `agentCanvas` API types in `src/extensions/sdk/` so
   authors get types and the webview client can proxy it.
5. **Versioning** - keep changes **additive**; a breaking API change means bumping the host
   major that `engines.agentCanvas` checks against.

This uniformity is the point: a new surface is "schema + type + registry + hook + host" (or
"method + dep + capability"), never a fork of the rendering shell.

---

## Candidate future extension points

Each entry lists the **host surface** (a real component today), the **VS Code analog**, the
**shape** it would take, and the **trust** implications. Roughly ordered by value/effort.

### 1. Menus (`contributes.menus`)
- **Surface:** context/overflow menus - e.g. `conversation-tabs-context-menu.tsx`, and other
  per-item menus.
- **Analog:** VS Code `contributes.menus`.
- **Shape:** declarative items bound to a contributed `command`, placed into named menu slots
  (with optional `when`/grouping). Already called out as Phase 2 in the proposal.
- **Trust:** declarative; the action is just an existing contributed command, so no new
  capability. Needs a small "menu contribution location" registry so host menus can query
  "items for slot X".

### 2. Chat-input actions and slash commands
- **Surface:** `src/components/features/chat/components/chat-input-actions.tsx`,
  `custom-chat-input.tsx`, and the slash menu `slash-command-menu.tsx`.
- **Analog:** editor toolbar / quick actions.
- **Shape:** `contributes.slashCommands` (an entry in the slash menu) and/or input toolbar
  buttons, each bound to a contributed command. High value: this is where agent workflows
  start, so an extension that injects a templated prompt or a pre-flight check is compelling.
- **Trust:** declarative entry; the command runs in the worker. If the command needs to
  *insert text into* or *submit* the conversation, that requires a new imperative API (see
  #8) gated by a write capability.

### 3. Command metadata (`when` clauses, categories, icons)
- **Surface:** `src/components/features/command-menu/`.
- **Analog:** VS Code command `category`, `enablement`, `icon`.
- **Shape:** enrich the existing `commands` point with grouping, icons, and `when`-style
  visibility, plus keybindings (Phase 2 in the proposal).
- **Trust:** declarative; no new capability.

### 4. Status-bar items
- **Surface:** *none yet* - there is no status bar component today.
- **Analog:** VS Code status bar.
- **Shape:** introduce a host status-bar region first, then a `contributes.statusBar` point
  (text/icon + tooltip + command), optionally driven by a worker for live values.
- **Trust:** declarative shell; live values would use the existing `commands`/API surface.
  Larger because it adds a brand-new host surface, not just a contribution slot.

### 5. Settings / dedicated pages
- **Surface:** the settings navigation (`settings-nav.tsx`) and routed pages under
  `src/routes/`.
- **Analog:** VS Code `contributes.configuration` + setting UIs.
- **Shape:** a `contributes.pages` (a webview-backed route reachable from nav) and/or a
  declarative settings schema the host renders. Routing + nav are host changes; the page body
  is a sandboxed webview, so no new isolation risk.
- **Trust:** webview is already sandboxed; persisting settings would reuse `storage` or a new
  scoped capability.

### 6. Custom event / message renderers
- **Surface:** the conversation event renderers in `src/components/conversation-events/`.
- **Analog:** VS Code custom editors / notebook renderers.
- **Shape:** let an extension register a **webview renderer for a custom event/message type**,
  fed render data over RPC. Powerful for domain-specific output (compliance results, charts).
- **Trust:** webview sandbox already prevents host-data access and network egress; the new
  surface is a render-data API (read-only) gated by `conversation:read` or a narrower
  capability. Performance/throughput of the relay needs care (proposal open question #4).

### 7. Theming and keybindings
- **Surface:** the app theme tokens and the keybinding layer behind the command menu.
- **Analog:** `contributes.themes` / `contributes.keybindings`.
- **Shape:** declarative theme/keybinding contribution points. Proposal lists these as a
  natural Phase 2 "once commands land."
- **Trust:** declarative; the main risk is collision/precedence rules, not security.

### 8. Imperative API growth (the `agentCanvas` surface)
The worker/webview API is intentionally minimal today (`conversation.getActive`, `storage.*`,
`window.showInformationMessage`, `commands.execute`). Likely additions, each behind its own
capability + consent label:

- `window.showWarning/ErrorMessage` (no new capability) and richer notifications.
- `conversation.subscribe` / event stream - **read**, behind `conversation:read`.
- `conversation.postMessage` / `conversation.run` - **write**, behind a new
  `conversation:write` capability (this is what makes #2 and #6 actionable).
- `workspace`/`files` read - behind a new, clearly-scoped capability (high sensitivity;
  weigh carefully).
- `settings`/`environment` read - behind a new capability.

Keep this driven by **real consumers** (proposal open question #3): add a method when an
extension point needs it, not speculatively.

---

## Explicitly out of scope (and why)

These come from the proposal and remain the right boundaries:

- **Direct editor/host-DOM access.** Extensions never touch the editor or app DOM - custom UI
  must go through a **sandboxed webview**. This is the core security guarantee; a "render in
  the host DOM" point would break it and should not be added.
- **Extension-to-extension APIs / dependency graphs.** No inter-extension imports for now.
- **Native (non-webview) rich tree views** beyond simple declarative items.

---

## Guardrails to preserve when extending

Whatever point you add, keep these invariants - they are what make the system safe to grow:

1. **Declarative-first.** Prefer a static `contributes.*` point over an API call. Rendering a
   contributed item must never execute extension code.
2. **Least privilege + consent.** Any new data or action goes behind a `KNOWN_CAPABILITIES`
   entry surfaced in the install dialog (all-or-nothing). Declarative-only points need none.
3. **Isolation is non-negotiable.** Logic stays in the Web Worker; custom UI stays in the
   `sandbox="allow-scripts"`, opaque-origin, `connect-src 'none'` iframe. No new point may
   hand an extension the host origin, cookies, or network.
4. **Stable, per-extension contracts.** Register/unregister by `extensionId`; derive flat
   lists for stable selector references; never let one extension's contribution destabilize
   another's.
5. **Versioned host API.** Treat the `agentCanvas` API as a public contract gated by
   `engines.agentCanvas`; additive changes are free, breaking changes bump the host major.

## See also

- [`../src/extensions/README.md`](../src/extensions/README.md) - architecture, file map, and
  the source-ref/security details referenced above.
- [`proposals/ui-extensions.md`](./proposals/ui-extensions.md) - sections 2 (VS Code mapping),
  4 (technical design), 6 (out of scope), 7 (open questions).
- [`EXTENSIONS.md`](./EXTENSIONS.md) - the user- and author-facing guide.
