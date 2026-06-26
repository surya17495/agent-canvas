import toast from "react-hot-toast";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { TOAST_OPTIONS } from "#/utils/custom-toast-handlers";
import { contributionRegistry } from "../contribution-registry";
import type { ConversationSummary } from "../sdk/types";
import type { HostApiDeps } from "./host-api";

const STORAGE_PREFIX = "agent-canvas:ext";

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
  };
}
