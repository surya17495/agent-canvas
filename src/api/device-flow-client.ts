import {
  DeviceFlowError,
  isOpenHandsCloudHost as sdkIsOpenHandsCloudHost,
  pollForToken,
} from "@openhands/typescript-client/clients";
import type { DeviceAuthorizationResponse } from "@openhands/typescript-client/clients";
import { AGENT_CANVAS_CLIENT_HEADERS } from "./client-source";

export { DeviceFlowError, pollForToken };

const OPENHANDS_CLOUD_HOST_SUFFIXES = ["all-hands.dev", "openhands.dev"];

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
    const response = await fetch(
      `${host.replace(/\/+$/, "")}/oauth/device/authorize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...AGENT_CANVAS_CLIENT_HEADERS,
        },
        body: "{}",
      },
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
export type {
  DeviceAuthorizationResponse,
  DeviceTokenResponse,
  PollDeviceTokenOptions as PollOptions,
} from "@openhands/typescript-client/clients";
