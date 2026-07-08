import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

const useRuntimeIsReadyMock = vi.fn();
vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: () => useRuntimeIsReadyMock(),
}));

const executeCommandSpy = vi.spyOn(AgentServerRuntimeService, "executeCommand");

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function WorkspaceFilesTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const baseConversation = {
  id: "conv-1",
  conversation_url: "https://runtime.example.com/api/conversations/conv-1",
  session_api_key: "session-key",
};

describe("useWorkspaceFiles", () => {
  beforeEach(() => {
    useActiveConversationMock.mockReset();
    useRuntimeIsReadyMock.mockReset();
    executeCommandSpy.mockReset();

    useRuntimeIsReadyMock.mockReturnValue(true);
    executeCommandSpy.mockResolvedValue({
      exit_code: 0,
      stdout: "./hello.txt\n./src/index.ts\n",
      stderr: "",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function getCwdArg() {
    // executeCommand(conversationUrl, sessionApiKey, command, cwd, timeout)
    return executeCommandSpy.mock.calls[0][3];
  }

  it("lists files against an absolute working dir", async () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        ...baseConversation,
        workspace: { working_dir: "/workspace/project" },
      },
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCwdArg()).toBe("/workspace/project");
    expect(result.current.data).toEqual(["hello.txt", "src/index.ts"]);
  });

  it("absolutizes a relative working dir before listing (regression: empty File view)", async () => {
    // A relative working_dir would be resolved by the agent-server against
    // its own process cwd (not the workspace root) and the `find` would
    // fail, leaving the File view empty while the Diff view still works.
    useActiveConversationMock.mockReturnValue({
      data: {
        ...baseConversation,
        workspace: { working_dir: "workspace/project" },
      },
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCwdArg()).toBe("/workspace/project");
  });

  it("falls back to a resolved absolute dir when working_dir is missing", async () => {
    useActiveConversationMock.mockReturnValue({
      data: { ...baseConversation, workspace: {} },
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    // Query must still run (not gated off the missing working_dir) and
    // target an absolute path.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCwdArg()).toBe("/workspace/project");
  });

  it("derives the dir from the selected repository when working_dir is absent", async () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        ...baseConversation,
        selected_repository: "OpenHands/agent-canvas",
        workspace: {},
      },
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCwdArg()).toBe("/workspace/project/agent-canvas");
  });
});
