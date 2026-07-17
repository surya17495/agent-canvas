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

## Test evidence

- **Component/unit** — `src/components/features/chat/components/llm-model-picker-menu.test.tsx`
  (15 tests): provider grouping + label sort, single-provider flat list,
  current-selection marking, `onSelect`/`onClose` behavior, no re-select of the
  current profile, no switch while pending, search visibility threshold, search
  filtering + no-results, ArrowDown/ArrowUp keyboard navigation, and the
  loading / error / empty states + settings deep link. Uses adapter-boundary
  `ProfileInfo` fixtures only.
- **E2E** — `tests/e2e/mock-llm/settings/mock-llm-model-picker-ui.spec.ts`: opens
  the picker pill against the real agent-server, asserts the list is populated
  from the profiles API with the active profile marked selected, switches to a
  second profile, and verifies the real `POST /switch_llm` carried the target
  model plus the in-chat confirmation. The `/model` slash-command path is covered
  separately by `mock-llm-model-switch.spec.ts`.

Run locally:

```
npm run test -- src/components/features/chat/components/llm-model-picker-menu.test.tsx
npm run test:e2e:mock-llm -- mock-llm-model-picker-ui
```
