import {
  pollForToken as sdkPollForToken,
  startDeviceFlow as sdkStartDeviceFlow,
} from "@openhands/typescript-client/clients";
import type {
  DeviceAuthorizationResponse,
  DeviceTokenResponse,
  PollDeviceTokenOptions,
} from "@openhands/typescript-client/clients";
import { AGENT_CANVAS_CLIENT_HEADERS } from "./client-source";

export {
  DeviceFlowError,
  isOpenHandsCloudHost,
} from "@openhands/typescript-client/clients";

export function startDeviceFlow(
  host: string,
): Promise<DeviceAuthorizationResponse> {
  return sdkStartDeviceFlow(host, { headers: AGENT_CANVAS_CLIENT_HEADERS });
}

export function pollForToken(
  host: string,
  deviceCode: string,
  options: PollDeviceTokenOptions,
): Promise<DeviceTokenResponse> {
  return sdkPollForToken(host, deviceCode, {
    ...options,
    headers: AGENT_CANVAS_CLIENT_HEADERS,
  });
}

export type {
  DeviceAuthorizationResponse,
  DeviceTokenResponse,
  PollDeviceTokenOptions as PollOptions,
} from "@openhands/typescript-client/clients";
