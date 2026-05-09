import React from "react";

import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useConversationStore } from "#/stores/conversation-store";
import { renderApplicationPrompt } from "#/prompts/registry";
import type { RunApplicationPromptOptions } from "#/prompts/types";

export function useRunApplicationPrompt() {
  const { navigate } = useNavigation();
  const setMessageToSend = useConversationStore(
    (state) => state.setMessageToSend,
  );
  const {
    mutateAsync: createConversation,
    isPending,
    isSuccess,
  } = useCreateConversation();

  const runApplicationPrompt = React.useCallback(
    async (options: RunApplicationPromptOptions) => {
      const prompt = renderApplicationPrompt(options.promptId, options.context);

      if (options.mode === "current-conversation-draft") {
        setMessageToSend(prompt);
        options.onSuccess?.();
        return;
      }

      if (options.mode === "new-conversation-initial-message") {
        const data = await createConversation({ query: prompt }).catch(
          () => null,
        );
        if (!data) return;
        options.onSuccess?.();
        (options.navigate ?? navigate)(
          `/conversations/${data.conversation_id}`,
        );
        return;
      }

      const data = await createConversation({}).catch(() => null);
      if (!data) return;
      setMessageToSend(prompt);
      options.onSuccess?.();
      (options.navigate ?? navigate)(`/conversations/${data.conversation_id}`);
    },
    [createConversation, navigate, setMessageToSend],
  );

  return {
    runApplicationPrompt,
    isPending,
    isSuccess,
  };
}
