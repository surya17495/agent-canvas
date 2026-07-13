import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  fetchCloudConversationSettingsSchema,
  fetchCloudSettings,
  fetchCloudSettingsSchema,
  saveCloudSettings,
} from "#/api/cloud/settings-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://localhost:3000",
  apiKey: "local-key",
  kind: "local",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("cloud settings", () => {
  it("fetchCloudSettings preserves provider_tokens_set so the repo chain can fire", async () => {
    vi.mocked(axios.request).mockResolvedValue({
      data: {
        llm_model: "anthropic/claude-3-5-sonnet",
        llm_base_url: "https://api.anthropic.com",
        llm_api_key_set: true,
        agent: "CodeActAgent",
        confirmation_mode: true,
        security_analyzer: "llm",
        max_iterations: 30,
        provider_tokens_set: { github: "***" },
      },
    });

    const result = await fetchCloudSettings();

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toEqual({
      url: `${cloudBackend.host}/api/v1/settings`,
      method: "GET",
      headers: { Authorization: "Bearer bearer-token" },
      timeout: 30_000,
    });

    // provider_tokens_set must round-trip — it's what drives
    // useUserProviders → useAppInstallations → useGitRepositories.
    expect(result.provider_tokens_set).toEqual({ github: "***" });

    // Top-level cloud fields are preserved as-is.
    expect(result.llm_model).toBe("anthropic/claude-3-5-sonnet");
    expect(result.llm_api_key_set).toBe(true);
    expect(result.agent).toBe("CodeActAgent");

    // Nested shape derived for the local-mode settings page.
    expect(result.agent_settings?.agent).toBe("CodeActAgent");
    expect(result.agent_settings?.llm).toEqual({
      model: "anthropic/claude-3-5-sonnet",
      base_url: "https://api.anthropic.com",
    });
    expect(result.conversation_settings?.confirmation_mode).toBe(true);
    expect(result.conversation_settings?.security_analyzer).toBe("llm");
    expect(result.conversation_settings?.max_iterations).toBe(30);
  });

  it("derives every supported nested field while preserving cloud defaults", async () => {
    const flat = {
      llm_model: "openai/gpt-4o",
      llm_base_url: "https://api.openai.com",
      llm_api_key: "encrypted-api-key",
      llm_api_key_set: false,
      search_api_key_set: true,
      enable_default_condenser: false,
      condenser_max_size: 0,
      agent: "CodeActAgent",
      mcp_config: {
        calendar: { url: "https://calendar.example.com/mcp" },
      },
      confirmation_mode: false,
      security_analyzer: null,
      max_iterations: 0,
      extra_cloud_field: "preserved",
    };
    vi.mocked(axios.request).mockResolvedValue({ data: flat });

    const result = await fetchCloudSettings();

    expect(result).toStrictEqual({
      ...flat,
      agent_settings: {
        llm: {
          model: "openai/gpt-4o",
          base_url: "https://api.openai.com",
          api_key: "encrypted-api-key",
        },
        condenser: { enabled: false, max_size: 0 },
        agent: "CodeActAgent",
        mcp_config: flat.mcp_config,
      },
      conversation_settings: {
        confirmation_mode: false,
        security_analyzer: null,
        max_iterations: 0,
      },
      llm_api_key_set: false,
      search_api_key_set: true,
      provider_tokens_set: undefined,
    });
  });

  it("preserves non-empty nested settings instead of replacing them from flat fields", async () => {
    const flat = {
      llm_model: "flat-model",
      confirmation_mode: false,
      agent_settings: {
        llm: { model: "nested-model" },
        custom_agent_value: "kept",
      },
      conversation_settings: {
        confirmation_mode: true,
        custom_conversation_value: "kept",
      },
    };
    vi.mocked(axios.request).mockResolvedValue({ data: flat });

    const result = await fetchCloudSettings();

    expect(result.agent_settings).toBe(flat.agent_settings);
    expect(result.conversation_settings).toBe(flat.conversation_settings);
  });

  it("derives empty nested settings and false key flags from a sparse response", async () => {
    const flat = {
      agent_settings: {},
      conversation_settings: {},
      mcp_config: {},
    };
    vi.mocked(axios.request).mockResolvedValue({ data: flat });

    const result = await fetchCloudSettings();

    expect(result).toStrictEqual({
      ...flat,
      agent_settings: {},
      conversation_settings: {},
      llm_api_key_set: false,
      search_api_key_set: false,
      provider_tokens_set: undefined,
    });
  });

  it("derives flat values when the cloud returns empty nested blocks", async () => {
    const flat = {
      agent_settings: {},
      conversation_settings: {},
      llm_model: "fallback-model",
      confirmation_mode: false,
    };
    vi.mocked(axios.request).mockResolvedValue({ data: flat });

    const result = await fetchCloudSettings();

    expect(result.agent_settings).toEqual({
      llm: { model: "fallback-model" },
    });
    expect(result.conversation_settings).toEqual({ confirmation_mode: false });
  });

  it("rejects before proxying when the active backend is local", async () => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });

    await expect(fetchCloudSettings()).rejects.toThrow(
      "Cloud settings call requires a cloud backend.",
    );
    expect(axios.request).not.toHaveBeenCalled();
  });

  it("propagates cloud proxy failures unchanged", async () => {
    const error = new Error("cloud unavailable");
    vi.mocked(axios.request).mockRejectedValue(error);

    await expect(fetchCloudSettings()).rejects.toBe(error);
  });

  it("saveCloudSettings forwards diffs verbatim and omits the legacy keys the cloud rejects", async () => {
    vi.mocked(axios.request).mockResolvedValue({ data: {} });

    const agentDiff = {
      llm: { model: "openai/gpt-4o", base_url: "https://api.openai.com" },
      agent: "CodeActAgent",
    };
    const conversationDiff = { max_iterations: 50 };

    await saveCloudSettings({
      agent_settings_diff: agentDiff,
      conversation_settings_diff: conversationDiff,
    });

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toEqual({
      url: `${cloudBackend.host}/api/v1/settings`,
      method: "POST",
      headers: { Authorization: "Bearer bearer-token" },
      data: {
        agent_settings_diff: agentDiff,
        conversation_settings_diff: conversationDiff,
      },
      timeout: 30_000,
    });
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({
      agent_settings_diff: agentDiff,
      conversation_settings_diff: conversationDiff,
    });
    expect(requestBody).not.toHaveProperty("agent_settings");
    expect(requestBody).not.toHaveProperty("conversation_settings");
  });

  it("SettingsService.saveSettings forwards disabled_skills to cloud when active backend is cloud", async () => {
    // Arrange: cloud backend already active via beforeEach; mock cloud response.
    vi.mocked(axios.request).mockResolvedValue({ data: {} });

    // Act: save a skills-only update — previously this short-circuited and
    // sent nothing at all, leaving the toggle un-persisted.
    await SettingsService.saveSettings({
      disabled_skills: ["SSH Microagent"],
    });

    // Assert: a single POST /api/v1/settings reached the wire with
    // disabled_skills as a top-level field.
    expect(vi.mocked(axios.request)).toHaveBeenCalledTimes(1);
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/settings`,
      method: "POST",
      headers: { Authorization: "Bearer bearer-token" },
    });
    expect((config as { data: Record<string, unknown> }).data).toEqual({
      disabled_skills: ["SSH Microagent"],
    });
  });

  it("saveCloudSettings omits an empty conversation_settings_diff (LLM-only save)", async () => {
    vi.mocked(axios.request).mockResolvedValue({ data: {} });

    await saveCloudSettings({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
      },
      conversation_settings_diff: {},
    });

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
      },
    });
  });

  it("sends explicit preference clears while omitting undefined preferences", async () => {
    vi.mocked(axios.request).mockResolvedValue({ data: {} });

    await saveCloudSettings({
      app_preferences: {
        language: undefined,
        user_consents_to_analytics: null,
        enable_sound_notifications: false,
        git_user_name: "",
        disabled_skills: [],
      },
    });

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toEqual({
      url: `${cloudBackend.host}/api/v1/settings`,
      method: "POST",
      headers: { Authorization: "Bearer bearer-token" },
      data: {
        user_consents_to_analytics: null,
        enable_sound_notifications: false,
        git_user_name: "",
        disabled_skills: [],
      },
      timeout: 30_000,
    });
    expect(
      (config as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty("language");
  });

  it("sends an empty payload when no settings changed", async () => {
    vi.mocked(axios.request).mockResolvedValue({ data: {} });

    await saveCloudSettings({});

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toEqual({
      url: `${cloudBackend.host}/api/v1/settings`,
      method: "POST",
      headers: { Authorization: "Bearer bearer-token" },
      data: {},
      timeout: 30_000,
    });
  });

  it.each([
    ["agent", fetchCloudSettingsSchema, "/api/v1/settings/agent-schema"],
    [
      "conversation",
      fetchCloudConversationSettingsSchema,
      "/api/v1/settings/conversation-schema",
    ],
  ] as const)(
    "fetches the %s settings schema from the exact cloud route",
    async (_label, fetchSchema, path) => {
      const schema = { model_name: `${_label}-settings`, sections: [] };
      vi.mocked(axios.request).mockResolvedValue({ data: schema });

      const result = await fetchSchema();

      expect(result).toBe(schema);
      const [config] = vi.mocked(axios.request).mock.calls[0]!;
      expect(config).toEqual({
        url: `${cloudBackend.host}${path}`,
        method: "GET",
        headers: { Authorization: "Bearer bearer-token" },
        timeout: 30_000,
      });
    },
  );
});

describe("saveCloudSettings drops agent_context: null (agent-canvas#981)", () => {
  it("strips a null agent_context while preserving sibling agent settings", async () => {
    // Arrange: the cloud rejects agent_context: null against OpenHandsAgentSettings.
    vi.mocked(axios.request).mockResolvedValue({ data: {} });

    // Act
    await saveCloudSettings({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
        agent_context: null,
      },
    });

    // Assert: agent_context never reaches the wire, but the real llm change does.
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
      },
    });
  });

  it("preserves a null mcp_config so clearing MCP servers still round-trips", async () => {
    // Arrange: mcp_config: null is an intentional "clear" signal, not an error.
    vi.mocked(axios.request).mockResolvedValue({ data: {} });

    // Act
    await saveCloudSettings({
      agent_settings_diff: { mcp_config: null },
    });

    // Assert: the null mcp_config must survive (don't over-strip nulls).
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({ agent_settings_diff: { mcp_config: null } });
  });

  it("preserves a non-null agent_context", async () => {
    vi.mocked(axios.request).mockResolvedValue({ data: {} });
    const agentContext = {
      system_message_suffix: "Keep this context",
    };

    await saveCloudSettings({
      agent_settings_diff: { agent_context: agentContext },
    });

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({
      agent_settings_diff: { agent_context: agentContext },
    });
  });

  it("omits agent_settings_diff when agent_context: null is its only key", async () => {
    // Arrange
    vi.mocked(axios.request).mockResolvedValue({ data: {} });

    // Act
    await saveCloudSettings({
      agent_settings_diff: { agent_context: null },
    });

    // Assert: nothing is left to send, so no agent_settings_diff goes on the wire.
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({});
  });
});
