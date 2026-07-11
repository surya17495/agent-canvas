import toast from "react-hot-toast";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { callCloudProxy } from "#/api/cloud/proxy";
import { TOAST_OPTIONS } from "#/utils/custom-toast-handlers";
import { contributionRegistry } from "../contribution-registry";
import type {
  ConversationSummary,
  CreateConversationOptions,
} from "../sdk/types";
import type {
  BackendFetchMethod,
  BackendFetchResponse,
  HostApiDeps,
} from "./host-api";

/** Global navigate function set by the app's navigation provider. */
let globalNavigate: ((path: string) => void) | null = null;

/** Set the global navigate function (called from NavigationProvider). */
export function setExtensionNavigate(fn: (path: string) => void): void {
  globalNavigate = fn;
}

const STORAGE_PREFIX = "agent-canvas:ext";

/** Retry configuration for rate-limited requests */
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/** Check if an error is a 429 rate limit error */
function isRateLimitError(error: unknown): boolean {
  const axiosError = error as { response?: { status?: number } };
  return axiosError?.response?.status === 429;
}

/** Sleep for a specified number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Execute a function with retry and exponential backoff for 429 errors */
async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown;
  let delay = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRateLimitError(error) || attempt === RETRY_CONFIG.maxRetries) {
        throw error;
      }

      console.log(
        `[extensions] ${context}: Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
      );
      await sleep(delay);
      delay = Math.min(
        delay * RETRY_CONFIG.backoffMultiplier,
        RETRY_CONFIG.maxDelayMs,
      );
    }
  }

  throw lastError;
}

function storageKey(extensionId: string, key: string): string {
  return `${STORAGE_PREFIX}:${extensionId}:${key}`;
}

/**
 * Build the real {@link HostApiDeps} wiring the extension host to live app services:
 * the active conversation, toast notifications, contributed-command dispatch, and
 * namespaced `localStorage`. This is the production seam between the (app-agnostic)
 * extension subsystem and Agent-Canvas.
 */
export function createAppHostDeps(): HostApiDeps {
  return {
    getActiveConversation: (): ConversationSummary | null => {
      const conversation = ConversationService.getCurrentConversation();
      if (!conversation) return null;
      return {
        id: conversation.id,
        title: conversation.title,
        status: conversation.execution_status,
      };
    },

    showInformationMessage: (message: string) => {
      toast(message, TOAST_OPTIONS);
    },

    executeCommand: (command: string) => {
      const match = contributionRegistry
        .getCommands()
        .find((c) => c.command === command);
      if (!match) {
        console.warn(`[extensions] unknown command: ${command}`);
        return undefined;
      }
      return match.run();
    },

    storageGet: (extensionId: string, key: string) => {
      try {
        const raw = localStorage.getItem(storageKey(extensionId, key));
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },

    storageSet: (extensionId: string, key: string, value: unknown) => {
      try {
        localStorage.setItem(
          storageKey(extensionId, key),
          JSON.stringify(value),
        );
      } catch {
        // Ignore quota / serialization errors — extension storage is best-effort.
      }
    },

    backendCloudFetch: async (
      path: string,
      method: BackendFetchMethod,
      body?: unknown,
    ): Promise<BackendFetchResponse | null> => {
      const { backend } = getActiveBackend();

      // Only available for cloud backends
      if (backend.kind !== "cloud") {
        return null;
      }

      try {
        const data = await withRetry(
          () =>
            callCloudProxy({
              backend,
              method,
              path,
              body,
            }),
          `cloudFetch ${method} ${path}`,
        );

        return {
          ok: true,
          status: 200,
          data,
        };
      } catch (error) {
        // Extract status from axios error if available
        const axiosError = error as { response?: { status?: number } };
        const status = axiosError.response?.status ?? 500;

        return {
          ok: false,
          status,
          data: null,
        };
      }
    },

    navigate: (path: string) => {
      if (globalNavigate) {
        globalNavigate(path);
      }
    },

    createConversation: async (
      options?: CreateConversationOptions,
    ): Promise<string> => {
      const task = await withRetry(
        () =>
          AgentServerConversationService.createConversation(
            options?.initialMessage ?? undefined, // initialUserMsg
            options?.title ?? undefined, // conversationInstructions
            undefined, // metadata
            undefined, // plugins
            undefined, // workingDirOverride
            undefined, // workspaceMode
            undefined, // parentConversationId
            undefined, // agentType
            options?.sandboxId, // sandboxId
          ),
        "createConversation",
      );

      // The task ID (task.id) is what we navigate to - the conversation route
      // handles polling for the task to complete and redirecting to the actual
      // conversation ID (task.app_conversation_id).
      const taskOrConversationId = task.app_conversation_id ?? task.id;

      // Navigate to the conversation
      if (globalNavigate) {
        globalNavigate(`/conversations/${taskOrConversationId}`);
      }

      return taskOrConversationId;
    },
  };
}
