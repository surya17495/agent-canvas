import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { contributionRegistry } from "#/extensions/contribution-registry";
import { createAppHostDeps } from "#/extensions/host/create-app-host-deps";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

vi.mock("react-hot-toast", () => ({ default: vi.fn() }));

describe("createAppHostDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConversationService.setCurrentConversation(null);
    contributionRegistry.clear();
    localStorage.clear();
  });

  afterEach(() => {
    ConversationService.setCurrentConversation(null);
    contributionRegistry.clear();
    localStorage.clear();
  });

  it("maps the active conversation to a summary", () => {
    const deps = createAppHostDeps();
    expect(deps.getActiveConversation()).toBeNull();

    ConversationService.setCurrentConversation({
      id: "c1",
      title: "My chat",
      execution_status: "RUNNING",
    } as unknown as AppConversation);

    expect(deps.getActiveConversation()).toEqual({
      id: "c1",
      title: "My chat",
      status: "RUNNING",
    });
  });

  it("shows an information message via toast", () => {
    createAppHostDeps().showInformationMessage("hi there");
    expect(toast).toHaveBeenCalledWith("hi there", expect.any(Object));
  });

  it("dispatches a contributed command by id", async () => {
    const run = vi.fn();
    contributionRegistry.register("acme.hello", {
      commands: [
        { extensionId: "acme.hello", command: "hello.say", title: "Say", run },
      ],
    });

    await createAppHostDeps().executeCommand("hello.say", []);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("warns and no-ops for an unknown command", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createAppHostDeps().executeCommand("nope", []);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("round-trips namespaced storage", () => {
    const deps = createAppHostDeps();
    expect(deps.storageGet("acme.hello", "k")).toBeNull();

    deps.storageSet("acme.hello", "k", { n: 1 });
    expect(deps.storageGet("acme.hello", "k")).toEqual({ n: 1 });
    // Namespaced per extension.
    expect(deps.storageGet("other.ext", "k")).toBeNull();
  });
});
