import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ObservationPairEventMessage } from "#/components/conversation-events/chat/event-message-components/observation-pair-event-message";
import type { ActionEvent, OpenHandsEvent } from "#/types/agent-server/core";
import { SecurityRisk } from "#/types/agent-server/core";
import type {
  ExecuteBashAction,
  ThinkAction,
} from "#/types/agent-server/core/base/action";
import type { TextContent } from "#/types/agent-server/core/base/common";

vi.mock("#/components/features/chat/chat-message", () => ({
  ChatMessage: ({ type, message }: { type: string; message: string }) => (
    <div data-testid="chat-message" data-message-type={type}>
      {message}
    </div>
  ),
}));

function createBashActionEvent(
  overrides: Partial<ActionEvent<ExecuteBashAction>> = {},
): ActionEvent<ExecuteBashAction> {
  return {
    id: "action-1",
    timestamp: "2026-07-13T00:00:00.000Z",
    source: "agent",
    thought: [{ type: "text", text: "Inspect the workspace" }],
    thinking_blocks: [],
    action: {
      kind: "ExecuteBashAction",
      command: "ls",
      is_input: false,
      timeout: null,
      reset: false,
    },
    tool_name: "execute_bash",
    tool_call_id: "tool-call-1",
    tool_call: {
      id: "tool-call-1",
      type: "function",
      function: {
        name: "execute_bash",
        arguments: JSON.stringify({ command: "ls" }),
      },
    },
    llm_response_id: "response-1",
    security_risk: SecurityRisk.UNKNOWN,
    ...overrides,
  };
}

function createThinkActionEvent(): ActionEvent<ThinkAction> {
  return {
    ...createBashActionEvent(),
    action: {
      kind: "ThinkAction",
      thought: "Consider the next step",
    },
    tool_name: "think",
    thought: [{ type: "text", text: "Consider the next step" }],
  } as ActionEvent<ThinkAction>;
}

describe("observation-pair thought display", () => {
  it("joins text thought blocks and ignores non-text runtime content", () => {
    const nonTextThought = {
      type: "image",
      image_urls: ["data:image/png;base64,example"],
    } as unknown as TextContent;
    const event = createBashActionEvent({
      thought: [
        { type: "text", text: "Inspect the workspace" },
        nonTextThought,
        { type: "text", text: "Run the focused tests" },
      ],
    });

    render(<ObservationPairEventMessage event={event} />);

    const message = screen.getByTestId("chat-message");
    expect(message).toHaveAttribute("data-message-type", "agent");
    expect(message.textContent).toBe(
      "Inspect the workspace\nRun the focused tests",
    );
  });

  it("renders nothing for an event that is not an action", () => {
    const nonActionEvent = {
      id: "observation-1",
      timestamp: "2026-07-13T00:00:01.000Z",
      source: "environment",
      tool_name: "execute_bash",
      tool_call_id: "tool-call-1",
    } as OpenHandsEvent;

    const { container } = render(
      <ObservationPairEventMessage
        event={nonActionEvent as unknown as ActionEvent}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when an action has no textual thought", () => {
    const { container } = render(
      <ObservationPairEventMessage
        event={createBashActionEvent({ thought: [] })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("does not duplicate a ThinkAction thought as a chat message", () => {
    const { container } = render(
      <ObservationPairEventMessage event={createThinkActionEvent()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a malformed action with an empty runtime kind", () => {
    const malformedAction = createBashActionEvent({
      action: { kind: "" } as unknown as ExecuteBashAction,
    });

    const { container } = render(
      <ObservationPairEventMessage event={malformedAction} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
