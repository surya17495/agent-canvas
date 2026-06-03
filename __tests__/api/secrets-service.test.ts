import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSecret, mockGetActiveBackend } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockGetActiveBackend: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: vi.fn(function SettingsClientMock() {
    return { getSecret: mockGetSecret };
  }),
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: mockGetActiveBackend,
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: vi.fn(() => ({ host: "http://127.0.0.1:8000" })),
}));

vi.mock("#/api/cloud/secrets-service.api", () => ({
  createCloudSecret: vi.fn(),
  deleteCloudSecret: vi.fn(),
  fetchCloudSecrets: vi.fn(),
  updateCloudSecret: vi.fn(),
}));

import { SecretsService } from "#/api/secrets-service";

describe("SecretsService.getSecretValues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveBackend.mockReturnValue({ backend: { kind: "local" } });
  });

  it("reads back values for the requested names on a local backend", async () => {
    mockGetSecret.mockImplementation((name: string) =>
      Promise.resolve(name === "CODEX_AUTH_JSON" ? '{"a":1}' : "sk-abc"),
    );

    const values = await SecretsService.getSecretValues([
      "CODEX_AUTH_JSON",
      "OPENAI_API_KEY",
    ]);

    expect(values).toEqual({
      CODEX_AUTH_JSON: '{"a":1}',
      OPENAI_API_KEY: "sk-abc",
    });
  });

  it("omits secrets that error (e.g. deleted mid-flight) without failing the batch", async () => {
    mockGetSecret.mockImplementation((name: string) =>
      name === "MISSING"
        ? Promise.reject(new Error("404"))
        : Promise.resolve("value"),
    );

    const values = await SecretsService.getSecretValues(["MISSING", "PRESENT"]);

    expect(values).toEqual({ PRESENT: "value" });
  });

  it("drops blank / whitespace-only values", async () => {
    mockGetSecret.mockResolvedValue("   ");

    const values = await SecretsService.getSecretValues(["EMPTY"]);

    expect(values).toEqual({});
  });

  it("returns {} on a cloud backend without reading any secret (out of scope: #1016)", async () => {
    mockGetActiveBackend.mockReturnValue({ backend: { kind: "cloud" } });

    const values = await SecretsService.getSecretValues(["ANTHROPIC_API_KEY"]);

    expect(values).toEqual({});
    expect(mockGetSecret).not.toHaveBeenCalled();
  });

  it("returns {} for an empty name list without touching the backend", async () => {
    const values = await SecretsService.getSecretValues([]);

    expect(values).toEqual({});
    expect(mockGetActiveBackend).not.toHaveBeenCalled();
  });
});
