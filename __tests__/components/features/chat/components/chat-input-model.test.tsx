import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "test-utils";

const useChatInputLlmDisplayMock = vi.fn();

vi.mock(
  "#/components/features/chat/components/use-chat-input-llm-display",
  () => ({
    useChatInputLlmDisplay: () => useChatInputLlmDisplayMock(),
  }),
);

// eslint-disable-next-line import/first
import { ChatInputModel } from "#/components/features/chat/components/chat-input-model";

describe("ChatInputModel", () => {
  beforeEach(() => {
    useChatInputLlmDisplayMock.mockReset();
  });

  it("renders the resolved LLM label when present", () => {
    useChatInputLlmDisplayMock.mockReturnValue({
      label: "openai/gpt-4o",
      model: "openai/gpt-4o",
      profileName: null,
      title: "openai/gpt-4o",
    });

    renderWithProviders(<ChatInputModel />);

    const model = screen.getByTestId("chat-input-llm-model");
    expect(model).toBeInTheDocument();
    expect(model).toHaveTextContent("openai/gpt…");
    expect(model).toHaveAttribute("title", "openai/gpt-4o");
    expect(
      screen.queryByTestId("chat-input-llm-model-popover"),
    ).not.toBeInTheDocument();

    fireEvent.click(model);
    const popover = screen.getByTestId("chat-input-llm-model-popover");
    expect(popover).toHaveTextContent("openai/gpt-4o");
    const llmSettingsLink = screen.getByRole("link", {
      name: /LLM Profiles|SETTINGS\$LLM_PROFILES|LLM Settings|SETTINGS\$LLM_SETTINGS/,
    });
    expect(llmSettingsLink).toHaveAttribute("href", "/settings");
  });

  it("renders the profile name when the active model resolves to a saved profile", () => {
    useChatInputLlmDisplayMock.mockReturnValue({
      label: "haiku",
      model: "anthropic/claude-3-5-haiku-20241022",
      profileName: "haiku",
      title: "haiku (anthropic/claude-3-5-haiku-20241022)",
    });

    renderWithProviders(<ChatInputModel />);

    const model = screen.getByTestId("chat-input-llm-model");
    expect(model).toHaveTextContent("haiku");
    expect(model).toHaveAttribute(
      "title",
      "haiku (anthropic/claude-3-5-haiku-20241022)",
    );

    fireEvent.click(model);
    const popover = screen.getByTestId("chat-input-llm-model-popover");
    expect(popover).toHaveTextContent("haiku");
    expect(popover).toHaveTextContent("anthropic/claude-3-5-haiku-20241022");
  });

  it("renders nothing when no LLM display info is available", () => {
    useChatInputLlmDisplayMock.mockReturnValue(null);

    renderWithProviders(<ChatInputModel />);

    expect(
      screen.queryByTestId("chat-input-llm-model"),
    ).not.toBeInTheDocument();
  });
});
