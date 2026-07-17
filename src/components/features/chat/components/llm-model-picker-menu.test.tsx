import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProfileInfo } from "@openhands/typescript-client";
import { renderWithProviders } from "../../../../../test-utils";
import {
  LlmModelPickerMenu,
  groupProfilesByProvider,
  type LlmModelPickerMenuProps,
} from "./llm-model-picker-menu";

const profile = (name: string, model: string | null): ProfileInfo => ({
  name,
  model,
  base_url: null,
  api_key_set: true,
});

/** Adapter-boundary fixtures: the picker is presentational, so the profiles
 * list (the only backend-shaped input) is supplied directly. */
const MULTI_PROVIDER_PROFILES: ProfileInfo[] = [
  profile("opus", "anthropic/claude-opus-4-5"),
  profile("sonnet", "anthropic/claude-sonnet-4-5"),
  profile("gpt", "openai/gpt-5.5"),
  profile("gemini", "gemini/gemini-2.5-pro"),
  profile("local", null),
];

function renderMenu(overrides: Partial<LlmModelPickerMenuProps> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const props: LlmModelPickerMenuProps = {
    profiles: MULTI_PROVIDER_PROFILES,
    currentProfileName: "opus",
    isLoading: false,
    isError: false,
    isSwitching: false,
    onSelect,
    onClose,
    settingsPath: "/settings/llm",
    settingsLabel: "LLM Profiles",
    ...overrides,
  };
  // The menu renders <li>/<button> fragments that belong inside a <ul>.
  const utils = renderWithProviders(
    <ul>
      <LlmModelPickerMenu {...props} />
    </ul>,
  );
  return { ...utils, onSelect, onClose };
}

describe("groupProfilesByProvider", () => {
  it("groups by provider parsed from the model id and sorts by label", () => {
    const groups = groupProfilesByProvider(MULTI_PROVIDER_PROFILES, "Custom");
    const labels = groups.map((g) => g.label);
    // Anthropic, Custom, Gemini, OpenAI — alphabetical by display label.
    expect(labels).toEqual(["Anthropic", "Custom", "Gemini", "OpenAI"]);
    const anthropic = groups.find((g) => g.label === "Anthropic");
    expect(anthropic?.profiles.map((p) => p.name)).toEqual(["opus", "sonnet"]);
  });

  it("puts profiles without a model in the custom group", () => {
    const groups = groupProfilesByProvider([profile("x", null)], "Custom");
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Custom");
  });
});

describe("LlmModelPickerMenu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders provider group headings when multiple providers exist", () => {
    renderMenu();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
  });

  it("renders a flat list with a single generic heading for one provider", () => {
    renderMenu({
      profiles: [
        profile("a", "anthropic/claude-opus-4-5"),
        profile("b", "anthropic/claude-sonnet-4-5"),
      ],
      currentProfileName: "a",
    });
    // No per-provider heading when only one provider is present.
    expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("chat-input-llm-profile-option-a"),
    ).toBeInTheDocument();
  });

  it("marks the current profile as selected", () => {
    renderMenu({ currentProfileName: "gpt" });
    const current = screen.getByTestId("chat-input-llm-profile-option-gpt");
    expect(current).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByTestId("llm-model-picker-current-gpt"),
    ).toBeInTheDocument();
    const other = screen.getByTestId("chat-input-llm-profile-option-opus");
    expect(other).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect + onClose when a non-current profile is chosen", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderMenu({ currentProfileName: "opus" });
    await user.click(screen.getByTestId("chat-input-llm-profile-option-gpt"));
    expect(onSelect).toHaveBeenCalledWith("gpt");
    expect(onClose).toHaveBeenCalled();
  });

  it("does not re-select the current profile (closes instead)", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderMenu({ currentProfileName: "opus" });
    await user.click(screen.getByTestId("chat-input-llm-profile-option-opus"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("does not fire a switch while a mutation is pending", async () => {
    const user = userEvent.setup();
    const { onSelect, onClose } = renderMenu({ isSwitching: true });
    await user.click(screen.getByTestId("chat-input-llm-profile-option-gpt"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a search box only when the list is long enough", () => {
    renderMenu({
      profiles: MULTI_PROVIDER_PROFILES.slice(0, 3),
      currentProfileName: "opus",
    });
    expect(
      screen.queryByTestId("llm-model-picker-search-input"),
    ).not.toBeInTheDocument();

    const six = [
      profile("p1", "anthropic/a"),
      profile("p2", "anthropic/b"),
      profile("p3", "openai/c"),
      profile("p4", "openai/d"),
      profile("p5", "gemini/e"),
      profile("p6", "gemini/f"),
    ];
    renderMenu({ profiles: six, currentProfileName: "p1" });
    expect(
      screen.getByTestId("llm-model-picker-search-input"),
    ).toBeInTheDocument();
  });

  it("filters options by the search query and shows a no-results state", async () => {
    const user = userEvent.setup();
    const six = [
      profile("alpha", "anthropic/claude-opus-4-5"),
      profile("beta", "anthropic/claude-sonnet-4-5"),
      profile("gamma", "openai/gpt-5.5"),
      profile("delta", "openai/gpt-4o"),
      profile("epsilon", "gemini/gemini-2.5-pro"),
      profile("zeta", "gemini/gemini-2.0-flash"),
    ];
    renderMenu({ profiles: six, currentProfileName: "alpha" });

    const input = screen.getByTestId("llm-model-picker-search-input");
    await user.type(input, "gpt");
    // Both openai profiles match on model id.
    expect(
      screen.getByTestId("chat-input-llm-profile-option-gamma"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("chat-input-llm-profile-option-delta"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("chat-input-llm-profile-option-alpha"),
    ).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "no-such-model");
    expect(
      screen.getByTestId("llm-model-picker-no-results"),
    ).toBeInTheDocument();
  });

  it("moves focus into the option list with ArrowDown from the search box", async () => {
    const user = userEvent.setup();
    const six = [
      profile("alpha", "anthropic/a"),
      profile("beta", "anthropic/b"),
      profile("gamma", "openai/c"),
      profile("delta", "openai/d"),
      profile("epsilon", "gemini/e"),
      profile("zeta", "gemini/f"),
    ];
    renderMenu({ profiles: six, currentProfileName: "alpha" });
    const input = screen.getByTestId("llm-model-picker-search-input");
    input.focus();
    await user.keyboard("{ArrowDown}");
    // First option in render order (grouped: anthropic group first).
    expect(
      screen.getByTestId("chat-input-llm-profile-option-alpha"),
    ).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByTestId("chat-input-llm-profile-option-beta"),
    ).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(
      screen.getByTestId("chat-input-llm-profile-option-alpha"),
    ).toHaveFocus();
  });

  it("renders the loading state", () => {
    renderMenu({ isLoading: true });
    expect(screen.getByTestId("llm-model-picker-loading")).toBeInTheDocument();
  });

  it("renders the error state with a settings deep link", () => {
    renderMenu({ isError: true, profiles: [] });
    expect(screen.getByTestId("llm-model-picker-error")).toBeInTheDocument();
    const link = screen.getByTestId("llm-model-picker-settings-link");
    expect(link).toHaveAttribute("href", "/settings/llm");
  });

  it("renders the empty state with a settings deep link when no profiles exist", () => {
    renderMenu({ profiles: [], currentProfileName: null });
    expect(screen.getByTestId("llm-model-picker-empty")).toBeInTheDocument();
    expect(
      screen.getByTestId("llm-model-picker-settings-link"),
    ).toHaveAttribute("href", "/settings/llm");
  });

  it("always exposes the settings deep link alongside options", () => {
    renderMenu();
    const link = screen.getByTestId("llm-model-picker-settings-link");
    expect(within(link).getByText("LLM Profiles")).toBeInTheDocument();
  });
});
