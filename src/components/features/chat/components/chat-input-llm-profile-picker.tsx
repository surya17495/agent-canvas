import React from "react";
import { useTranslation } from "react-i18next";
import { useChatInputLlmProfileState } from "#/hooks/use-chat-input-llm-profile-state";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { ContextMenu } from "#/ui/context-menu";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { chatInputPillButtonClassName } from "#/utils/form-control-classes";
import { LlmModelPickerMenu } from "./llm-model-picker-menu";

const PROFILE_LABEL_MAX_CHARS = 18;

function truncateLabel(label: string): string {
  return label.length <= PROFILE_LABEL_MAX_CHARS
    ? label
    : `${label.slice(0, PROFILE_LABEL_MAX_CHARS)}…`;
}

interface ChatInputLlmProfileMenuContentProps {
  onClose: () => void;
  dividerInset?: "menu";
  settingsLinkClassName?: string;
  settingsIconClassName?: string;
}

/**
 * The in-conversation OpenHands LLM-profile switcher list. Selecting a profile
 * live-swaps the running conversation's LLM via `/switch_profile` (the ACP
 * analog is {@link ChatInputModelMenuContent}). Shared by the inline pill and
 * the chat-input overflow submenu.
 *
 * Delegates rendering to {@link LlmModelPickerMenu} (search, provider grouping,
 * keyboard navigation, loading/empty/error/pending states); this wrapper only
 * wires the live profile state + switch mutation to it.
 */
export function ChatInputLlmProfileMenuContent({
  onClose,
  dividerInset,
  settingsLinkClassName,
  settingsIconClassName,
}: ChatInputLlmProfileMenuContentProps) {
  const { t } = useTranslation("openhands");
  const {
    profiles,
    currentProfileName,
    isLoading,
    isError,
    isSwitching,
    selectProfile,
  } = useChatInputLlmProfileState();

  return (
    <LlmModelPickerMenu
      profiles={profiles}
      currentProfileName={currentProfileName}
      isLoading={isLoading}
      isError={isError}
      isSwitching={isSwitching}
      onSelect={selectProfile}
      onClose={onClose}
      settingsPath="/settings/llm"
      settingsLabel={t(I18nKey.SETTINGS$LLM_PROFILES)}
      dividerInset={dividerInset}
      settingsLinkClassName={settingsLinkClassName}
      settingsIconClassName={settingsIconClassName}
    />
  );
}

export function ChatInputLlmProfilePicker() {
  const { t } = useTranslation("openhands");
  const { currentProfileName, isLoading, isError, isSwitching } =
    useChatInputLlmProfileState();
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    () => setIsPopoverOpen(false),
    triggerRef,
  );

  // While the profiles list is loading, stay out of the way (avoids a flash of
  // the empty-state placeholder before data lands). Once settled we always show
  // the pill — even with zero profiles or a fetch error — so the picker can
  // surface the empty/error state and its deep link into LLM Settings.
  if (isLoading) {
    return null;
  }

  const label =
    currentProfileName ??
    (isError
      ? t(I18nKey.MODEL$LIST_FAILED)
      : t(I18nKey.LLM$SELECT_MODEL_PLACEHOLDER));

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={cn(chatInputPillButtonClassName, "max-w-[200px]")}
        title={currentProfileName ?? undefined}
        data-testid="chat-input-llm-profile"
        aria-expanded={isPopoverOpen}
        aria-haspopup="dialog"
        // Disabled mid-switch so re-opening can't fire a second /switch_profile.
        disabled={isSwitching}
        aria-busy={isSwitching}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPopoverOpen((open) => !open);
        }}
      >
        <span className="truncate">{truncateLabel(label)}</span>
        <ComboboxCaretInline isOpen={isPopoverOpen} />
      </button>

      {isPopoverOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="chat-input-llm-profile-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[200px] max-w-[320px] max-h-[60vh] overflow-y-auto"
        >
          <ChatInputLlmProfileMenuContent
            onClose={() => setIsPopoverOpen(false)}
          />
        </ContextMenu>
      )}
    </div>
  );
}
