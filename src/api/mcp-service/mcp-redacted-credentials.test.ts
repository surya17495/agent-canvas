import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsService, {
  type SettingsApiResponse,
} from "#/api/settings-service/settings-service.api";
import type { MCPServerConfig } from "#/types/mcp-server";
import { substituteRedactedMcpCredentials } from "./mcp-redacted-credentials";
import { REDACTED_MCP_SECRET_VALUE } from "#/utils/mcp-config";

const getStdioServer = (
  overrides: Partial<MCPServerConfig> = {},
): MCPServerConfig => ({
  id: "stdio-0",
  type: "stdio",
  name: "my-server",
  command: "npx",
  env: { API_KEY: REDACTED_MCP_SECRET_VALUE },
  ...overrides,
});

const getRemoteServer = (
  overrides: Partial<MCPServerConfig> = {},
): MCPServerConfig => ({
  id: "shttp-0",
  type: "shttp",
  url: "https://example.com/mcp",
  auth: { strategy: "bearer", value: REDACTED_MCP_SECRET_VALUE },
  ...overrides,
});

const mockEncryptedMcpConfig = (mcpConfig: unknown) =>
  vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
    agent_settings: { mcp_config: mcpConfig },
  } as unknown as SettingsApiResponse);

describe("substituteRedactedMcpCredentials", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves encrypted stdio env when the server is renamed", async () => {
    // Regression: renaming a stdio server left a redacted env value unchanged,
    // so the lookup by the new display name missed the stored entry and the
    // literal redaction placeholder overwrote the stored encrypted secret.
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
      agent_settings: {
        mcp_config: {
          "old-name": {
            command: "npx",
            env: { API_KEY: "gAAAAA-encrypted-api-key" },
          },
        },
      },
    } as unknown as SettingsApiResponse);

    const result = await substituteRedactedMcpCredentials({
      id: "stdio-0",
      type: "stdio",
      name: "new-name",
      command: "npx",
      env: { API_KEY: REDACTED_MCP_SECRET_VALUE },
    });

    expect(result.env).toEqual({ API_KEY: "gAAAAA-encrypted-api-key" });
    expect(result.name).toBe("new-name");
  });

  it("does not restore another server's secret when renamed onto an existing name", async () => {
    // Renaming "alpha" onto "beta"'s name must still resolve alpha's stored
    // entry by position, not beta's entry (which the name match would return).
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
      agent_settings: {
        mcp_config: {
          alpha: { command: "npx", env: { TOKEN: "gAAAAA-alpha-token" } },
          beta: { command: "npx", env: { TOKEN: "gAAAAA-beta-token" } },
        },
      },
    } as unknown as SettingsApiResponse);

    const result = await substituteRedactedMcpCredentials({
      id: "stdio-0",
      type: "stdio",
      name: "beta",
      command: "npx",
      env: { TOKEN: REDACTED_MCP_SECRET_VALUE },
    });

    expect(result.env).toEqual({ TOKEN: "gAAAAA-alpha-token" });
  });

  it("leaves typed (non-redacted) env values untouched", async () => {
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
      agent_settings: {
        mcp_config: {
          "my-server": {
            command: "npx",
            env: { API_KEY: "gAAAAA-encrypted", REGION: "us-east-1" },
          },
        },
      },
    } as unknown as SettingsApiResponse);

    const result = await substituteRedactedMcpCredentials({
      id: "stdio-0",
      type: "stdio",
      name: "my-server",
      command: "npx",
      env: {
        API_KEY: REDACTED_MCP_SECRET_VALUE,
        REGION: "eu-west-1",
      },
    });

    expect(result.env).toEqual({
      API_KEY: "gAAAAA-encrypted",
      REGION: "eu-west-1",
    });
  });

  it("returns the server unchanged when no env value is redacted", async () => {
    const fetchSpy = vi
      .spyOn(SettingsService, "fetchSettingsFromApi")
      .mockRejectedValue(new Error("unexpected fetch"));
    const server = {
      id: "stdio-0",
      type: "stdio" as const,
      name: "my-server",
      command: "npx",
      env: { API_KEY: "plaintext" },
    };

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toBe(server);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the placeholder when the stored stdio entry is missing", async () => {
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
      agent_settings: { mcp_config: {} },
    } as unknown as SettingsApiResponse);

    const result = await substituteRedactedMcpCredentials({
      id: "stdio-0",
      type: "stdio",
      name: "new-name",
      command: "npx",
      env: { API_KEY: REDACTED_MCP_SECRET_VALUE },
    });

    expect(result.env).toEqual({ API_KEY: REDACTED_MCP_SECRET_VALUE });
  });

  it("replaces redacted OAuth state with the encrypted stored subtree", async () => {
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
      agent_settings: {
        mcp_config: {
          "superhuman-mail": {
            url: "https://mcp.mail.superhuman.com/mcp",
            auth: {
              strategy: "oauth2",
              state: {
                tokens: {
                  access_token: "gAAAAA-encrypted-access-token",
                  refresh_token: "gAAAAA-encrypted-refresh-token",
                },
                client_info: {
                  client_id: "superhuman-client",
                  client_secret: "gAAAAA-encrypted-client-secret",
                },
              },
            },
          },
        },
      },
    } as unknown as SettingsApiResponse);

    const result = await substituteRedactedMcpCredentials({
      id: "shttp-0",
      type: "shttp",
      name: "superhuman-mail",
      url: "https://mcp.mail.superhuman.com/mcp",
      auth: {
        strategy: "oauth2",
        state: {
          tokens: {
            access_token: REDACTED_MCP_SECRET_VALUE,
            refresh_token: REDACTED_MCP_SECRET_VALUE,
          },
          client_info: {
            client_id: "superhuman-client",
            client_secret: REDACTED_MCP_SECRET_VALUE,
          },
        },
      },
    });

    expect(result.auth).toEqual({
      strategy: "oauth2",
      state: {
        tokens: {
          access_token: "gAAAAA-encrypted-access-token",
          refresh_token: "gAAAAA-encrypted-refresh-token",
        },
        client_info: {
          client_id: "superhuman-client",
          client_secret: "gAAAAA-encrypted-client-secret",
        },
      },
    });
  });

  it("selects a stdio server by position while ignoring remote entries", async () => {
    mockEncryptedMcpConfig({
      remote: {
        url: "https://example.com/mcp",
        transport: "shttp",
        env: { API_KEY: "gAAAAA-remote" },
      },
      alpha: { command: "alpha", env: { API_KEY: "gAAAAA-alpha" } },
      beta: { command: "beta", env: { API_KEY: "gAAAAA-beta" } },
    });
    const server = getStdioServer({
      id: "stdio-1",
      name: "renamed-beta",
      args: ["beta"],
      timeout: 4_000,
      env: {
        API_KEY: REDACTED_MCP_SECRET_VALUE,
        REGION: "eu-west-1",
      },
    });

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toEqual({
      ...server,
      env: { API_KEY: "gAAAAA-beta", REGION: "eu-west-1" },
    });
  });

  it.each([
    { label: "an empty id", id: "" },
    { label: "a non-positional id", id: "custom-id" },
  ])("falls back to the stored stdio name for $label", async ({ id }) => {
    const fetchSpy = mockEncryptedMcpConfig({
      "my-server": {
        command: "npx",
        env: { API_KEY: "gAAAAA-name-match" },
      },
    });
    const server = getStdioServer({ id });

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toEqual({
      ...server,
      env: { API_KEY: "gAAAAA-name-match" },
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith("encrypted");
  });

  it("keeps an exact stdio round trip when neither position nor name matches", async () => {
    mockEncryptedMcpConfig({
      alpha: { command: "alpha", env: { API_KEY: "gAAAAA-alpha" } },
    });
    const server = getStdioServer({ id: "stdio-9", name: undefined });

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toBe(server);
  });

  it.each([
    { label: "missing agent settings", response: {} },
    {
      label: "a null MCP config",
      response: { agent_settings: { mcp_config: null } },
    },
    {
      label: "a primitive MCP config",
      response: { agent_settings: { mcp_config: "invalid" } },
    },
    {
      label: "an array MCP config",
      response: { agent_settings: { mcp_config: [] } },
    },
  ])(
    "returns the exact server when encrypted settings contain $label",
    async ({ response }) => {
      const fetchSpy = vi
        .spyOn(SettingsService, "fetchSettingsFromApi")
        .mockResolvedValue(response as unknown as SettingsApiResponse);
      const server = getStdioServer();

      const result = await substituteRedactedMcpCredentials(server);

      expect(result).toBe(server);
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledWith("encrypted");
    },
  );

  it.each([
    { label: "null", storedEnv: null },
    { label: "an array", storedEnv: ["gAAAAA-array-value"] },
    { label: "a primitive", storedEnv: "gAAAAA-primitive-value" },
    { label: "a non-string record", storedEnv: { API_KEY: 42 } },
  ])(
    "does not substitute a redacted env from $label stored env",
    async ({ storedEnv }) => {
      mockEncryptedMcpConfig({
        "my-server": { command: "npx", env: storedEnv },
      });
      const server = getStdioServer({ id: "custom-id" });

      const result = await substituteRedactedMcpCredentials(server);

      expect(result).toEqual(server);
      expect(result).not.toBe(server);
    },
  );

  it("only restores string values from a partially malformed stored env", async () => {
    mockEncryptedMcpConfig({
      "my-server": {
        command: "npx",
        env: { API_KEY: "gAAAAA-encrypted", NUMERIC_SECRET: 42 },
      },
    });
    const server = getStdioServer({
      id: "custom-id",
      env: {
        API_KEY: REDACTED_MCP_SECRET_VALUE,
        NUMERIC_SECRET: REDACTED_MCP_SECRET_VALUE,
        REGION: "eu-west-1",
      },
    });

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toEqual({
      ...server,
      env: {
        API_KEY: "gAAAAA-encrypted",
        NUMERIC_SECRET: REDACTED_MCP_SECRET_VALUE,
        REGION: "eu-west-1",
      },
    });
  });

  it.each([
    ["sse", "sse", true],
    ["sse", "http", false],
    ["shttp", undefined, true],
    ["shttp", "http", true],
    ["shttp", "shttp", true],
    ["shttp", "streamable-http", true],
    ["shttp", "sse", false],
  ] as const)(
    "matches %s servers against the %s stored transport",
    async (type, transport, shouldRestore) => {
      const encryptedAuth = {
        strategy: "bearer" as const,
        value: `gAAAAA-${type}-${transport ?? "default"}`,
      };
      mockEncryptedMcpConfig({
        wrongUrl: {
          url: "https://wrong.example.com/mcp",
          transport,
          auth: { strategy: "bearer", value: "gAAAAA-wrong-url" },
        },
        candidate: {
          url: "https://example.com/mcp",
          transport,
          auth: encryptedAuth,
        },
      });
      const server = getRemoteServer({ id: `${type}-0`, type });

      const result = await substituteRedactedMcpCredentials(server);

      if (shouldRestore) {
        expect(result).toEqual({ ...server, auth: encryptedAuth });
      } else {
        expect(result).toBe(server);
      }
    },
  );

  it("falls back to URL and transport when a remote name is not stored", async () => {
    const encryptedAuth = {
      strategy: "api_key" as const,
      value: "gAAAAA-url-match",
      header_name: "X-API-Key",
    };
    mockEncryptedMcpConfig({
      storedRemote: {
        url: "https://example.com/mcp",
        transport: "http",
        auth: encryptedAuth,
      },
    });
    const server = getRemoteServer({ name: "renamed-remote" });

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toEqual({ ...server, auth: encryptedAuth });
  });

  it("prefers a remote name match over another server with the same URL", async () => {
    const namedAuth = {
      strategy: "bearer" as const,
      value: "gAAAAA-name-match",
    };
    mockEncryptedMcpConfig({
      preferred: {
        url: "https://old.example.com/mcp",
        transport: "sse",
        auth: namedAuth,
      },
      urlMatch: {
        url: "https://example.com/mcp",
        transport: "sse",
        auth: { strategy: "bearer", value: "gAAAAA-url-match" },
      },
    });
    const server = getRemoteServer({
      id: "sse-0",
      type: "sse",
      name: "preferred",
    });

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toEqual({ ...server, auth: namedAuth });
  });

  it("keeps redacted remote auth when the stored auth is malformed", async () => {
    mockEncryptedMcpConfig({
      malformed: {
        url: "https://example.com/mcp",
        transport: "shttp",
        auth: { strategy: "unsupported", value: "gAAAAA-invalid" },
      },
    });
    const server = getRemoteServer({ name: "malformed" });

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toBe(server);
  });

  it("keeps the exact server when encrypted settings cannot be fetched", async () => {
    const fetchSpy = vi
      .spyOn(SettingsService, "fetchSettingsFromApi")
      .mockRejectedValue(new Error("settings unavailable"));
    const server = getRemoteServer({ name: "unavailable" });

    const result = await substituteRedactedMcpCredentials(server);

    expect(result).toBe(server);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith("encrypted");
  });

  it("does not fetch encrypted settings for absent or non-redacted secrets", async () => {
    const fetchSpy = vi
      .spyOn(SettingsService, "fetchSettingsFromApi")
      .mockRejectedValue(new Error("unexpected fetch"));
    const servers = [
      getStdioServer({ env: undefined }),
      getRemoteServer({
        id: "sse-0",
        type: "sse",
        auth: { strategy: "bearer", value: "user-entered-token" },
      }),
    ];

    for (const server of servers) {
      expect(await substituteRedactedMcpCredentials(server)).toBe(server);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
