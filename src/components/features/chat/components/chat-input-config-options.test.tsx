import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test-utils";
import { ChatInputConfigOptions } from "./chat-input-config-options";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSetAcpConfigOption } from "#/hooks/mutation/use-set-acp-config-option";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import type { ACPConfigOption } from "#/types/acp-config-option";

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: vi.fn(),
}));

vi.mock("#/hooks/mutation/use-set-acp-config-option", () => ({
  useSetAcpConfigOption: vi.fn(),
}));

const mockedActiveConversation = vi.mocked(useActiveConversation);
const mockedSetAcpConfigOption = vi.mocked(useSetAcpConfigOption);

const mutate = vi.fn();

function mockMutation(overrides: Record<string, unknown> = {}) {
  mockedSetAcpConfigOption.mockReturnValue({
    mutate,
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useSetAcpConfigOption>);
}

const effortOption: ACPConfigOption = {
  id: "effort",
  name: "Reasoning Effort",
  type: "select",
  current_value: "medium",
  choices: [
    { value: "low", name: "Low" },
    { value: "medium", name: "Medium" },
    { value: "high", name: "High" },
  ],
};

const thinkingOption: ACPConfigOption = {
  id: "thinking",
  name: "Extended Thinking",
  type: "boolean",
  current_value: false,
};

const modelOption: ACPConfigOption = {
  id: "model",
  name: "Model",
  type: "select",
  current_value: "a",
  choices: [{ value: "a" }, { value: "b" }],
};

function mockConversation(
  overrides: Partial<AppConversation> | null = {},
): void {
  const conversation =
    overrides === null
      ? undefined
      : ({
          id: "conv-1",
          agent_kind: "acp",
          acp_server: "opencode",
          config_options: [effortOption, thinkingOption],
          ...overrides,
        } as AppConversation);
  mockedActiveConversation.mockReturnValue({
    data: conversation,
  } as unknown as ReturnType<typeof useActiveConversation>);
}

describe("ChatInputConfigOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutation();
  });

  it("renders nothing when there is no active conversation", () => {
    mockConversation(null);
    renderWithProviders(<ChatInputConfigOptions />);
    expect(
      screen.queryByTestId("chat-input-config-options"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing for non-ACP conversations even if options leak through", () => {
    mockConversation({ agent_kind: "openhands" });
    renderWithProviders(<ChatInputConfigOptions />);
    expect(
      screen.queryByTestId("chat-input-config-options"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when the ACP conversation advertises no options", () => {
    mockConversation({ config_options: [] });
    renderWithProviders(<ChatInputConfigOptions />);
    expect(
      screen.queryByTestId("chat-input-config-options"),
    ).not.toBeInTheDocument();
  });

  it("suppresses the 'model' option (owned by the model chip)", () => {
    mockConversation({ config_options: [modelOption] });
    renderWithProviders(<ChatInputConfigOptions />);
    expect(
      screen.queryByTestId("chat-input-config-options"),
    ).not.toBeInTheDocument();
  });

  it("shows a select pill labeled with the current choice and menu semantics", () => {
    mockConversation({ config_options: [effortOption] });
    renderWithProviders(<ChatInputConfigOptions />);

    const trigger = screen.getByTestId("chat-input-config-option-effort");
    expect(trigger).toHaveTextContent("Medium");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("selects a choice: opens the popover, mutates, and closes", async () => {
    const user = userEvent.setup();
    mockConversation({ config_options: [effortOption] });
    renderWithProviders(<ChatInputConfigOptions />);

    await user.click(screen.getByTestId("chat-input-config-option-effort"));
    expect(
      screen.getByTestId("chat-input-config-option-effort-popover"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByTestId("chat-input-config-option-effort-choice-high"),
    );
    expect(mutate).toHaveBeenCalledWith({
      conversationId: "conv-1",
      configId: "effort",
      value: "high",
    });
    expect(
      screen.queryByTestId("chat-input-config-option-effort-popover"),
    ).not.toBeInTheDocument();
  });

  it("does not mutate when re-selecting the current choice", async () => {
    const user = userEvent.setup();
    mockConversation({ config_options: [effortOption] });
    renderWithProviders(<ChatInputConfigOptions />);

    await user.click(screen.getByTestId("chat-input-config-option-effort"));
    await user.click(
      screen.getByTestId("chat-input-config-option-effort-choice-medium"),
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it("renders grouped choices with their group headers", async () => {
    const user = userEvent.setup();
    mockConversation({
      config_options: [
        {
          ...effortOption,
          choices: [
            { value: "low", name: "Low", group: "Fast" },
            { value: "high", name: "High", group: "Thorough" },
          ],
        },
      ],
    });
    renderWithProviders(<ChatInputConfigOptions />);

    await user.click(screen.getByTestId("chat-input-config-option-effort"));
    expect(screen.getByText("Fast")).toBeInTheDocument();
    expect(screen.getByText("Thorough")).toBeInTheDocument();
  });

  it("toggles a boolean option in place with aria-pressed state", async () => {
    const user = userEvent.setup();
    mockConversation({ config_options: [thinkingOption] });
    renderWithProviders(<ChatInputConfigOptions />);

    const toggle = screen.getByTestId("chat-input-config-option-thinking");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    // The on/off suffix is i18n'd (COMMON$ON/COMMON$OFF) and the test env
    // renders raw keys, so only assert the server-provided label prefix.
    expect(toggle).toHaveTextContent(/Extended Thinking:/);

    await user.click(toggle);
    expect(mutate).toHaveBeenCalledWith({
      conversationId: "conv-1",
      configId: "thinking",
      value: true,
    });
  });

  it("falls back to ids/values when the server omits display names", () => {
    mockConversation({
      config_options: [
        {
          id: "mode",
          type: "select",
          current_value: "build",
          choices: [{ value: "build" }, { value: "plan" }],
        },
      ],
    });
    renderWithProviders(<ChatInputConfigOptions />);

    const trigger = screen.getByTestId("chat-input-config-option-mode");
    expect(trigger).toHaveTextContent("build");
    expect(trigger).toHaveAttribute("aria-label", "mode");
  });

  it("disables pills while a set is in flight", () => {
    mockMutation({ isPending: true });
    mockConversation({ config_options: [effortOption, thinkingOption] });
    renderWithProviders(<ChatInputConfigOptions />);

    expect(
      screen.getByTestId("chat-input-config-option-effort"),
    ).toBeDisabled();
    expect(
      screen.getByTestId("chat-input-config-option-thinking"),
    ).toBeDisabled();
  });
});
