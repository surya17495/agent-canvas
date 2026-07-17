import {
  DeviceFlowError,
  isOpenHandsCloudHost as sdkIsOpenHandsCloudHost,
} from "@openhands/typescript-client/clients";
import type {
  DeviceAuthorizationResponse,
  DeviceTokenResponse,
  PollDeviceTokenOptions,
} from "@openhands/typescript-client/clients";
import { AGENT_CANVAS_CLIENT_HEADERS } from "./client-source";

export { DeviceFlowError };

const OPENHANDS_CLOUD_HOST_SUFFIXES = ["all-hands.dev", "openhands.dev"];
const DEFAULT_TIMEOUT_MS = 600_000;
const MAX_INTERVAL_MS = 30_000;

function isAllowedCloudHostname(hostname: string): boolean {
  return OPENHANDS_CLOUD_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function fallbackIsOpenHandsCloudHost(host: string): boolean {
  if (!host.trim()) return false;

  try {
    const normalizedHost = host.includes("://") ? host : `https://${host}`;
    const { hostname } = new URL(normalizedHost);
    return isAllowedCloudHostname(hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isOpenHandsCloudHost(host: string): boolean {
  try {
    if (typeof sdkIsOpenHandsCloudHost === "function") {
      return sdkIsOpenHandsCloudHost(host);
    }
  } catch {
    return fallbackIsOpenHandsCloudHost(host);
  }

  return fallbackIsOpenHandsCloudHost(host);
}

/**
 * Start an OAuth device flow and identify Agent Canvas to Cloud ingress.
 *
 * This mirrors the typescript-client implementation, with the addition of
 * coarse client/version headers used for source-specific operational metrics.
 */
export async function startDeviceFlow(
  host: string,
): Promise<DeviceAuthorizationResponse> {
  try {
    const response = await requestCloudDeviceEndpoint(
      host,
      "/oauth/device/authorize",
      "{}",
      "application/json",
    );

    if (!response.ok) {
      throw new DeviceFlowError(
        `Failed to start device flow: Server returned ${response.status}`,
      );
    }

    const data =
      (await response.json()) as Partial<DeviceAuthorizationResponse>;
    if (!data.device_code || !data.user_code || !data.verification_uri) {
      throw new DeviceFlowError(
        "Invalid response from device authorization endpoint: missing required fields",
      );
    }

    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      verification_uri_complete:
        data.verification_uri_complete ??
        `${data.verification_uri}?user_code=${encodeURIComponent(data.user_code)}`,
      expires_in: data.expires_in ?? 600,
      interval: data.interval ?? 5,
    };
  } catch (error) {
    if (error instanceof DeviceFlowError) throw error;
    throw new DeviceFlowError(
      `Failed to start device flow: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Poll the token endpoint while retaining Canvas source metadata. */
export async function pollForToken(
  host: string,
  deviceCode: string,
  options: PollDeviceTokenOptions,
): Promise<DeviceTokenResponse> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  let interval = Math.max(1, options.interval) * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    if (options.signal?.aborted) {
      throw new DeviceFlowError("Authorization cancelled", "cancelled");
    }

    try {
      const response = await requestCloudDeviceEndpoint(
        host,
        "/oauth/device/token",
        new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
        }),
        "application/x-www-form-urlencoded",
        options.signal,
      );

      if (response.ok) {
        const data = (await response.json()) as Partial<DeviceTokenResponse>;
        if (!data.access_token) {
          throw new DeviceFlowError(
            "Invalid token response: missing access_token",
          );
        }
        return {
          access_token: data.access_token,
          token_type: data.token_type ?? "Bearer",
          expires_in: data.expires_in,
        };
      }

      let errorData: {
        error?: string;
        error_description?: string;
        interval?: number;
      };
      try {
        errorData = (await response.json()) as typeof errorData;
      } catch {
        throw new DeviceFlowError(
          `Unexpected response from server: ${response.status}`,
        );
      }
      switch (errorData.error) {
        case "authorization_pending":
          break;
        case "slow_down":
          interval =
            typeof errorData.interval === "number" &&
            Number.isFinite(errorData.interval) &&
            errorData.interval > 0
              ? Math.max(1, Math.min(errorData.interval, 30)) * 1000
              : Math.min(interval + 5000, MAX_INTERVAL_MS);
          break;
        case "expired_token":
          throw new DeviceFlowError(
            "Device code has expired. Please try again.",
            "expired_token",
          );
        case "access_denied":
          throw new DeviceFlowError(
            "Authorization request was denied.",
            "access_denied",
          );
        default:
          throw new DeviceFlowError(
            `Authorization error: ${errorData.error}${
              errorData.error_description
                ? ` - ${errorData.error_description}`
                : ""
            }`,
            errorData.error,
          );
      }
    } catch (error) {
      if (error instanceof DeviceFlowError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DeviceFlowError("Authorization cancelled", "cancelled");
      }
      console.warn("Network error during polling, retrying:", error);
    }

    try {
      await sleep(interval, options.signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DeviceFlowError("Authorization cancelled", "cancelled");
      }
      throw error;
    }
  }

  throw new DeviceFlowError(
    "Timeout waiting for authorization. Please try again.",
    "timeout",
  );
}

function requestCloudDeviceEndpoint(
  host: string,
  path: string,
  body: BodyInit,
  contentType: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${host.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      ...AGENT_CANVAS_CLIENT_HEADERS,
    },
    body,
    signal,
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
export type {
  DeviceAuthorizationResponse,
  DeviceTokenResponse,
  PollDeviceTokenOptions as PollOptions,
} from "@openhands/typescript-client/clients";
