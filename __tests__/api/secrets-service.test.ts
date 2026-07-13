import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretsService } from "#/api/secrets-service";

const mocks = vi.hoisted(() => ({
  backendKind: "local" as "local" | "cloud",
  list: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  fetchCloud: vi.fn(),
  createCloud: vi.fn(),
  updateCloud: vi.fn(),
  deleteCloud: vi.fn(),
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: () => ({ backend: { kind: mocks.backendKind } }),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: vi.fn(function SettingsClientMock() {
    return {
      listSecrets: mocks.list,
      upsertSecret: mocks.upsert,
      deleteSecret: mocks.remove,
    };
  }),
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: () => ({ host: "http://localhost" }),
}));

vi.mock("#/api/cloud/secrets-service.api", () => ({
  fetchCloudSecrets: mocks.fetchCloud,
  createCloudSecret: mocks.createCloud,
  updateCloudSecret: mocks.updateCloud,
  deleteCloudSecret: mocks.deleteCloud,
}));

const setupMocks = () => {
  vi.clearAllMocks();
  mocks.backendKind = "local";
  mocks.list.mockResolvedValue({ secrets: [] });
  mocks.upsert.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.fetchCloud.mockResolvedValue([]);
  mocks.createCloud.mockResolvedValue(undefined);
  mocks.updateCloud.mockResolvedValue(undefined);
  mocks.deleteCloud.mockResolvedValue(undefined);
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SecretsService", () => {
  it("lists and maps local secret metadata", async () => {
    setupMocks();
    mocks.list.mockResolvedValue({
      secrets: [
        { name: "TOKEN", description: "Access token", value: "not-returned" },
      ],
    });
    await expect(SecretsService.getSecrets()).resolves.toEqual([
      { name: "TOKEN", description: "Access token" },
    ]);
  });

  it("lists cloud secret metadata", async () => {
    setupMocks();
    mocks.backendKind = "cloud";
    const secrets = [{ name: "TOKEN", description: null }];
    mocks.fetchCloud.mockResolvedValue(secrets);
    await expect(SecretsService.getSecrets()).resolves.toBe(secrets);
  });

  it("retries failed reads and returns an empty list after exhaustion", async () => {
    setupMocks();
    vi.useFakeTimers();
    const error = new Error("offline");
    mocks.list.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = SecretsService.getSecrets();
    expect(mocks.list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(mocks.list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual([]);
    expect(mocks.list).toHaveBeenCalledTimes(3);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to fetch secrets after retries:",
      error,
    );
  });

  it("retries once and then returns a successful read", async () => {
    setupMocks();
    vi.useFakeTimers();
    mocks.list
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ secrets: [] });
    const result = SecretsService.getSecrets();
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toEqual([]);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("creates and updates local secrets through upsert", async () => {
    setupMocks();
    await SecretsService.createSecret("TOKEN", "value", "description");
    await SecretsService.updateSecret("TOKEN", "next", undefined);
    expect(mocks.upsert).toHaveBeenNthCalledWith(1, {
      name: "TOKEN",
      value: "value",
      description: "description",
    });
    expect(mocks.upsert).toHaveBeenNthCalledWith(2, {
      name: "TOKEN",
      value: "next",
      description: undefined,
    });
  });

  it("creates and updates cloud secrets with cloud semantics", async () => {
    setupMocks();
    mocks.backendKind = "cloud";
    await SecretsService.createSecret("TOKEN", "value", "description");
    await SecretsService.updateSecret("TOKEN", "RENAMED", "next description");
    expect(mocks.createCloud).toHaveBeenCalledWith(
      "TOKEN",
      "value",
      "description",
    );
    expect(mocks.updateCloud).toHaveBeenCalledWith(
      "TOKEN",
      "RENAMED",
      "next description",
    );
  });

  it("deletes local and cloud secrets", async () => {
    setupMocks();
    await SecretsService.deleteSecret("LOCAL");
    expect(mocks.remove).toHaveBeenCalledWith("LOCAL");
    mocks.backendKind = "cloud";
    await SecretsService.deleteSecret("CLOUD");
    expect(mocks.deleteCloud).toHaveBeenCalledWith("CLOUD");
  });

  it("treats a missing local secret as successfully deleted", async () => {
    setupMocks();
    vi.useFakeTimers();
    mocks.remove.mockRejectedValue({ response: { status: 404 } });
    const result = SecretsService.deleteSecret("MISSING");
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBeUndefined();
  });

  it.each([
    null,
    "offline",
    new Error("offline"),
    { response: undefined },
    { response: { status: 500 } },
  ])("rethrows non-404 delete failures", async (error) => {
    setupMocks();
    vi.useFakeTimers();
    mocks.remove.mockRejectedValue(error);
    const result = SecretsService.deleteSecret("TOKEN");
    result.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(result).rejects.toBe(error);
  });
});
