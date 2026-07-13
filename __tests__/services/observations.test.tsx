import { afterEach, describe, expect, it } from "vitest";
import { handleObservationMessage } from "#/services/observations";
import { useAgentStore } from "#/stores/agent-store";
import { useBrowserStore } from "#/stores/browser-store";
import { useCommandStore } from "#/stores/command-store";
import { AgentState } from "#/types/agent-state";
import type { ObservationMessage } from "#/types/message";
import ObservationType from "#/types/observation-type";

function createObservationMessage(
  observation: string,
  overrides: Partial<ObservationMessage> = {},
): ObservationMessage {
  return {
    observation,
    id: 1,
    cause: 0,
    content: "content",
    extras: { metadata: {}, error_id: "" },
    message: "message",
    timestamp: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  useCommandStore.getState().clearTerminal();
  useBrowserStore.getState().reset();
  useAgentStore.getState().reset();
});

describe("observation state updates", () => {
  it("appends visible command output and ignores hidden output", () => {
    handleObservationMessage(
      createObservationMessage(ObservationType.RUN, { content: "visible" }),
    );
    handleObservationMessage(
      createObservationMessage(ObservationType.RUN, {
        content: "hidden",
        extras: {
          metadata: {},
          error_id: "",
          hidden: "true",
        },
      }),
    );

    expect(useCommandStore.getState().commands).toEqual([
      { content: "visible", type: "output" },
    ]);
  });

  it("preserves output at the limit and truncates only the middle of longer output", () => {
    const atLimit = "x".repeat(5000);
    const removed = "removed";
    const head = "h".repeat(2500);
    const tail = "t".repeat(2500);
    const longOutput = `${head}${removed}${tail}`;

    handleObservationMessage(
      createObservationMessage(ObservationType.RUN, { content: atLimit }),
    );
    handleObservationMessage(
      createObservationMessage(ObservationType.RUN, { content: longOutput }),
    );

    expect(useCommandStore.getState().commands).toEqual([
      { content: atLimit, type: "output" },
      {
        content: `${head}\r\n\n... (truncated ${removed.length} characters) ...\r\n\n${tail}`,
        type: "output",
      },
    ]);
  });

  it.each([ObservationType.BROWSE, ObservationType.BROWSE_INTERACTIVE])(
    "updates the browser from a visible %s observation",
    (observation) => {
      handleObservationMessage(
        createObservationMessage(observation, {
          extras: {
            metadata: {},
            error_id: "",
            screenshot: "data:image/png;base64,abc",
            url: "https://example.com",
          },
        }),
      );

      expect(useBrowserStore.getState()).toMatchObject({
        screenshotSrc: "data:image/png;base64,abc",
        url: "https://example.com",
      });
    },
  );

  it("leaves browser state unchanged for empty, absent, or non-string fields", () => {
    useBrowserStore.getState().setScreenshotSrc("existing-screenshot");
    useBrowserStore.getState().setUrl("https://existing.example");

    handleObservationMessage(
      createObservationMessage(ObservationType.BROWSE, {
        extras: {
          metadata: {},
          error_id: "",
          screenshot: "",
          url: "",
        },
      }),
    );
    handleObservationMessage(
      createObservationMessage(ObservationType.BROWSE_INTERACTIVE),
    );
    handleObservationMessage(
      createObservationMessage(ObservationType.BROWSE, {
        extras: {
          metadata: {},
          error_id: "",
          screenshot: { invalid: true },
          url: { invalid: true },
        },
      }),
    );
    handleObservationMessage(
      createObservationMessage(ObservationType.BROWSE, {
        extras: undefined as never,
      }),
    );

    expect(useBrowserStore.getState()).toMatchObject({
      screenshotSrc: "existing-screenshot",
      url: "https://existing.example",
    });
  });

  it("updates agent state only when the supplied state is a string", () => {
    handleObservationMessage(
      createObservationMessage(ObservationType.AGENT_STATE_CHANGED, {
        extras: {
          metadata: {},
          error_id: "",
          agent_state: AgentState.RUNNING,
        },
      }),
    );
    expect(useAgentStore.getState().curAgentState).toBe(AgentState.RUNNING);

    handleObservationMessage(
      createObservationMessage(ObservationType.AGENT_STATE_CHANGED, {
        extras: {
          metadata: {},
          error_id: "",
          agent_state: { invalid: true },
        },
      }),
    );
    expect(useAgentStore.getState().curAgentState).toBe(AgentState.RUNNING);
  });

  it.each([
    ObservationType.DELEGATE,
    ObservationType.READ,
    ObservationType.EDIT,
    ObservationType.THINK,
    ObservationType.NULL,
    ObservationType.RECALL,
    ObservationType.ERROR,
    ObservationType.MCP,
    ObservationType.TASK_TRACKING,
    ObservationType.RUN_IPYTHON,
    ObservationType.CHAT,
    "future_observation",
  ])("ignores %s without changing any state", (observation) => {
    handleObservationMessage(createObservationMessage(observation));

    expect(useCommandStore.getState().commands).toEqual([]);
    expect(useBrowserStore.getState()).toMatchObject({
      screenshotSrc: "",
      url: "",
    });
    expect(useAgentStore.getState().curAgentState).toBe(AgentState.LOADING);
  });
});
