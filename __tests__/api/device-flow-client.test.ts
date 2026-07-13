import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startDeviceFlow,
  pollForToken,
  isOpenHandsCloudHost,
  DeviceFlowError,
} from "../../src/api/device-flow-client";

const TEST_HOST_URL = "https://app.all-hands.dev";

describe("device-flow-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("isOpenHandsCloudHost", () => {
    it("returns true for all-hands.dev domains", () => {
      expect(isOpenHandsCloudHost("https://app.all-hands.dev")).toBe(true);
      expect(isOpenHandsCloudHost("https://staging.all-hands.dev")).toBe(true);
      expect(isOpenHandsCloudHost("app.all-hands.dev")).toBe(true);
      expect(isOpenHandsCloudHost("ALL-HANDS.DEV")).toBe(true);
      expect(isOpenHandsCloudHost("all-hands.dev")).toBe(true);
    });

    it("accepts HTTP cloud URLs surrounded by whitespace", () => {
      expect(isOpenHandsCloudHost("  http://app.all-hands.dev  ")).toBe(true);
    });

    it("returns true for openhands.dev domains", () => {
      expect(isOpenHandsCloudHost("https://app.openhands.dev")).toBe(true);
      expect(isOpenHandsCloudHost("openhands.dev")).toBe(true);
    });

    it("returns false for other domains", () => {
      expect(isOpenHandsCloudHost("https://localhost:8000")).toBe(false);
      expect(isOpenHandsCloudHost("http://127.0.0.1")).toBe(false);
      expect(isOpenHandsCloudHost("https://example.com")).toBe(false);
      expect(isOpenHandsCloudHost("https://my-openhands-server.com")).toBe(
        false,
      );
    });

    it("prevents substring matching attacks", () => {
      // These should NOT be treated as trusted hosts
      expect(isOpenHandsCloudHost("https://all-hands.dev.evil.com")).toBe(
        false,
      );
      expect(isOpenHandsCloudHost("https://malicious-all-hands.dev")).toBe(
        false,
      );
      expect(isOpenHandsCloudHost("https://evil.com/all-hands.dev")).toBe(
        false,
      );
      expect(isOpenHandsCloudHost("prefixhttps://app.all-hands.dev")).toBe(
        false,
      );
    });

    it("returns false for invalid URLs", () => {
      expect(isOpenHandsCloudHost("")).toBe(false);
      expect(isOpenHandsCloudHost("not-a-url")).toBe(false);
    });
  });

  describe("startDeviceFlow", () => {
    it("returns device authorization response on success", async () => {
      const mockResponse = {
        device_code: "device123",
        user_code: "USER-1234",
        verification_uri: `${TEST_HOST_URL}/device`,
        verification_uri_complete: `${TEST_HOST_URL}/device?user_code=USER-1234`,
        expires_in: 600,
        interval: 5,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await startDeviceFlow(TEST_HOST_URL);

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        `${TEST_HOST_URL}/oauth/device/authorize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{}",
          signal: undefined,
        },
      );
    });

    it("builds optional authorization values from the required response fields", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            device_code: "device123",
            user_code: "USER 12/+",
            verification_uri: `${TEST_HOST_URL}/device`,
          }),
      });

      await expect(startDeviceFlow(TEST_HOST_URL)).resolves.toEqual({
        device_code: "device123",
        user_code: "USER 12/+",
        verification_uri: `${TEST_HOST_URL}/device`,
        verification_uri_complete: `${TEST_HOST_URL}/device?user_code=USER%2012%2F%2B`,
        expires_in: 600,
        interval: 5,
      });
    });

    it("normalizes host URL by removing trailing slashes", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            device_code: "dc",
            user_code: "uc",
            verification_uri: "v",
            verification_uri_complete: "vc",
            expires_in: 600,
            interval: 5,
          }),
      });

      await startDeviceFlow(`${TEST_HOST_URL}///`);

      // Verify the direct request targets the normalized host.
      const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toBe(`${TEST_HOST_URL}/oauth/device/authorize`);
    });

    it("throws DeviceFlowError on HTTP error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Failed to start device flow: Server returned 500",
      });
    });

    it.each([
      {
        field: "device_code",
        response: { user_code: "uc", verification_uri: "v" },
      },
      {
        field: "user_code",
        response: { device_code: "dc", verification_uri: "v" },
      },
      {
        field: "verification_uri",
        response: { device_code: "dc", user_code: "uc" },
      },
    ])(
      "throws DeviceFlowError when $field is missing",
      async ({ response }) => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(response),
        });

        await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toMatchObject({
          name: "DeviceFlowError",
          message:
            "Invalid response from device authorization endpoint: missing required fields",
        });
      },
    );

    it("throws DeviceFlowError on network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network failed"));

      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toThrow(
        DeviceFlowError,
      );
      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toThrow(
        /Network failed/,
      );
    });

    it("describes non-Error failures from the authorization request", async () => {
      global.fetch = vi.fn().mockRejectedValue("connection unavailable");

      await expect(startDeviceFlow(TEST_HOST_URL)).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Failed to start device flow: connection unavailable",
      });
    });
  });

  describe("pollForToken", () => {
    it("returns token response on immediate success", async () => {
      const mockTokenResponse = {
        access_token: "api-key-123",
        token_type: "Bearer",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTokenResponse),
      });

      const result = await pollForToken(`${TEST_HOST_URL}///`, "device123", {
        interval: 5,
      });

      expect(result).toEqual(mockTokenResponse);
      expect(fetch).toHaveBeenCalledWith(
        `${TEST_HOST_URL}/oauth/device/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&device_code=device123",
          signal: undefined,
        },
      );
    });

    it("defaults the token type when the successful response omits it", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: "api-key-123" }),
      });

      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 5 }),
      ).resolves.toEqual({
        access_token: "api-key-123",
        token_type: "Bearer",
        expires_in: undefined,
      });
    });

    it("rejects a successful token response without an access token", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token_type: "Bearer" }),
      });

      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 5 }),
      ).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Invalid token response: missing access_token",
      });
    });

    it("waits for the configured interval before polling again", async () => {
      const pendingResponse = {
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "authorization_pending",
            error_description: "User hasn't authorized yet",
          }),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "api-key-123",
            token_type: "Bearer",
          }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(pendingResponse)
        .mockResolvedValueOnce(successResponse);

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 5,
      });

      await vi.advanceTimersByTimeAsync(4999);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      const result = await pollPromise;
      expect(result.access_token).toBe("api-key-123");
    });

    it("increases interval on slow_down error", async () => {
      const slowDownResponse = {
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "slow_down",
            interval: 7,
          }),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "api-key-123",
            token_type: "Bearer",
          }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(slowDownResponse)
        .mockResolvedValueOnce(successResponse);

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 5,
      });

      await vi.advanceTimersByTimeAsync(6999);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      const result = await pollPromise;
      expect(result.access_token).toBe("api-key-123");
    });

    it("throws on expired_token error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "expired_token",
          }),
      });

      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 1 }),
      ).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Device code has expired. Please try again.",
        code: "expired_token",
      });
    });

    it("throws on access_denied error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "access_denied",
          }),
      });

      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 1 }),
      ).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Authorization request was denied.",
        code: "access_denied",
      });
    });

    it("rejects a non-JSON token error response with its HTTP status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      });

      await expect(
        pollForToken(TEST_HOST_URL, "device123", { interval: 1 }),
      ).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Unexpected response from server: 502",
      });
    });

    it.each([
      {
        description: "with its server description",
        error: "invalid_scope",
        errorDescription: "Requested scope is unavailable",
        expectedMessage:
          "Authorization error: invalid_scope - Requested scope is unavailable",
      },
      {
        description: "without a server description",
        error: "server_error",
        errorDescription: undefined,
        expectedMessage: "Authorization error: server_error",
      },
    ])(
      "preserves an unknown token error $description",
      async ({ error, errorDescription, expectedMessage }) => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: () =>
            Promise.resolve({
              error,
              error_description: errorDescription,
            }),
        });

        await expect(
          pollForToken(TEST_HOST_URL, "device123", { interval: 1 }),
        ).rejects.toMatchObject({
          name: "DeviceFlowError",
          message: expectedMessage,
          code: error,
        });
      },
    );

    it("respects abort signal", async () => {
      const controller = new AbortController();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "authorization_pending",
          }),
      });

      controller.abort();

      await expect(
        pollForToken(TEST_HOST_URL, "device123", {
          interval: 1,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Authorization cancelled",
        code: "cancelled",
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("converts a fetch abort into a cancellation error", async () => {
      const controller = new AbortController();
      global.fetch = vi
        .fn()
        .mockRejectedValue(new DOMException("Aborted", "AbortError"));

      await expect(
        pollForToken(TEST_HOST_URL, "device123", {
          interval: 1,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Authorization cancelled",
        code: "cancelled",
      });
    });

    it("cancels while waiting for the next poll", async () => {
      const controller = new AbortController();
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "authorization_pending" }),
      });

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 5,
        signal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();

      await expect(pollPromise).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Authorization cancelled",
        code: "cancelled",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("cancels when the signal aborts while a pending response is handled", async () => {
      const controller = new AbortController();
      global.fetch = vi.fn().mockImplementation(async () => {
        controller.abort();
        return {
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "authorization_pending" }),
        };
      });

      await expect(
        pollForToken(TEST_HOST_URL, "device123", {
          interval: 5,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Authorization cancelled",
        code: "cancelled",
      });
    });

    it("propagates an unexpected polling wait failure", async () => {
      const waitError = new DOMException("Timer unavailable", "NetworkError");
      const controller = new AbortController();
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "authorization_pending" }),
      });
      vi.spyOn(controller.signal, "addEventListener").mockImplementationOnce(
        () => {
          throw waitError;
        },
      );

      await expect(
        pollForToken(TEST_HOST_URL, "device123", {
          interval: 1,
          signal: controller.signal,
        }),
      ).rejects.toBe(waitError);
    });

    it("does not request a token when the timeout is already exhausted", async () => {
      global.fetch = vi.fn();

      await expect(
        pollForToken(TEST_HOST_URL, "device123", {
          interval: 1,
          timeout: 0,
        }),
      ).rejects.toMatchObject({
        name: "DeviceFlowError",
        message: "Timeout waiting for authorization. Please try again.",
        code: "timeout",
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("caps slow_down interval at 30 seconds (DoS protection)", async () => {
      const slowDownResponse = {
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "slow_down",
            interval: 999999, // Malicious server tries to DoS
          }),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "api-key-123",
            token_type: "Bearer",
          }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(slowDownResponse)
        .mockResolvedValueOnce(successResponse);

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 5,
      });

      await vi.advanceTimersByTimeAsync(29999);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      const result = await pollPromise;
      expect(result.access_token).toBe("api-key-123");
    });

    it.each([
      { description: "a numeric string", interval: "7" },
      { description: "zero", interval: 0 },
      { description: "an infinite number", interval: Number.POSITIVE_INFINITY },
    ])(
      "uses the RFC fallback for $description slow_down interval",
      async ({ interval }) => {
        global.fetch = vi
          .fn()
          .mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ error: "slow_down", interval }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                access_token: "api-key-123",
                token_type: "Bearer",
              }),
          });

        const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
          interval: 5,
        });

        await vi.advanceTimersByTimeAsync(9999);
        expect(fetch).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(fetch).toHaveBeenCalledTimes(2);

        await expect(pollPromise).resolves.toMatchObject({
          access_token: "api-key-123",
        });
      },
    );

    it("increments interval by 5 seconds per RFC 8628 when slow_down has no interval", async () => {
      const slowDownResponse = {
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "slow_down",
            // No interval field - RFC 8628 mandates +5s increment
          }),
      };
      const successResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "api-key-123",
            token_type: "Bearer",
          }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(slowDownResponse)
        .mockResolvedValueOnce(successResponse);

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 5, // 5 seconds initial
      });

      await vi.advanceTimersByTimeAsync(9999);
      expect(fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      const result = await pollPromise;
      expect(result.access_token).toBe("api-key-123");
    });

    it("continues polling on network errors instead of failing immediately", async () => {
      const networkError = new Error("Network failed");
      const successResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "api-key-123",
            token_type: "Bearer",
          }),
      };

      // First call fails with network error, second succeeds
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 1,
      });

      // Advance past the retry interval
      await vi.advanceTimersByTimeAsync(1000);

      const result = await pollPromise;
      expect(result.access_token).toBe("api-key-123");
      expect(consoleSpy).toHaveBeenCalledWith(
        "Network error during polling, retrying:",
        networkError,
      );

      consoleSpy.mockRestore();
    });

    it("retries a non-abort DOMException as a network error", async () => {
      const networkError = new DOMException(
        "Connection interrupted",
        "NetworkError",
      );
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: "api-key-123",
              token_type: "Bearer",
            }),
        });
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const pollPromise = pollForToken(TEST_HOST_URL, "device123", {
        interval: 1,
      });
      await vi.advanceTimersByTimeAsync(1000);

      await expect(pollPromise).resolves.toMatchObject({
        access_token: "api-key-123",
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        "Network error during polling, retrying:",
        networkError,
      );
      consoleSpy.mockRestore();
    });
  });
});
