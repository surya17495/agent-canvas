import { describe, expect, it } from "vitest";
import {
  ActionSecurityRisk,
  useSecurityAnalyzerStore,
} from "#/stores/security-analyzer-store";

describe("useSecurityAnalyzerStore", () => {
  const resetStore = () => {
    useSecurityAnalyzerStore.getState().clearLogs();
    return useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput;
  };

  it.each([
    [{ command: "npm test" }, "npm test"],
    [{ code: "print(1)" }, "print(1)"],
    [{ content: "write file" }, "write file"],
    [{}, "fallback message"],
    [{}, ""],
  ])("chooses the first available log content", (args, content) => {
    resetStore();
    useSecurityAnalyzerStore.getState().appendSecurityAnalyzerInput({
      id: 1,
      args: { ...args, security_risk: ActionSecurityRisk.LOW },
      ...(content === "fallback message" && { message: content }),
    });
    expect(useSecurityAnalyzerStore.getState().logs[0]).toMatchObject({
      id: 1,
      content,
      security_risk: ActionSecurityRisk.LOW,
      confirmed_changed: false,
    });
  });

  it("updates an existing id only when confirmation state changes", () => {
    const append = resetStore();
    append({
      id: 1,
      args: {
        command: "deploy",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "awaiting_confirmation",
      },
    });
    append({
      id: 1,
      args: {
        command: "different content is ignored",
        security_risk: ActionSecurityRisk.MEDIUM,
        confirmation_state: "awaiting_confirmation",
      },
    });
    expect(useSecurityAnalyzerStore.getState().logs).toHaveLength(1);
    expect(useSecurityAnalyzerStore.getState().logs[0].confirmed_changed).toBe(
      false,
    );
    const unchangedLogs = useSecurityAnalyzerStore.getState().logs;
    append({
      id: 1,
      args: {
        command: "deploy",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "awaiting_confirmation",
      },
    });
    expect(useSecurityAnalyzerStore.getState().logs).not.toBe(unchangedLogs);

    append({
      id: 1,
      args: {
        command: "deploy",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "confirmed",
      },
    });
    expect(useSecurityAnalyzerStore.getState().logs[0]).toMatchObject({
      confirmation_state: "confirmed",
      confirmed_changed: true,
    });
  });

  it("matches a later confirmation observation by pending content", () => {
    const append = resetStore();
    append({
      id: 1,
      args: {
        command: "delete file",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "awaiting_confirmation",
      },
    });
    append({
      id: 2,
      args: {
        command: "delete file",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "rejected",
      },
    });
    expect(useSecurityAnalyzerStore.getState().logs).toEqual([
      expect.objectContaining({
        id: 1,
        confirmation_state: "rejected",
        confirmed_changed: true,
      }),
    ]);
  });

  it("does not merge different content into an awaiting confirmation", () => {
    const append = resetStore();
    append({
      id: 1,
      args: {
        command: "first",
        security_risk: ActionSecurityRisk.HIGH,
        confirmation_state: "awaiting_confirmation",
      },
    });
    append({
      id: 2,
      args: { command: "second", security_risk: ActionSecurityRisk.LOW },
    });
    expect(useSecurityAnalyzerStore.getState().logs).toHaveLength(2);
  });

  it("does not merge matching content after confirmation is resolved", () => {
    const append = resetStore();
    append({
      id: 1,
      args: {
        command: "same command",
        security_risk: ActionSecurityRisk.UNKNOWN,
        confirmation_state: "confirmed",
      },
    });
    append({
      id: 2,
      args: {
        command: "same command",
        security_risk: ActionSecurityRisk.LOW,
        confirmation_state: "rejected",
      },
    });
    expect(useSecurityAnalyzerStore.getState().logs).toHaveLength(2);

    useSecurityAnalyzerStore.getState().clearLogs();
    expect(useSecurityAnalyzerStore.getState().logs).toEqual([]);
  });
});
