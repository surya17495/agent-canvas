import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatInputLlmProfileState } from "./use-chat-input-llm-profile-state";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useSwitchLlmProfileAndLog } from "#/hooks/mutation/use-switch-llm-profile-and-log";

vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: vi.fn(),
}));
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: vi.fn(),
}));
vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: vi.fn(),
}));
vi.mock("#/hooks/mutation/use-switch-llm-profile-and-log", () => ({
  useSwitchLlmProfileAndLog: vi.fn(),
}));
vi.mock("#/hooks/mutation/use-switch-llm-profile", () => ({
  SWITCH_LLM_PROFILE_MUTATION_KEY: ["switch-llm-profile"],
}));
vi.mock("@tanstack/react-query", () => ({
  useIsMutating: vi.fn(() => 0),
}));
vi.mock("#/stores/model-store", () => ({
  useModelStore: vi.fn(() => undefined),
}));

const mockConversationId = vi.mocked(useOptionalConversationId);
const mockActiveConversation = vi.mocked(useActiveConversation);
const mockLlmProfiles = vi.mocked(useLlmProfiles);
const mockSwitchAndLog = vi.mocked(useSwitchLlmProfileAndLog);

const switchAndLog = vi.fn();

const PROFILES = [
  {
    name: "opus",
    model: "anthropic/claude-opus-4-5",
    base_url: null,
    api_key_set: true,
  },
  { name: "gpt", model: "openai/gpt-5.5", base_url: null, api_key_set: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockSwitchAndLog.mockReturnValue({ switchAndLog, isPending: false });
  mockLlmProfiles.mockReturnValue({
    data: { profiles: PROFILES, active_profile: "opus" },
    isLoading: false,
    isError: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("useChatInputLlmProfileState (null-conversation activation)", () => {
  it("forwards conversationId=null so a home-page select activates globally", () => {
    // No conversation → home / pre-conversation surface.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockConversationId.mockReturnValue({ conversationId: null } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockActiveConversation.mockReturnValue({ data: undefined } as any);

    const { result } = renderHook(() => useChatInputLlmProfileState());
    act(() => result.current.selectProfile("gpt"));

    // The global activation path is driven by a null conversationId (the switch
    // mutation branches on this to activate the profile instead of swapping a
    // running conversation's LLM).
    expect(switchAndLog).toHaveBeenCalledWith(null, "gpt");
  });

  it("targets the running conversation when one is active", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockConversationId.mockReturnValue({ conversationId: "conv-1" } as any);
    mockActiveConversation.mockReturnValue({
      data: { active_profile: "opus", llm_model: "anthropic/claude-opus-4-5" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useChatInputLlmProfileState());
    act(() => result.current.selectProfile("gpt"));

    expect(switchAndLog).toHaveBeenCalledWith("conv-1", "gpt");
  });

  it("does not re-switch when the current profile is selected", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockConversationId.mockReturnValue({ conversationId: null } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockActiveConversation.mockReturnValue({ data: undefined } as any);

    const { result } = renderHook(() => useChatInputLlmProfileState());
    // active_profile is "opus" with no conversation.
    act(() => result.current.selectProfile("opus"));
    expect(switchAndLog).not.toHaveBeenCalled();
  });
});
