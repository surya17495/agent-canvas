import React from "react";
import { useTranslation } from "react-i18next";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSetAcpConfigOption } from "#/hooks/mutation/use-set-acp-config-option";
import type {
  ACPConfigOption,
  ACPConfigOptionChoice,
} from "#/types/acp-config-option";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import CheckIcon from "#/icons/checkmark.svg?react";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { Typography } from "#/ui/typography";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { chatInputPillButtonClassName } from "#/utils/form-control-classes";

const OPTION_LABEL_MAX_CHARS = 22;

/**
 * Options the dynamic pickers never render.
 *
 * `model`: ACP servers that advertise model switching as a config option
 * (e.g. opencode, `acp_model_via_config_option`) would otherwise grow a second
 * model picker here. The model chip (ChatInputModel → /switch_acp_model) owns
 * model switching for every ACP provider — the agent-server maps that route
 * onto the config-option protocol itself when needed — so a duplicate picker
 * with hundreds of raw entries is suppressed.
 */
const EXCLUDED_OPTION_IDS = new Set(["model"]);

function truncateLabel(label: string): string {
  if (label.length <= OPTION_LABEL_MAX_CHARS) {
    return label;
  }
  return `${label.slice(0, OPTION_LABEL_MAX_CHARS)}…`;
}

function choiceLabel(choice: ACPConfigOptionChoice): string {
  return choice.name?.trim() ? choice.name : choice.value;
}

function optionLabel(option: ACPConfigOption): string {
  return option.name?.trim() ? option.name : option.id;
}

interface SetOptionArgs {
  configId: string;
  value: string | boolean;
}

interface ConfigOptionPickerProps {
  option: ACPConfigOption;
  disabled: boolean;
  onSet: (args: SetOptionArgs) => void;
}

/**
 * A `select` config option: pill trigger + popover listing the advertised
 * choices, visually mirroring the ChatInputModel pill/popover. Choices that
 * came from grouped ACP options carry a `group` label, rendered as
 * non-selectable section headers (same presentation-role pattern as the
 * "Available models" header in ChatInputModelMenuContent).
 */
function ConfigOptionSelect({
  option,
  disabled,
  onSet,
}: ConfigOptionPickerProps) {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    () => setIsPopoverOpen(false),
    triggerRef,
  );

  const choices = option.choices ?? [];
  const current =
    choices.find((choice) => choice.value === option.current_value) ?? null;
  const label = optionLabel(option);
  const currentLabel = current
    ? choiceLabel(current)
    : typeof option.current_value === "string"
      ? option.current_value
      : label;
  const title = current ? `${label}: ${choiceLabel(current)}` : label;

  const handleSelect = (choice: ACPConfigOptionChoice) => {
    if (choice.value !== option.current_value) {
      onSet({ configId: option.id, value: choice.value });
    }
    setIsPopoverOpen(false);
  };

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={chatInputPillButtonClassName}
        title={option.description ? `${title} — ${option.description}` : title}
        disabled={disabled}
        data-testid={`chat-input-config-option-${option.id}`}
        aria-label={label}
        aria-expanded={isPopoverOpen}
        aria-haspopup="menu"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPopoverOpen((open) => !open);
        }}
      >
        <span>{truncateLabel(currentLabel)}</span>
        <ComboboxCaretInline isOpen={isPopoverOpen} />
      </button>

      {isPopoverOpen && (
        <ContextMenu
          ref={popoverRef}
          testId={`chat-input-config-option-${option.id}-popover`}
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[200px] max-w-[320px] max-h-[60vh] overflow-y-auto"
        >
          {/* Same presentation-role section header as the model popover. */}
          <li role="presentation" className="px-2 pt-1 pb-0.5">
            <Typography.Text className="text-[11px] font-medium text-[var(--oh-text-dim)] uppercase tracking-wide leading-4">
              {label}
            </Typography.Text>
          </li>
          {choices.map((choice, index) => {
            const isSelected = choice.value === option.current_value;
            const groupHeader =
              choice.group && choice.group !== choices[index - 1]?.group
                ? choice.group
                : null;
            return (
              <React.Fragment key={choice.value}>
                {groupHeader && (
                  <li role="presentation" className="px-2 pt-1 pb-0.5">
                    <Typography.Text className="text-[11px] font-medium text-[var(--oh-text-dim)] uppercase tracking-wide leading-4">
                      {groupHeader}
                    </Typography.Text>
                  </li>
                )}
                <ContextMenuListItem
                  testId={`chat-input-config-option-${option.id}-choice-${choice.value}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSelect(choice);
                  }}
                  className={cn(
                    "flex items-center gap-2",
                    isSelected && "bg-[var(--oh-interactive-hover)]",
                  )}
                >
                  <span
                    className="flex-1 truncate text-sm leading-5"
                    title={choice.description ?? choiceLabel(choice)}
                  >
                    {choiceLabel(choice)}
                  </span>
                  {isSelected && (
                    <CheckIcon
                      width={14}
                      height={14}
                      className="shrink-0"
                      aria-hidden
                    />
                  )}
                </ContextMenuListItem>
              </React.Fragment>
            );
          })}
        </ContextMenu>
      )}
    </div>
  );
}

/**
 * A `boolean` config option: a pill that toggles the value directly — no
 * popover, since there is nothing to pick. State reads `Label: On/Off` so the
 * pill is self-describing without an extra i18n'd legend (labels come from the
 * ACP server, which is the sole source of truth for these options).
 */
function ConfigOptionToggle({
  option,
  disabled,
  onSet,
}: ConfigOptionPickerProps) {
  const { t } = useTranslation("openhands");
  const isOn = option.current_value === true;
  const label = optionLabel(option);
  const stateLabel = t(isOn ? I18nKey.COMMON$ON : I18nKey.COMMON$OFF);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        className={chatInputPillButtonClassName}
        title={option.description ?? label}
        disabled={disabled}
        data-testid={`chat-input-config-option-${option.id}`}
        aria-label={label}
        aria-pressed={isOn}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSet({ configId: option.id, value: !isOn });
        }}
      >
        <span>{truncateLabel(`${label}: ${stateLabel}`)}</span>
      </button>
    </div>
  );
}

/**
 * Dynamic pickers for the ACP session config options the active conversation
 * advertises (`AppConversation.config_options`, relayed by the agent-server —
 * G8). Renders one pill per option next to the model chip: `select` options
 * get a popover of choices, `boolean` options toggle in place. Renders
 * nothing on the home page, on non-ACP conversations, and on agent-servers
 * that predate the relay (no `config_options` in the wire payload).
 */
export function ChatInputConfigOptions() {
  const { data: conversation } = useActiveConversation();
  const setAcpConfigOption = useSetAcpConfigOption();

  const conversationId = conversation?.id ?? null;
  const options = (conversation?.config_options ?? []).filter(
    (option) => !EXCLUDED_OPTION_IDS.has(option.id),
  );

  if (
    !conversationId ||
    conversation?.agent_kind !== "acp" ||
    options.length === 0
  ) {
    return null;
  }

  const handleSet = ({ configId, value }: SetOptionArgs) => {
    setAcpConfigOption.mutate({ conversationId, configId, value });
  };

  return (
    <div
      className="flex min-w-0 items-center gap-3"
      data-testid="chat-input-config-options"
    >
      {options.map((option) =>
        option.type === "boolean" ? (
          <ConfigOptionToggle
            key={option.id}
            option={option}
            disabled={setAcpConfigOption.isPending}
            onSet={handleSet}
          />
        ) : (
          <ConfigOptionSelect
            key={option.id}
            option={option}
            disabled={setAcpConfigOption.isPending}
            onSet={handleSet}
          />
        ),
      )}
    </div>
  );
}
