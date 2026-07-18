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

/**
 * Height of the mobile top bar (`SidebarMobileMenuBar`, `h-12` = 48px, shown
 * below the `md` breakpoint). The popover opens upward from the composer, so its
 * top must stay below this bar — otherwise it renders behind the header, which
 * wins hit-testing and visually occludes the search box.
 */
const MOBILE_HEADER_HEIGHT = 48;
/** Tailwind `md` breakpoint (px); below it the mobile header is present. */
const MOBILE_BREAKPOINT = 768;
/** Clear gap kept between the popover top and whatever is above it. */
const POPOVER_SAFE_GAP = 8;
/** Never shrink the popover below this — scroll within it instead. */
const POPOVER_MIN_HEIGHT = 160;

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

  // The popover opens upward (`position="top"`) anchored to the trigger, so the
  // usable height is the space above the trigger. Cap it to that space (minus a
  // safe gap, and minus the mobile header so it can't render behind it), letting
  // the menu scroll within instead of overflowing past the viewport top. Recomputed
  // on open and on resize/orientation change.
  const [menuMaxHeight, setMenuMaxHeight] = React.useState<number>();
  React.useLayoutEffect(() => {
    if (!isPopoverOpen) return undefined;
    const recompute = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerTop = trigger.getBoundingClientRect().top;
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      const topInset = (isMobile ? MOBILE_HEADER_HEIGHT : 0) + POPOVER_SAFE_GAP;
      const available = triggerTop - topInset;
      setMenuMaxHeight(Math.max(POPOVER_MIN_HEIGHT, available));
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [isPopoverOpen]);

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
          // >=44px effective touch target on mobile (the row is items-center, so
          // siblings stay their size, gap-separated — no overlap); relaxes to
          // the compact pill height on pointer/desktop.
          "min-h-[44px] sm:min-h-0",
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
          style={menuMaxHeight ? { maxHeight: menuMaxHeight } : undefined}
          className="z-[60] mb-2 min-w-[200px] max-w-[320px] max-h-[60vh] overflow-y-auto"
        >
          <ChatInputLlmProfileMenuContent onClose={closeAndRestoreFocus} />
        </ContextMenu>
      )}
    </div>
  );
}
