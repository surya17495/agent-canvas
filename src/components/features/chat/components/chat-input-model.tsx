import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import CircuitIcon from "#/icons/u-circuit.svg?react";

export function ChatInputModel() {
  const { data: conversation } = useActiveConversation();

  if (!conversation?.llm_model) {
    return null;
  }

  return (
    <span
      className="text-sm font-normal leading-5 text-[#A3A3A3] flex items-center gap-1 whitespace-nowrap"
      title={conversation.llm_model}
      data-testid="chat-input-llm-model"
    >
      <CircuitIcon width={14} height={14} className="shrink-0" />
      <span>{conversation.llm_model}</span>
    </span>
  );
}
