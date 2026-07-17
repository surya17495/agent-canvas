import React from "react";
import { useTranslation } from "react-i18next";
import { useChatInputLlmProfileState } from "#/hooks/use-chat-input-llm-profile-state";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { ContextMenu } from "#/ui/context-menu";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { mapProvider } from "#/utils/map-provider";
import { extractModelAndProvider } from "#/utils/extract-model-and-provider";
import { formatNativeModelName } from "#/utils/format-model-name";
import { chatInputPillButtonClassName } from "#/utils/form-control-classes";
import { LlmModelPickerMenu } from "./llm-model-picker-menu";

const PROFILE_LABEL_MAX_CHARS = 18;

function truncateLabel(label: string): string {
  return label.length <= PROFILE_LABEL_MAX_CHARS
    ? label
    : `${label.slice(0, PROFILE_LABEL_MAX_CHARS)}…`;
}

/**
 * Compact "Provider/model" identity string for a profile's model id, using the
 * existing provider-mapping utilities (no hardcoded provider list). Returns null
 * for a profile with no model so the caller can fall back to the profile name.
 */
function formatModelIdentity(model: string | null): string | null {
  if (!model) return null;
  const { provider } = extractModelAndProvider(model);
  const modelName = formatNativeModelName(model);
  const providerLabel = provider ? mapProvider(provider) : null;
  if (providerLabel && modelName) return `${providerLabel}/${modelName}`;
  return modelName ?? model;
}

interface ChatInputLlmProfileMenuContentProps {
  onClose: () => void;
  dividerInset?: "menu";
  settingsLinkClassName?: string;
  settingsIconClassName?: string;
}

/**
 * The in-conversation OpenHands LLM-profile switcher list. Selecting a profile
 * live-swaps the running conversation's LLM (local: POST /switch_llm; cloud:
 * POST /switch_profile) or, with no conversation, activates it as the default
 * (the ACP analog is {@link ChatInputModelMenuContent}). Shared by the inline
 * pill and the chat-input overflow submenu.
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
  const {
    currentProfileName,
    currentProfileModel,
    isLoading,
    isError,
    isSwitching,
  } = useChatInputLlmProfileState();
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    // Click-outside closes without stealing focus back to the trigger; Escape
    // and selection restore focus explicitly via `closeAndRestoreFocus`.
    () => setIsPopoverOpen(false),
    triggerRef,
  );

  const closeAndRestoreFocus = React.useCallback(() => {
    setIsPopoverOpen(false);
    triggerRef.current?.focus();
  }, []);

  // The trigger is always rendered — even while loading, on a fetch error, or
  // with zero profiles — so the current model is always visible next to the
  // composer and the menu's loading/empty/error states stay reachable. No
  // `return null`, which would hide the current model and orphan those states.
  const modelIdentity = formatModelIdentity(currentProfileModel);

  const label =
    currentProfileName ??
    (isError
      ? t(I18nKey.MODEL$LIST_FAILED)
      : t(I18nKey.LLM$SELECT_MODEL_PLACEHOLDER));

  // Full profile + provider/model identity for the accessible name/title, so a
  // mobile pill that visually truncates still exposes the complete context.
  const accessibleName = currentProfileName
    ? modelIdentity
      ? `${currentProfileName} — ${modelIdentity}`
      : currentProfileName
    : label;
  const busyTitle = isLoading ? t(I18nKey.HOME$LOADING) : accessibleName;

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          chatInputPillButtonClassName,
          "max-w-[200px] sm:max-w-[340px]",
        )}
        title={busyTitle}
        aria-label={busyTitle}
        data-testid="chat-input-llm-profile"
        aria-haspopup="menu"
        aria-expanded={isPopoverOpen}
        aria-controls={isPopoverOpen ? menuId : undefined}
        // Disabled mid-switch so re-opening can't fire a second switch request.
        disabled={isSwitching}
        aria-busy={isSwitching || isLoading}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPopoverOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isPopoverOpen) {
            event.preventDefault();
            closeAndRestoreFocus();
          }
        }}
      >
        {isLoading ? (
          <>
            <LoadingSpinner size="small" />
            <span className="truncate">{t(I18nKey.HOME$LOADING)}</span>
          </>
        ) : (
          <>
            <span className="truncate">{truncateLabel(label)}</span>
            {modelIdentity && (
              <span
                className="hidden min-w-0 truncate text-xs text-[var(--oh-muted)] sm:inline"
                aria-hidden
              >
                {modelIdentity}
              </span>
            )}
          </>
        )}
        <ComboboxCaretInline isOpen={isPopoverOpen} />
      </button>

      {isPopoverOpen && (
        <ContextMenu
          ref={popoverRef}
          id={menuId}
          role="menu"
          aria-label={t(I18nKey.LLM$SELECT_MODEL_PLACEHOLDER)}
          testId="chat-input-llm-profile-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[200px] max-w-[320px] max-h-[60vh] overflow-y-auto"
        >
          <ChatInputLlmProfileMenuContent onClose={closeAndRestoreFocus} />
        </ContextMenu>
      )}
    </div>
  );
}
