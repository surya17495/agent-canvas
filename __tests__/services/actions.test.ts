import { afterEach, describe, expect, it, vi } from "vitest";
import { handleStatusMessage } from "#/services/actions";
import type { StatusMessage } from "#/types/message";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  setCurStatusMessage: vi.fn(),
  trackError: vi.fn(),
}));

vi.mock("#/query-client-config", () => ({
  queryClient: {
    invalidateQueries: mocks.invalidateQueries,
  },
}));

vi.mock("#/stores/status-store", () => ({
  useStatusStore: {
    getState: () => ({
      setCurStatusMessage: mocks.setCurStatusMessage,
    }),
  },
}));

vi.mock("#/utils/error-handler", () => ({
  trackError: mocks.trackError,
}));

function buildStatusMessage(
  overrides: Partial<StatusMessage> = {},
): StatusMessage {
  return {
    status_update: true,
    type: "info",
    id: "status-1",
    message: "Conversation status changed",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("handleStatusMessage", () => {
  it("invalidates only the updated conversation when an info message carries a title", () => {
    handleStatusMessage(
      buildStatusMessage({
        message: "conversation-123",
        conversation_title: "Renamed conversation",
      }),
    );

    expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["user", "conversation", "conversation-123"],
    });
    expect(mocks.setCurStatusMessage).not.toHaveBeenCalled();
    expect(mocks.trackError).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])(
    "stores an ordinary info message when its title is %j",
    (conversationTitle) => {
      const message = buildStatusMessage({
        message: "Agent is ready",
        conversation_title: conversationTitle,
      });

      handleStatusMessage(message);

      expect(mocks.setCurStatusMessage).toHaveBeenCalledOnce();
      const forwardedMessage = mocks.setCurStatusMessage.mock.calls[0]?.[0];
      expect(forwardedMessage).toEqual(message);
      expect(forwardedMessage).not.toBe(message);
      expect(mocks.invalidateQueries).not.toHaveBeenCalled();
      expect(mocks.trackError).not.toHaveBeenCalled();
    },
  );

  it("tracks chat errors with their status-message identity", () => {
    handleStatusMessage(
      buildStatusMessage({
        type: "error",
        id: "error-42",
        message: "The runtime disconnected",
      }),
    );

    expect(mocks.trackError).toHaveBeenCalledOnce();
    expect(mocks.trackError).toHaveBeenCalledWith({
      message: "The runtime disconnected",
      source: "chat",
      metadata: { msgId: "error-42" },
      posthog: undefined,
    });
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(mocks.setCurStatusMessage).not.toHaveBeenCalled();
  });

  it("ignores unrecognized status-message types even when they carry a title", () => {
    handleStatusMessage(
      buildStatusMessage({
        type: "warning",
        conversation_title: "Not a title update",
      }),
    );

    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(mocks.setCurStatusMessage).not.toHaveBeenCalled();
    expect(mocks.trackError).not.toHaveBeenCalled();
  });
});
