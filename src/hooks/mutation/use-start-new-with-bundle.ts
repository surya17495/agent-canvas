import { useCallback } from "react";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useDeleteConversation } from "#/hooks/mutation/use-delete-conversation";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useEventStore } from "#/stores/use-event-store";
import {
  buildAcpAgentSettingsDiff,
  getAcpProvider,
} from "#/constants/acp-providers";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import type { SettingsValue } from "#/types/settings";
import type { AgentModelBundle } from "#/types/agent-model-bundle";

/**
 * Fork: start a *new* conversation running the chosen bundle's agent/model.
 *
 * Used for incompatible ("start-new-only") picker choices, which can't switch
 * in place — a different ACP provider needs a fresh subprocess, so context
 * can't be preserved. Only safe launch context (workspace / repo / branch) is
 * carried over; the transcript and runtime memory are **not**.
 *
 * The new conversation's agent is set per-launch via ``agentSettingsOverride``
 * so the user's saved default is left untouched (the home launcher and
 * Settings → Agent still own the persisted default). ACP targets only: forking
 * to a native LLM profile would need the profile's encrypted LLM config in the
 * start payload and is deferred — those rows stay non-actionable.
 *
 * Empty-source cleanup: if the source conversation has zero events (the user
 * picked a different bundle before sending any message — the
 * ``uninitialized`` row, or any other ``start-new-only`` taken on a fresh
 * conversation), the fork-and-delete leaves the user with a single
 * conversation on the chosen model rather than a leftover empty one. The
 * delete is fire-and-forget after navigation: a failure leaves a harmless
 * empty conversation behind, never blocks the fork.
 */
export function useStartNewWithBundle() {
  const { mutate: createConversation, isPending } = useCreateConversation();
  const { mutate: deleteConversation } = useDeleteConversation();
  const { navigate } = useNavigation();
  const { data: conversation } = useActiveConversation();

  const start = useCallback(
    (bundle: AgentModelBundle) => {
      if (bundle.kind !== "acp") return;

      const provider = getAcpProvider(bundle.provider);
      // Non-secret ACP agent settings (kind/server/command/model) — the same
      // shape Settings → Agent and onboarding persist, here used per-launch.
      const override = buildAcpAgentSettingsDiff(bundle.provider, {
        command: provider?.default_command,
        model: bundle.model,
      });
      if (!override) return;

      // Carry only safe launch context from the current conversation.
      const repository =
        conversation?.selected_repository && conversation.git_provider
          ? {
              name: conversation.selected_repository,
              gitProvider: conversation.git_provider,
              branch: conversation.selected_branch ?? undefined,
            }
          : undefined;

      // Capture the source-conversation cleanup decision at fork-time, while
      // the event store still reflects the source. Reading via ``getState()``
      // (vs. subscribing) keeps the hook from re-rendering on every event tick
      // and pins the value as it was *before* navigation switches the store.
      const sourceConversationId = conversation?.id ?? null;
      const sourceWasEmpty =
        sourceConversationId !== null &&
        useEventStore.getState().events.length === 0;

      createConversation(
        {
          agentSettingsOverride: override as Record<string, SettingsValue>,
          workingDir: conversation?.selected_workspace ?? undefined,
          repository,
        },
        {
          onSuccess: (data) => {
            navigate(`/conversations/${data.conversation_id}`);
            if (sourceWasEmpty && sourceConversationId) {
              // Fire-and-forget: any failure (e.g. the source was already
              // deleted) is fine — the user is already on the new
              // conversation; the worst case is a leftover empty row.
              deleteConversation({ conversationId: sourceConversationId });
            }
          },
          onError: (error) =>
            displayErrorToast(error instanceof Error ? error.message : null),
        },
      );
    },
    [conversation, createConversation, deleteConversation, navigate],
  );

  return { start, isPending };
}
