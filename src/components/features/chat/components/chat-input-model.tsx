import ChevronDownSmallIcon from "#/icons/chevron-down-small.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { cn } from "#/utils/utils";
import React from "react";
import { useTranslation } from "react-i18next";
import { useChatInputLlmDisplay } from "./use-chat-input-llm-display";

const MODEL_LABEL_MAX_CHARS = 10;

function truncateModelLabel(model: string): string {
  if (model.length <= MODEL_LABEL_MAX_CHARS) {
    return model;
  }
  return `${model.slice(0, MODEL_LABEL_MAX_CHARS)}…`;
}

export function ChatInputModel() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const llmDisplay = useChatInputLlmDisplay();
  const llmDestinationLabel = t(
    backend.kind === "cloud"
      ? I18nKey.SETTINGS$LLM_SETTINGS
      : I18nKey.SETTINGS$LLM_PROFILES,
  );
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);

  const popoverRef = useClickOutsideElement<HTMLUListElement>(() => {
    setIsPopoverOpen(false);
  });

  if (!llmDisplay) {
    return null;
  }

  const truncatedModelLabel = truncateModelLabel(llmDisplay.label);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-[100px] border border-transparent px-1.5 text-sm font-normal leading-5 text-[var(--oh-muted)] whitespace-nowrap min-w-0 transition-[border-color,color]",
          "hover:text-white hover:bg-white/10 cursor-pointer",
        )}
        title={llmDisplay.title}
        data-testid="chat-input-llm-model"
        aria-expanded={isPopoverOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPopoverOpen((open) => !open);
        }}
      >
        <span>{truncatedModelLabel}</span>
        <ChevronDownSmallIcon
          width={18}
          height={18}
          color="currentColor"
          className="shrink-0"
          aria-hidden
        />
      </button>

      {isPopoverOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="chat-input-llm-model-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[200px] max-w-[320px]"
        >
          <li className="text-sm">
            <div className="p-2 text-white break-all">
              <div className="leading-5">{llmDisplay.label}</div>
              {llmDisplay.profileName && (
                <div className="mt-1 text-xs leading-4 text-[var(--oh-muted)]">
                  {llmDisplay.model}
                </div>
              )}
            </div>
          </li>
          <Divider />
          <li className="text-sm">
            <NavigationLink
              to="/settings"
              onClick={() => setIsPopoverOpen(false)}
              className="flex h-[30px] items-center gap-2 rounded p-2 leading-5 text-white hover:bg-[var(--oh-interactive-hover)] transition-colors"
            >
              <SettingsGearIcon
                width={16}
                height={16}
                className="shrink-0"
                aria-hidden
              />
              <span>{llmDestinationLabel}</span>
            </NavigationLink>
          </li>
        </ContextMenu>
      )}
    </div>
  );
}
