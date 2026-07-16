import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  settingsQuery: {
    data: {
      user_consents_to_analytics: false as boolean | null,
      email: "",
      git_user_email: "",
    },
    isFetched: false,
  },
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: mocks.capture }),
}));

vi.mock("./query/use-settings", () => ({
  useSettings: () => mocks.settingsQuery,
}));

import { useTracking } from "./use-tracking";

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.settingsQuery.data.user_consents_to_analytics = false;
  mocks.settingsQuery.isFetched = false;
  window.sessionStorage.clear();
});

describe("useTracking deferred consent", () => {
  it("captures the initial onboarding backend after consent resolves true", async () => {
    const { result, rerender } = renderHook(() => useTracking());

    act(() => {
      result.current.trackBackendAdded({
        backendKind: "cloud",
        connectionMethod: "cloud_login",
        isOpenhandsCloud: true,
        isCustomHost: false,
        hasApiKey: true,
        source: "onboarding",
      });
    });
    expect(mocks.capture).not.toHaveBeenCalled();

    mocks.settingsQuery.data.user_consents_to_analytics = true;
    mocks.settingsQuery.isFetched = true;
    rerender();

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith(
        "backend_added",
        expect.objectContaining({
          backend_kind: "cloud",
          connection_method: "cloud_login",
          is_openhands_cloud: true,
          source: "onboarding",
          client_source: "agent_canvas",
        }),
      ),
    );
  });

  it("discards deferred events when consent resolves false", () => {
    const { result, rerender } = renderHook(() => useTracking());

    act(() => {
      result.current.trackCloudDeviceAuthorizationSucceeded({
        isOpenhandsCloud: true,
        source: "onboarding",
      });
    });

    mocks.settingsQuery.isFetched = true;
    rerender();
    expect(mocks.capture).not.toHaveBeenCalled();

    mocks.settingsQuery.data.user_consents_to_analytics = true;
    rerender();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("deduplicates READY observations for the same Cloud task", () => {
    mocks.settingsQuery.data.user_consents_to_analytics = true;
    mocks.settingsQuery.isFetched = true;
    const { result } = renderHook(() => useTracking());

    act(() => {
      result.current.trackCloudConversationReady({
        taskId: "task-id",
        conversationId: "conversation-id",
      });
      result.current.trackCloudConversationReady({
        taskId: "task-id",
        conversationId: "conversation-id",
      });
    });

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      "cloud_conversation_ready",
      expect.objectContaining({
        task_id: "task-id",
        conversation_id: "conversation-id",
      }),
    );
  });
});
