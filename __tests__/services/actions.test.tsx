import { afterEach, describe, expect, it, vi } from "vitest";
import ActionType from "#/types/action-type";
import type {
  ActionMessage,
  ObservationMessage,
  StatusMessage,
} from "#/types/message";
import {
  handleActionMessage,
  handleAssistantMessage,
} from "#/services/actions";
import useMetricsStore from "#/stores/metrics-store";
import { useCommandStore } from "#/stores/command-store";
import {
  ActionSecurityRisk,
  useSecurityAnalyzerStore,
} from "#/stores/security-analyzer-store";
import { useStatusStore } from "#/stores/status-store";

const { mockHandleObservationMessage } = vi.hoisted(() => ({
  mockHandleObservationMessage: vi.fn(),
}));

vi.mock("#/services/observations", () => ({
  handleObservationMessage: mockHandleObservationMessage,
}));

const TOKEN_USAGE = {
  prompt_tokens: 10,
  completion_tokens: 5,
  cache_read_tokens: 3,
  cache_write_tokens: 2,
  context_window: 128_000,
  per_turn_token: 15,
};

function buildActionMessage(
  overrides: Partial<ActionMessage> = {},
): ActionMessage {
  return {
    id: 1,
    source: "agent",
    action: ActionType.THINK,
    args: {},
    message: "Agent action",
    timestamp: "2026-07-13T00:00:00Z",
    ...overrides,
  };
}

function installActionStoreSpies() {
  const appendInput = vi.fn();
  const setMetrics = vi.fn();
  const appendSecurityAnalyzerInput = vi.fn();

  useCommandStore.setState({ appendInput });
  useMetricsStore.setState({ setMetrics });
  useSecurityAnalyzerStore.setState({ appendSecurityAnalyzerInput });

  return { appendInput, setMetrics, appendSecurityAnalyzerInput };
}

afterEach(() => {
  useCommandStore.setState(useCommandStore.getInitialState(), true);
  useMetricsStore.setState(useMetricsStore.getInitialState(), true);
  useSecurityAnalyzerStore.setState(
    useSecurityAnalyzerStore.getInitialState(),
    true,
  );
  useStatusStore.setState(useStatusStore.getInitialState(), true);
  vi.clearAllMocks();
});

describe("handleActionMessage", () => {
  it("ignores every side effect of a hidden action", () => {
    const stores = installActionStoreSpies();

    handleActionMessage(
      buildActionMessage({
        action: ActionType.RUN,
        args: {
          command: "secret command",
          hidden: "true",
          security_risk: String(ActionSecurityRisk.HIGH),
        },
        llm_metrics: {
          accumulated_cost: 1.25,
          max_budget_per_task: 10,
          accumulated_token_usage: TOKEN_USAGE,
        },
      }),
    );

    expect(stores.appendInput).not.toHaveBeenCalled();
    expect(stores.setMetrics).not.toHaveBeenCalled();
    expect(stores.appendSecurityAnalyzerInput).not.toHaveBeenCalled();
  });

  it("forwards zero-valued and populated LLM metrics without losing data", () => {
    const stores = installActionStoreSpies();

    handleActionMessage(
      buildActionMessage({
        llm_metrics: {
          accumulated_cost: 0,
          max_budget_per_task: 0,
          accumulated_token_usage: TOKEN_USAGE,
        },
      }),
    );

    expect(stores.setMetrics).toHaveBeenCalledOnce();
    expect(stores.setMetrics).toHaveBeenCalledWith({
      cost: 0,
      max_budget_per_task: 0,
      usage: TOKEN_USAGE,
    });
  });

  it("normalizes missing values in a present metrics payload to null", () => {
    const stores = installActionStoreSpies();

    handleActionMessage(
      buildActionMessage({
        llm_metrics: {} as NonNullable<ActionMessage["llm_metrics"]>,
      }),
    );

    expect(stores.setMetrics).toHaveBeenCalledWith({
      cost: null,
      max_budget_per_task: null,
      usage: null,
    });
  });

  it.each(["ls -la", ""])(
    "appends the exact RUN command boundary value %j",
    (command) => {
      const stores = installActionStoreSpies();

      handleActionMessage(
        buildActionMessage({
          action: ActionType.RUN,
          args: { command, hidden: "" },
        }),
      );

      expect(stores.appendInput).toHaveBeenCalledOnce();
      expect(stores.appendInput).toHaveBeenCalledWith(command);
    },
  );

  it("does not append terminal input for non-RUN actions", () => {
    const stores = installActionStoreSpies();

    handleActionMessage(
      buildActionMessage({
        action: ActionType.RUN_IPYTHON,
        args: { code: "print('Jupyter is unavailable')" },
      }),
    );

    expect(stores.appendInput).not.toHaveBeenCalled();
  });

  it("forwards security-analysis fields without coercing their values", () => {
    const stores = installActionStoreSpies();

    handleActionMessage(
      buildActionMessage({
        id: 73,
        args: {
          command: "rm -rf build",
          code: "cleanup()",
          content: "Delete generated output",
          security_risk: ActionSecurityRisk.HIGH as unknown as string,
          confirmation_state: "confirmed",
        },
        message: "Clean the build directory",
      }),
    );

    expect(stores.appendSecurityAnalyzerInput).toHaveBeenCalledOnce();
    expect(stores.appendSecurityAnalyzerInput).toHaveBeenCalledWith({
      id: 73,
      args: {
        command: "rm -rf build",
        code: "cleanup()",
        content: "Delete generated output",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "confirmed",
      },
      message: "Clean the build directory",
    });
  });

  it("does not emit a security entry when args omit security_risk", () => {
    const stores = installActionStoreSpies();

    handleActionMessage(buildActionMessage({ args: { command: "pwd" } }));

    expect(stores.appendSecurityAnalyzerInput).not.toHaveBeenCalled();
  });

  it("safely ignores an action envelope with no args", () => {
    const stores = installActionStoreSpies();
    const messageWithoutArgs: Omit<ActionMessage, "args"> = {
      id: 99,
      source: "agent",
      action: ActionType.THINK,
      message: "Thinking",
      timestamp: "2026-07-13T00:00:00Z",
    };

    handleActionMessage(messageWithoutArgs as ActionMessage);

    expect(stores.appendInput).not.toHaveBeenCalled();
    expect(stores.setMetrics).not.toHaveBeenCalled();
    expect(stores.appendSecurityAnalyzerInput).not.toHaveBeenCalled();
  });
});

describe("handleAssistantMessage", () => {
  it("gives action messages precedence over observation and status flags", () => {
    const stores = installActionStoreSpies();
    const previousStatus = useStatusStore.getState().curStatusMessage;
    const message = {
      ...buildActionMessage({
        action: ActionType.RUN,
        args: { command: "npm test" },
      }),
      observation: "run",
      status_update: true,
      type: "info",
    };

    handleAssistantMessage(message as unknown as Record<string, unknown>);

    expect(stores.appendInput).toHaveBeenCalledWith("npm test");
    expect(mockHandleObservationMessage).not.toHaveBeenCalled();
    expect(useStatusStore.getState().curStatusMessage).toBe(previousStatus);
  });

  it("forwards observation messages unchanged", () => {
    const message: ObservationMessage = {
      observation: "run",
      id: 7,
      cause: 6,
      content: "command output",
      extras: { metadata: {}, error_id: "" },
      message: "Command finished",
      timestamp: "2026-07-13T00:00:00Z",
    };

    handleAssistantMessage(message as unknown as Record<string, unknown>);

    expect(mockHandleObservationMessage).toHaveBeenCalledOnce();
    expect(mockHandleObservationMessage).toHaveBeenCalledWith(message);
  });

  it("routes status updates when no action or observation is present", () => {
    const message: StatusMessage = {
      status_update: true,
      type: "info",
      id: "ready-status",
      message: "Agent is ready",
    };

    handleAssistantMessage(message as unknown as Record<string, unknown>);

    expect(useStatusStore.getState().curStatusMessage).toEqual(message);
    expect(useStatusStore.getState().curStatusMessage).not.toBe(message);
    expect(mockHandleObservationMessage).not.toHaveBeenCalled();
  });

  it("ignores assistant envelopes without a recognized message flag", () => {
    const previousStatus = useStatusStore.getState().curStatusMessage;

    handleAssistantMessage({
      action: "",
      observation: "",
      status_update: false,
      type: "info",
      message: "This is not a status update",
    });

    expect(mockHandleObservationMessage).not.toHaveBeenCalled();
    expect(useStatusStore.getState().curStatusMessage).toBe(previousStatus);
  });
});
