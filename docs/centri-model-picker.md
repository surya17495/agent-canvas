# Centri model picker

The first Centri UI vertical slice: a production LLM model picker wired to the
real Agent Server contract. This document describes **only** what is implemented
and tested here. There is no Memory page and no Centri Settings page — those are
intentionally not scaffolded, so nothing in this slice implies they exist.

## What it does

- Keeps the currently-selected LLM profile visible next to the composer via the
  chat-input pill, and inside the chat-input overflow submenu.
- Opens an accessible popover picker populated **only** from the real LLM-profile
  list (`GET /api/profiles`). No hardcoded or mock production models.
- Changes the model before a conversation starts (activates the profile) and
  mid-conversation (live-swaps the running conversation's LLM).
- Deep-links into the existing LLM Settings UI to add/configure providers. API
  keys are never rendered or exposed by the picker.

## Architecture

The picker is split into a presentational component and a state hook so the
rendering logic is unit-testable against adapter-boundary fixtures.

| Layer | File | Responsibility |
| --- | --- | --- |
| Presentational menu | `src/components/features/chat/components/llm-model-picker-menu.tsx` | Search, provider grouping, keyboard nav, current-selection indication, loading/empty/error/no-results/pending states. All inputs arrive as props. |
| Pill + wiring | `src/components/features/chat/components/chat-input-llm-profile-picker.tsx` | Renders the pill trigger + popover; `ChatInputLlmProfileMenuContent` delegates to `LlmModelPickerMenu`, wiring live state + the switch mutation. |
| State hook | `src/hooks/use-chat-input-llm-profile-state.ts` | Resolves the current profile, exposes `isLoading` / `isError` / `isSwitching`, and `selectProfile`. |

`LlmModelPickerMenu` is presentational by design — the pill wrapper and the
overflow submenu both render the same component, so there is a single source of
truth for the picker's behavior.

### Backend scoping (stale-selection isolation)

The profiles query is keyed by backend + org
(`[...LLM_PROFILES_QUERY_KEYS.all, backend.id, orgId]`), so switching backends
re-fetches the correct list and the previous backend's selection cannot leak in.
The current-profile resolution also validates any conversation-stamped profile
against the live list, so a since-deleted/renamed profile falls through instead
of being shown as selected.

## API contract used

Mid-conversation switching goes through the real Agent Server contract, not an
invented route:

```
POST /api/conversations/{conversation_id}/switch_llm
Body: { "llm": <profile config> }
```

This is issued by `ConversationClient.switchLLM` via
`AgentServerConversationService.switchProfile` (see
`use-switch-llm-profile.ts` / `use-switch-llm-profile-and-log.ts`). When there is
no conversation (home / new-conversation surface), selecting a profile activates
it globally instead of calling `switch_llm`.

### Safe-switch semantics

The switch is disabled while a mutation is in flight (`isSwitching`), so
re-opening the picker cannot fire a second `switch_llm`. Pending state is read
globally by mutation key so the pill and the menu (separate hook instances) stay
in sync. If the backend rejects a switch, the existing mutation error surfaces
and the current selection is left unchanged.

## States

The picker renders explicit, test-identified states:

| State | testid |
| --- | --- |
| Loading | `llm-model-picker-loading` |
| Error (list fetch failed) | `llm-model-picker-error` |
| Empty (no profiles configured) | `llm-model-picker-empty` |
| No search results | `llm-model-picker-no-results` |
| Option row | `chat-input-llm-profile-option-{name}` |
| Current-selection check | `llm-model-picker-current-{name}` |
| Search input | `llm-model-picker-search-input` |
| Settings deep link | `llm-model-picker-settings-link` |

The search box appears only when there are at least six profiles (below that a
short list is faster to scan than to filter). Provider group headings appear only
when more than one provider is present; otherwise the list is flat under a single
generic heading.

## Accessibility

The popover is a proper ARIA menu, not an ad-hoc listbox:

- The owning `<ul>` (the `ContextMenu`) carries `role="menu"` with an accessible
  label.
- Each profile is a `<button role="menuitemradio">` (with `aria-checked` marking
  the current profile) wrapped in an `<li role="none">`; the Settings deep link is
  a `role="menuitem"`. Headings, dividers, and the search box are
  presentation-only, so the menu exposes exactly the actionable items — no stray
  `role="option"` and no unparented `listbox`.
- The pill trigger declares `aria-haspopup="menu"`, reflects `aria-expanded`, and
  points `aria-controls` at the open menu. Escape (from the search box, any
  profile row, or the Settings row) closes the menu and returns focus to the
  trigger.
- The trigger stays mounted while the profiles list is loading (a busy,
  `aria-busy` pill — no `return null` / layout jump) and remains reachable on a
  fetch error so the error state is openable. It surfaces the full profile +
  provider/model identity in its accessible name / `title`, while the visible
  provider/model text may be truncated or hidden on small screens.
- Interactive rows meet the 44×44px mobile touch target (relaxing to a compact
  desktop height) and carry a visible keyboard focus treatment. The pill trigger
  itself also meets the 44×44px target on mobile (`min-h-[44px] sm:min-h-0`),
  without overlapping adjacent composer controls (it sits in an `items-center`
  row, gap-separated from its siblings).

### Mobile viewport safety

The popover opens upward from the composer, so its usable height is the space
*above* the trigger. On mobile a 48px header (`SidebarMobileMenuBar`, `h-12`,
shown below the `md` breakpoint) sits at the top and wins hit-testing, so an
unbounded upward menu would render behind it and occlude the search box. The
popover therefore caps its `max-height` to the space above the trigger minus the
header height and a safe gap (floored at 160px so it always scrolls within
rather than shrinking to nothing). The cap is recomputed on open and on
resize/orientation change via `useLayoutEffect` (pre-paint, no flash).

## Test evidence (executed here)

- **Component/unit** — `src/components/features/chat/components/llm-model-picker-menu.test.tsx`:
  provider grouping + label sort, single-provider flat list, current-selection
  marking via `menuitemradio` + `aria-checked`, valid menu DOM (each option in an
  `<li role="none">`; Settings as `menuitem`; exactly-actionable-items with no
  `option`/`listbox`), `onSelect`/`onClose` behavior, no re-select of the current
  profile, no switch while pending, search visibility threshold, search filtering
  + no-results, ArrowDown/ArrowUp keyboard navigation, Escape-to-close from an
  option row and the Settings row, Escape-clears-then-closes from the search box,
  and the loading / error / empty states + settings deep link. Adapter-boundary
  `ProfileInfo` fixtures only.
- **Pill trigger** — `src/components/features/chat/components/chat-input-llm-profile-picker.test.tsx`:
  `aria-haspopup="menu"` + `aria-controls`/`aria-expanded` wiring, focus return to
  the trigger on Escape, stable busy loading pill (no `return null`), disabled +
  busy while switching, visible + accessible provider/model identity, error
  state reachable from the pill, the >=44px mobile touch-target utility on the
  trigger, and the capped popover `max-height` (so it can't overflow past the
  viewport top). jsdom can't measure layout, so the trigger asserts the
  responsive utility class and the popover asserts a non-empty inline
  `max-height` + `overflow-y-auto`; pixel-accurate positions are covered by the
  Playwright spec below. The state hook is mocked at its boundary.
- **State hook** — `src/hooks/use-chat-input-llm-profile-state.test.tsx`: proves
  the null-conversation (home) path forwards `conversationId = null` to the switch
  (global activation), the in-conversation path targets that conversation, and no
  switch fires when the current profile is re-selected.

All three suites pass locally (32 tests). `npm run lint` (typecheck + eslint +
prettier) and `npm run build` are clean. The remaining unit-suite failures
(`use-app-title`, `use-agent-state`, `record-model-switch-message`) reproduce on
the branch point with these changes stashed, so they are pre-existing and
unrelated.

Run locally:

```
npm run test -- src/components/features/chat/components/llm-model-picker-menu.test.tsx
npm run test -- src/components/features/chat/components/chat-input-llm-profile-picker.test.tsx
npm run test -- src/hooks/use-chat-input-llm-profile-state.test.tsx
```

## Manual QA (executed by main agent)

Manual Playwright-driven QA passed at both target viewports — desktop
**1440×1000** and mobile **390×844** (iPhone-12-class portrait). Verified:

- Search + filter, grouped profiles, and current-selection indication.
- Settings deep-link, valid ARIA menu semantics, Escape behavior + focus return
  to the trigger.
- Empty / loading / error / pending states render as designed.
- 44px mobile trigger touch target; no horizontal overflow and no header
  occlusion of the popover/search at 390×844.

## Still pending

- **Real live Agent Server E2E** — `tests/e2e/mock-llm/settings/mock-llm-model-picker-ui.spec.ts`
  against a live agent-server (real `GET /api/profiles` + real
  `POST /api/conversations/{id}/switch_llm` with the in-chat confirmation) is
  **not yet run**. This environment has no display and lacks the mock-LLM /
  agent-server + Python mock stack.
- **Production rollout** — not started; this slice is behind ordinary review and
  has not shipped.
- **GitHub Actions CI** — **unavailable/unregistered on the fork**, not a passing
  or failing signal. The Actions API lists 0 registered workflows and 0 runs for
  `centri-model-picker`, so no CI acceptance is claimed (see the fork note below).

```
npm run test:e2e:mock-llm -- mock-llm-model-picker-ui
```

## Centri UI integration roadmap

This model picker is the first vertical slice. The intended sequence, kept
scaffold-free (nothing below is stubbed or implied to exist until its slice
lands):

1. **Model picker foundation** *(this slice)* — production LLM picker wired to
   real profile listing + `switch_llm`.
2. **Centri Settings** — a dedicated settings surface for Centri configuration,
   reusing the existing settings shell rather than a parallel one.
3. **Memory engine / frame integration** — wire the memory engine and frame
   plumbing into the conversation lifecycle.
4. **Memory UI** — a Memory page to view/manage stored memory, built only once
   the engine integration (step 3) is real.
5. **Recall / audit UI + MCP** — recall and audit surfaces, exposed over MCP,
   layered on top of the Memory UI.
