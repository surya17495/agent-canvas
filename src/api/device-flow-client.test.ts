import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_CANVAS_CLIENT_HEADERS,
  AGENT_CANVAS_CLIENT_SOURCE,
  AGENT_CANVAS_CLIENT_VERSION,
} from "./client-source";
import { pollForToken, startDeviceFlow } from "./device-flow-client";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Agent Canvas device flow instrumentation", () => {
  it("identifies authorization requests without including device data in headers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: "device-secret",
          user_code: "ABCD-EFGH",
          verification_uri: "https://app.all-hands.dev/device",
          expires_in: 600,
          interval: 5,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await startDeviceFlow("https://app.all-hands.dev/");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.all-hands.dev/oauth/device/authorize",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...AGENT_CANVAS_CLIENT_HEADERS,
        },
      }),
    );
    expect(AGENT_CANVAS_CLIENT_HEADERS).toEqual({
      "X-OpenHands-Client": AGENT_CANVAS_CLIENT_SOURCE,
      "X-OpenHands-Client-Version": AGENT_CANVAS_CLIENT_VERSION,
    });
    expect(JSON.stringify(fetchMock.mock.calls[0][1]?.headers)).not.toContain(
      "device-secret",
    );
  });

  it("identifies successful token polling requests", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "api-key", token_type: "Bearer" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      pollForToken("https://app.all-hands.dev", "device-secret", {
        interval: 5,
      }),
    ).resolves.toEqual({
      access_token: "api-key",
      token_type: "Bearer",
      expires_in: undefined,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.all-hands.dev/oauth/device/token",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...AGENT_CANVAS_CLIENT_HEADERS,
        },
      }),
    );
  });
});
