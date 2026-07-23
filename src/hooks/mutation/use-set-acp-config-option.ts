import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { invalidateConversationQueries } from "./conversation-mutation-utils";

interface SetAcpConfigOptionVars {
  /**
   * The ACP conversation whose live session option is being changed. Unlike
   * `useSwitchAcpModel` there is no home-page fallback: config options are
   * discovered from a running session (`ConversationInfo.config_options`), so
   * there is nothing to set before a conversation exists.
   */
  conversationId: string;
  /** `ACPConfigOption.id` — the `config_id` of the option to change. */
  configId: string;
  /**
   * The new value: a `choices[].value` for `select` options, a boolean for
   * `boolean` options.
   */
  value: string | boolean;
}

/**
 * Sets one advertised ACP session config option on a live conversation
 * (agent-server `set_acp_config_option` → protocol `session/set_config_option`,
 * G8 relay). The option applies to subsequent turns without losing context.
 *
 * Invalidates the conversation queries so the pickers re-read the refreshed
 * `config_options` (the agent-server re-snapshots them after a successful set).
 * Errors surface through the global mutation error toast — a rejected option
 * (400) or a wedged ACP server (504) must not fail silently.
 */
export const useSetAcpConfigOption = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, configId, value }: SetAcpConfigOptionVars) =>
      AgentServerConversationService.setAcpConfigOption(
        conversationId,
        configId,
        value,
      ),
    onSuccess: (_data, { conversationId }) => {
      invalidateConversationQueries(queryClient, conversationId);
    },
  });
};
