import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import LLMSubscriptionService from "#/api/llm-subscription-service";
import {
  getActiveSelection,
  getRegisteredBackends,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import {
  OPENAI_SUBSCRIPTION_DEVICE_START_PATH,
  OPENAI_SUBSCRIPTION_MODELS_PATH,
  OPENAI_SUBSCRIPTION_STATUS_PATH,
} from "#/constants/llm-subscription";
import { server } from "#/mocks/node";
import { resetTestHandlersMockSettings } from "#/mocks/settings-handlers";

describe("LLMSubscriptionService", () => {
  beforeEach(() => {
    resetTestHandlersMockSettings();
  });

  it("fetches OpenAI subscription models from the agent-server endpoint", async () => {
    await expect(LLMSubscriptionService.getOpenAIModels()).resolves.toEqual([
      "gpt-5.2",
      "gpt-5.3-codex",
    ]);
  });

  it("normalizes a top-level model list and excludes non-string entries", async () => {
    server.use(
      http.get(`*${OPENAI_SUBSCRIPTION_MODELS_PATH}`, () =>
        HttpResponse.json(["gpt-direct", 42, null]),
      ),
    );

    await expect(LLMSubscriptionService.getOpenAIModels()).resolves.toEqual([
      "gpt-direct",
    ]);
  });

  it("returns no models when the agent-server payload is malformed", async () => {
    server.use(
      http.get(`*${OPENAI_SUBSCRIPTION_MODELS_PATH}`, () =>
        HttpResponse.json({ models: "gpt-not-a-list" }),
      ),
    );

    await expect(LLMSubscriptionService.getOpenAIModels()).resolves.toEqual([]);
  });

  it("omits session authentication when the local backend has no API key", async () => {
    const originalBackends = getRegisteredBackends();
    const originalSelection = getActiveSelection();
    const backendWithoutKey = {
      id: "local-without-key",
      name: "Local without key",
      host: "http://localhost",
      apiKey: "",
      kind: "local" as const,
    };

    try {
      setRegisteredBackends([backendWithoutKey]);
      setActiveSelection({ backendId: backendWithoutKey.id });
      server.use(
        http.get(`*${OPENAI_SUBSCRIPTION_MODELS_PATH}`, ({ request }) => {
          expect(request.headers.has("X-Session-API-Key")).toBe(false);
          return HttpResponse.json([]);
        }),
      );

      await expect(LLMSubscriptionService.getOpenAIModels()).resolves.toEqual(
        [],
      );
    } finally {
      setRegisteredBackends(originalBackends);
      setActiveSelection(originalSelection);
    }
  });

  it("normalizes OpenAI subscription status from MSW handlers", async () => {
    await expect(LLMSubscriptionService.getOpenAIStatus()).resolves.toEqual({
      vendor: "openai",
      connected: false,
      accountEmail: null,
      expiresAt: null,
    });
  });

  it("defaults to disconnected when status flags are not booleans", async () => {
    server.use(
      http.get(`*${OPENAI_SUBSCRIPTION_STATUS_PATH}`, () =>
        HttpResponse.json({
          connected: "yes",
          authenticated: 1,
          is_connected: null,
        }),
      ),
    );

    await expect(LLMSubscriptionService.getOpenAIStatus()).resolves.toEqual({
      vendor: "openai",
      connected: false,
      accountEmail: null,
      expiresAt: null,
    });
  });

  it("normalizes device login challenge responses", async () => {
    await expect(
      LLMSubscriptionService.startOpenAIDeviceLogin(),
    ).resolves.toEqual({
      deviceCode: "mock-device-code",
      userCode: "MOCK-CODE",
      verificationUri: "https://auth.openai.com/activate",
      verificationUriComplete:
        "https://auth.openai.com/activate?user_code=MOCK-CODE",
      expiresAt: 900,
      intervalSeconds: 1,
    });
  });

  it("posts the device code when polling login", async () => {
    await expect(
      LLMSubscriptionService.pollOpenAIDeviceLogin("mock-device-code"),
    ).resolves.toMatchObject({ connected: true });

    await expect(
      LLMSubscriptionService.getOpenAIStatus(),
    ).resolves.toMatchObject({
      connected: true,
      accountEmail: "mock-chatgpt@example.com",
    });
  });

  it("calls the logout endpoint", async () => {
    await LLMSubscriptionService.pollOpenAIDeviceLogin("mock-device-code");

    await expect(LLMSubscriptionService.logoutOpenAI()).resolves.toMatchObject({
      connected: false,
    });
    await expect(
      LLMSubscriptionService.getOpenAIStatus(),
    ).resolves.toMatchObject({ connected: false });
  });

  it("rejects incomplete device challenges with blank required fields", async () => {
    server.use(
      http.post(`*${OPENAI_SUBSCRIPTION_DEVICE_START_PATH}`, () =>
        HttpResponse.json({
          device_code: "   ",
          user_code: "MOCK-CODE",
          verification_uri: "https://auth.openai.com/activate",
        }),
      ),
    );

    await expect(
      LLMSubscriptionService.startOpenAIDeviceLogin(),
    ).rejects.toThrow("Subscription device login response is incomplete");
  });

  it("surfaces agent-server errors", async () => {
    server.use(
      http.get(`*${OPENAI_SUBSCRIPTION_STATUS_PATH}`, () =>
        HttpResponse.json({ detail: "unauthorized" }, { status: 401 }),
      ),
    );

    await expect(LLMSubscriptionService.getOpenAIStatus()).rejects.toThrow();
  });
});
