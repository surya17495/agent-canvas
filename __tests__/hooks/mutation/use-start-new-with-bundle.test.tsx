import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useStartNewWithBundle } from "#/hooks/mutation/use-start-new-with-bundle";
import type { AgentModelBundle } from "#/types/agent-model-bundle";

// Mocks are wired to single shared spies so each test can tune behaviour
// (e.g. empty vs non-empty event store) and read what the hook called.

const createConversationMutate = vi.fn();
const deleteConversationMutate = vi.fn();
const navigate = vi.fn();
let activeConversation: {
  id?: string;
  selected_repository?: string | null;
  git_provider?: string | null;
  selected_branch?: string | null;
  selected_workspace?: string | null;
} | null = null;
let eventCount = 0;

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({
    mutate: createConversationMutate,
    isPending: false,
  }),
}));

vi.mock("#/hooks/mutation/use-delete-conversation", () => ({
  useDeleteConversation: () => ({
    mutate: deleteConversationMutate,
  }),
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({ data: activeConversation }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ navigate }),
}));

// `useEventStore.getState()` is what the hook reads — only the static
// accessor is exercised, so we don't need a real Zustand instance.
vi.mock("#/stores/use-event-store", () => ({
  useEventStore: {
    getState: () => ({ events: Array.from({ length: eventCount }) }),
  },
}));

// Bundle is read for `provider` + `model`; the rest is filled in by the
// (real) acp-providers registry — no need to stub it.
const acpBundle = (provider: string, model: string): AgentModelBundle => ({
  kind: "acp",
  id: `acp:${provider}:${model}`,
  label: model,
  provider,
  providerLabel: provider,
  model,
  supportsRuntimeSwitch: true,
});

describe("useStartNewWithBundle — empty-source cleanup", () => {
  beforeEach(() => {
    createConversationMutate.mockReset();
    deleteConversationMutate.mockReset();
    navigate.mockReset();
    activeConversation = null;
    eventCount = 0;
  });

  it("forks and deletes the source when the source conversation has zero events (the uninitialized / pre-first-message case)", () => {
    activeConversation = {
      id: "src-1",
      selected_workspace: "/workspaces/proj",
    };
    eventCount = 0;

    // `createConversation` is mocked to invoke its onSuccess immediately so
    // the fork → navigate → delete chain plays out within the synchronous
    // call — same lifecycle the real react-query path produces, just inlined.
    createConversationMutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.({ conversation_id: "dst-1" });
    });

    const { result } = renderHook(() => useStartNewWithBundle());
    act(() => {
      result.current.start(acpBundle("claude-code", "claude-opus-4-7"));
    });

    expect(navigate).toHaveBeenCalledWith("/conversations/dst-1");
    // Source had no events → fork-and-delete leaves a single conversation
    // on the chosen model (no orphan empty row in the panel).
    expect(deleteConversationMutate).toHaveBeenCalledWith({
      conversationId: "src-1",
    });
  });

  it("does NOT delete the source when it has events — switching from an active conversation must preserve the prior thread", () => {
    activeConversation = {
      id: "src-2",
      selected_workspace: "/workspaces/proj",
    };
    eventCount = 5; // user already sent messages — fork is a real branch
    createConversationMutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.({ conversation_id: "dst-2" });
    });

    const { result } = renderHook(() => useStartNewWithBundle());
    act(() => {
      result.current.start(acpBundle("codex", "gpt-5.5/high"));
    });

    expect(navigate).toHaveBeenCalledWith("/conversations/dst-2");
    expect(deleteConversationMutate).not.toHaveBeenCalled();
  });

  it("does NOT delete anything when forking from the home page (no source conversation to clean up)", () => {
    activeConversation = null;
    eventCount = 0;
    createConversationMutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.({ conversation_id: "dst-3" });
    });

    const { result } = renderHook(() => useStartNewWithBundle());
    act(() => {
      result.current.start(acpBundle("claude-code", "claude-sonnet-4-6"));
    });

    expect(navigate).toHaveBeenCalledWith("/conversations/dst-3");
    expect(deleteConversationMutate).not.toHaveBeenCalled();
  });
});
