import type { Capability } from "../manifest";
import type {
  ConversationSummary,
  CreateConversationOptions,
} from "../sdk/types";
import type { RpcMethodMap } from "./rpc";

/** HTTP methods for backend fetch calls. */
export type BackendFetchMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Parameters for the backend.fetch RPC call. */
export interface BackendFetchParams {
  /** Path on the backend, e.g. "/api/v1/sandboxes?id=abc". */
  path: string;
  /** HTTP method. Defaults to "GET". */
  method?: BackendFetchMethod;
  /** JSON body for non-GET requests. */
  body?: unknown;
}

/** Response from the backend.fetch RPC call. */
export interface BackendFetchResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

/**
 * Host-side dependencies the extension API is implemented against. Injected so the
 * API is decoupled from concrete Agent-Canvas stores/services and trivially testable.
 */
export interface HostApiDeps {
  /** Resolve the currently active conversation (or null). */
  getActiveConversation(): ConversationSummary | null;
  /** Show an informational message in the host UI. */
  showInformationMessage(message: string): void;
  /** Execute a host command by id (built-in or contributed). */
  executeCommand(command: string, args: unknown[]): Promise<unknown> | unknown;
  /** Per-extension key/value storage. */
  storageGet(extensionId: string, key: string): unknown;
  storageSet(extensionId: string, key: string, value: unknown): void;
  /**
   * Fetch from the active cloud backend. Returns null if no cloud backend is active.
   * The host handles auth (bearer token) automatically.
   */
  backendCloudFetch?(
    path: string,
    method: BackendFetchMethod,
    body?: unknown,
  ): Promise<BackendFetchResponse | null>;
  /** Navigate to a path within the app (e.g. "/conversations/abc123"). */
  navigate?(path: string): void;
  /** Create a new conversation and return its ID. */
  createConversation?(options?: CreateConversationOptions): Promise<string>;
}

export class CapabilityError extends Error {
  constructor(capability: Capability) {
    super(`missing capability: ${capability}`);
    this.name = "CapabilityError";
  }
}

function requireCapability(
  granted: ReadonlySet<Capability>,
  capability: Capability,
): void {
  if (!granted.has(capability)) {
    throw new CapabilityError(capability);
  }
}

/**
 * Build the RPC method map the host exposes to a single extension's worker. Every
 * method that touches privileged data is gated by the extension's granted
 * `capabilities`; calls outside the grant reject with a {@link CapabilityError},
 * giving us VS Code-style least-privilege without ambient authority.
 */
export function createHostMethods(
  extensionId: string,
  capabilities: readonly Capability[],
  deps: HostApiDeps,
): RpcMethodMap {
  const granted = new Set<Capability>(capabilities);

  return {
    "window.showInformationMessage": (params) => {
      const { message } = params as { message: string };
      deps.showInformationMessage(message);
    },

    "commands.execute": (params) => {
      const { command, args } = params as { command: string; args?: unknown[] };
      return deps.executeCommand(command, args ?? []);
    },

    "conversation.getActive": () => {
      requireCapability(granted, "conversation:read");
      return deps.getActiveConversation();
    },

    "storage.get": (params) => {
      requireCapability(granted, "storage");
      const { key } = params as { key: string };
      return deps.storageGet(extensionId, key) ?? null;
    },

    "storage.set": (params) => {
      requireCapability(granted, "storage");
      const { key, value } = params as { key: string; value: unknown };
      deps.storageSet(extensionId, key, value);
    },

    "backend.cloudFetch": async (params) => {
      const { path, method = "GET", body } = params as BackendFetchParams;

      // Gate by read or write capability based on method
      if (method === "GET") {
        requireCapability(granted, "backend:cloud:read");
      } else {
        requireCapability(granted, "backend:cloud:write");
      }

      if (!deps.backendCloudFetch) {
        throw new Error("Cloud backend fetch not available");
      }

      return deps.backendCloudFetch(path, method, body);
    },

    "navigation.navigate": (params) => {
      const { path } = params as { path: string };
      if (deps.navigate) {
        deps.navigate(path);
      }
    },

    "conversation.create": async (params) => {
      requireCapability(granted, "backend:cloud:write");
      const options = (params as { options?: CreateConversationOptions })
        .options;
      if (!deps.createConversation) {
        throw new Error("Conversation creation not available");
      }
      return deps.createConversation(options);
    },
  };
}
