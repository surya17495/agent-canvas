import { ConversationPanel } from "../conversation-panel/conversation-panel";
import { ConversationPanelWrapper } from "../conversation-panel/conversation-panel-wrapper";

interface ConversationPanelOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ConversationPanelOverlay({
  isOpen,
  onClose,
}: ConversationPanelOverlayProps) {
  return (
    <ConversationPanelWrapper isOpen={isOpen}>
      <ConversationPanel onClose={onClose} />
    </ConversationPanelWrapper>
  );
}
