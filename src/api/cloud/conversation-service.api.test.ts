import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_CANVAS_CLIENT_HEADERS } from "../client-source";

const mocks = vi.hoisted(() => ({
  callCloudProxy: vi.fn(),
}));

vi.mock("../backend-registry/active-store", () => ({
  getActiveBackend: () => ({
    backend: {
      id: "cloud",
      kind: "cloud",
      name: "OpenHands Cloud",
      host: "https://app.all-hands.dev",
      apiKey: "api-key",
    },
  }),
}));

vi.mock("./proxy", () => ({
  callCloudProxy: mocks.callCloudProxy,
}));

import { createCloudAppConversation } from "./conversation-service.api";

beforeEach(() => {
  mocks.callCloudProxy.mockReset();
  mocks.callCloudProxy.mockResolvedValue({ id: "start-task" });
});

describe("createCloudAppConversation", () => {
  it("marks Cloud conversation starts as originating from Agent Canvas", async () => {
    const request = {
      initial_message: null,
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      plugins: null,
      parent_conversation_id: null,
    };

    await createCloudAppConversation(request);

    expect(mocks.callCloudProxy).toHaveBeenCalledWith({
      backend: expect.objectContaining({ kind: "cloud" }),
      method: "POST",
      path: "/api/v1/app-conversations",
      body: request,
      headers: AGENT_CANVAS_CLIENT_HEADERS,
    });
  });
});
