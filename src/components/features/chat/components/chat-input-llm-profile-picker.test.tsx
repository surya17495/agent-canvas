import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test-utils";
import { ChatInputLlmProfilePicker } from "./chat-input-llm-profile-picker";
import type { ChatInputLlmProfileState } from "#/hooks/use-chat-input-llm-profile-state";
import { useChatInputLlmProfileState } from "#/hooks/use-chat-input-llm-profile-state";

vi.mock("#/hooks/use-chat-input-llm-profile-state", () => ({
  useChatInputLlmProfileState: vi.fn(),
}));

const mockedState = vi.mocked(useChatInputLlmProfileState);

function stateOf(
  overrides: Partial<ChatInputLlmProfileState> = {},
): ChatInputLlmProfileState {
  return {
    profiles: [
      {
        name: "opus",
        model: "anthropic/claude-opus-4-5",
        base_url: null,
        api_key_set: true,
      },
    ],
    currentProfileName: "opus",
    currentProfileModel: "anthropic/claude-opus-4-5",
    isLoading: false,
    isError: false,
    isSwitching: false,
    selectProfile: vi.fn(),
    ...overrides,
  };
}

describe("ChatInputLlmProfilePicker (pill trigger)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("declares a menu popup and wires aria-controls when open", async () => {
    const user = userEvent.setup();
    mockedState.mockReturnValue(stateOf());
    renderWithProviders(<ChatInputLlmProfilePicker />);

    const trigger = screen.getByTestId("chat-input-llm-profile");
    // Opens a menu, not a dialog.
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const controls = trigger.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const menu = screen.getByTestId("chat-input-llm-profile-popover");
    expect(menu).toHaveAttribute("id", controls);
    expect(menu).toHaveAttribute("role", "menu");
  });

  it("restores focus to the trigger when the menu is closed with Escape", async () => {
    const user = userEvent.setup();
    mockedState.mockReturnValue(stateOf());
    renderWithProviders(<ChatInputLlmProfilePicker />);

    const trigger = screen.getByTestId("chat-input-llm-profile");
    await user.click(trigger);
    expect(
      screen.getByTestId("chat-input-llm-profile-popover"),
    ).toBeInTheDocument();

    // Escape from within the menu closes it and returns focus to the trigger.
    await user.keyboard("{Escape}");
    expect(
      screen.queryByTestId("chat-input-llm-profile-popover"),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders a stable, busy loading pill instead of disappearing", () => {
    mockedState.mockReturnValue(
      stateOf({
        isLoading: true,
        currentProfileName: null,
        currentProfileModel: null,
      }),
    );
    renderWithProviders(<ChatInputLlmProfilePicker />);

    // The trigger stays mounted while loading (no return null / layout jump).
    const trigger = screen.getByTestId("chat-input-llm-profile");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-busy", "true");
  });

  it("disables the trigger and marks it busy while a switch is in flight", () => {
    mockedState.mockReturnValue(stateOf({ isSwitching: true }));
    renderWithProviders(<ChatInputLlmProfilePicker />);

    const trigger = screen.getByTestId("chat-input-llm-profile");
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-busy", "true");
  });

  it("shows the provider/model identity visibly and in the accessible name", () => {
    mockedState.mockReturnValue(stateOf());
    renderWithProviders(<ChatInputLlmProfilePicker />);

    const trigger = screen.getByTestId("chat-input-llm-profile");
    // Full profile + provider/model exposed via the accessible name / title,
    // even though the visible identity may be truncated / hidden on mobile.
    const accessibleName = trigger.getAttribute("aria-label") ?? "";
    expect(accessibleName).toContain("opus");
    expect(accessibleName).toContain("Anthropic");
    expect(accessibleName).toContain("claude-opus-4-5");
    expect(trigger).toHaveAttribute("title", accessibleName);
    // The provider/model identity is rendered in the pill (desktop-visible).
    expect(screen.getByText("Anthropic/claude-opus-4-5")).toBeInTheDocument();
  });

  it("gives the trigger a >=44px mobile touch target that relaxes on desktop", () => {
    mockedState.mockReturnValue(stateOf());
    renderWithProviders(<ChatInputLlmProfilePicker />);

    // jsdom can't measure layout, so assert the responsive utility that
    // enforces the 44px mobile target (relaxing to compact on `sm`+). The
    // pixel-accurate target is verified in the Playwright layout spec.
    const trigger = screen.getByTestId("chat-input-llm-profile");
    expect(trigger.className).toContain("min-h-[44px]");
    expect(trigger.className).toContain("sm:min-h-0");
  });

  it("caps the popover height so it can't overflow past the viewport top", async () => {
    const user = userEvent.setup();
    mockedState.mockReturnValue(stateOf());
    renderWithProviders(<ChatInputLlmProfilePicker />);

    await user.click(screen.getByTestId("chat-input-llm-profile"));
    const menu = screen.getByTestId("chat-input-llm-profile-popover");
    // The upward-opening menu is capped to the space above the trigger (with a
    // floor) rather than an unbounded height, so it scrolls within instead of
    // rendering behind the header. Exact px are asserted by the Playwright spec.
    expect(menu.style.maxHeight).not.toBe("");
    expect(menu).toHaveClass("overflow-y-auto");
  });

  it("stays reachable on a fetch error so the error state is openable", async () => {
    const user = userEvent.setup();
    mockedState.mockReturnValue(
      stateOf({
        isError: true,
        profiles: [],
        currentProfileName: null,
        currentProfileModel: null,
      }),
    );
    renderWithProviders(<ChatInputLlmProfilePicker />);

    const trigger = screen.getByTestId("chat-input-llm-profile");
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByTestId("llm-model-picker-error")).toBeInTheDocument();
  });
});
