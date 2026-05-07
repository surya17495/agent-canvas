import React from "react";
import { OpenHandsEvent } from "#/types/v1/core";
import { EventMessage } from "./event-message";
import { ChatMessage } from "../../features/chat/chat-message";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { usePlanPreviewEvents } from "./hooks/use-plan-preview-events";
import { groupEvents } from "./group-events";
import { EventGroup } from "./event-message-components";
// TODO: Implement microagent functionality for V1 when APIs support V1 event IDs
// import { AgentState } from "#/types/agent-state";
// import MemoryIcon from "#/icons/memory_icon.svg?react";

interface MessagesProps {
  messages: OpenHandsEvent[]; // UI events (actions replaced by observations)
  allEvents: OpenHandsEvent[]; // Full event history (for action lookup)
}

export const Messages: React.FC<MessagesProps> = React.memo(
  ({ messages, allEvents }) => {
    const { getOptimisticUserMessage } = useOptimisticUserMessageStore();

    const optimisticUserMessage = getOptimisticUserMessage();

    // Get the set of event IDs that should render PlanPreview
    // This ensures only one preview per user message "phase"
    const planPreviewEventIds = usePlanPreviewEvents(allEvents);

    // Fold consecutive action/observation events into collapsible groups so a
    // long sequence of tool calls doesn't dominate the chat scroll. Items that
    // can't be grouped (or that fall in a short run) are still rendered one by
    // one, identically to before.
    const renderedItems = groupEvents(messages);

    const renderEventMessage = (event: OpenHandsEvent, index: number) => (
      <EventMessage
        key={event.id}
        event={event}
        messages={allEvents}
        isLastMessage={messages.length - 1 === index}
        isInLast10Actions={messages.length - 1 - index < 10}
        planPreviewEventIds={planPreviewEventIds}
      />
    );

    return (
      <>
        {renderedItems.map((item) => {
          if (item.kind === "single") {
            return renderEventMessage(item.event, item.index);
          }

          const groupKey = item.events[0]?.id ?? `group-${item.startIndex}`;
          return (
            <EventGroup key={groupKey} events={item.events}>
              {item.events.map((event, offset) =>
                renderEventMessage(event, item.startIndex + offset),
              )}
            </EventGroup>
          );
        })}

        {optimisticUserMessage && (
          <ChatMessage type="user" message={optimisticUserMessage} />
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    // Prevent re-renders if messages are the same length
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }

    return true;
  },
);

Messages.displayName = "Messages";
