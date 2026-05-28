import React from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentBundleCatalog,
  type AgentBundleGroup,
} from "#/hooks/use-agent-bundle-catalog";
import {
  useActiveAgentBundleContext,
  type ActiveAgentBundleState,
} from "#/hooks/use-active-agent-bundle-context";
import { useSelectAgentBundle } from "#/hooks/mutation/use-select-agent-bundle";
import { useAcpModelContext } from "#/hooks/use-acp-model-context";
import { getBundleAction } from "#/utils/agent-bundle/get-bundle-action";
import type {
  AgentModelBundle,
  BundleAction,
  BundleActionReason,
} from "#/types/agent-model-bundle";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import CheckIcon from "#/icons/checkmark.svg?react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { Divider } from "#/ui/divider";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

const MODEL_LABEL_MAX_CHARS = 22;

function truncateLabel(
  label: string,
  maxChars = MODEL_LABEL_MAX_CHARS,
): string {
  return label.length <= maxChars ? label : `${label.slice(0, maxChars)}…`;
}

/** Map a non-actionable row's reason to its short, translated hint text. */
function useReasonText(): (reason?: BundleActionReason) => string | undefined {
  const { t } = useTranslation("openhands");
  return (reason) => {
    switch (reason) {
      case "different-agent":
      case "unsupported":
        return t(I18nKey.AGENT_PICKER$REASON_NEW_CONVERSATION);
      default:
        // "cloud" rows are never rendered (cloud shows a read-only label);
        // "uninitialized" is always a fork (actionable) — its row goes through
        // the "Start new conversation with X" branch, not this reason map.
        return undefined;
    }
  };
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="px-2 pt-1 pb-0.5">
      <Typography.Text className="text-[11px] font-medium text-[var(--oh-text-dim)] uppercase tracking-wide leading-4">
        {label}
      </Typography.Text>
    </div>
  );
}

interface BundleRowProps {
  bundle: AgentModelBundle;
  action: BundleAction;
  reasonText?: string;
  onSelect: (bundle: AgentModelBundle) => void;
}

function BundleRow({ bundle, action, reasonText, onSelect }: BundleRowProps) {
  const { t } = useTranslation("openhands");
  const isCurrent = action === "current";
  const isFork = action === "start-new-only";
  // Phase 2 makes an incompatible ACP choice actionable as a new-conversation
  // fork; forking to a native profile is deferred, so those stay greyed.
  const canFork = isFork && bundle.kind === "acp";
  const actionable =
    action === "switch-live" || action === "set-default" || canFork;
  const subLabel = bundle.kind === "openhands" ? bundle.model : null;

  // Non-actionable rows (disabled, or a not-yet-forkable native start-new)
  // render as a plain, muted item with a reason — visible but clearly not a
  // live switch, matching the "greyed with a clear reason" UX.
  if (!actionable && !isCurrent) {
    return (
      <li
        className="px-2 py-1.5 opacity-50"
        data-testid={`agent-bundle-option-${bundle.id}`}
      >
        <span className="block truncate text-sm leading-5" title={bundle.label}>
          {bundle.label}
        </span>
        {reasonText && (
          <span className="block truncate text-xs leading-4 text-[var(--oh-muted)]">
            {reasonText}
          </span>
        )}
      </li>
    );
  }

  // In the clickable branch a fork is always an ACP target; show the explicit
  // "start new conversation with X" so the click's effect is unambiguous.
  // Otherwise the secondary line is the profile's model (native rows).
  const secondary = canFork
    ? t(I18nKey.AGENT_PICKER$START_NEW_WITH, { name: bundle.label })
    : subLabel;

  return (
    <ContextMenuListItem
      testId={`agent-bundle-option-${bundle.id}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(bundle);
      }}
      className={cn(
        "flex flex-col gap-0.5",
        isCurrent && "bg-[var(--oh-interactive-hover)]",
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span
          className="flex-1 truncate text-sm leading-5"
          title={bundle.label}
        >
          {bundle.label}
        </span>
        {isCurrent && (
          <CheckIcon width={14} height={14} className="shrink-0" aria-hidden />
        )}
      </span>
      {secondary && (
        <span className="block truncate text-xs leading-4 text-[var(--oh-muted)]">
          {secondary}
        </span>
      )}
    </ContextMenuListItem>
  );
}

interface AgentModelPickerMenuContentProps {
  onClose: () => void;
  dividerInset?: "menu";
  settingsLinkClassName?: string;
  settingsIconClassName?: string;
}

/**
 * Shared body of the unified model picker — the grouped, capability-aware
 * catalog plus a Settings link. Rendered both inside the inline popover and
 * in the chat-input overflow submenu, so the two surfaces can't drift.
 */
export function AgentModelPickerMenuContent({
  onClose,
  dividerInset,
  settingsLinkClassName,
  settingsIconClassName,
}: AgentModelPickerMenuContentProps) {
  const groups = useAgentBundleCatalog();
  const ctx = useActiveAgentBundleContext();
  const { select } = useSelectAgentBundle();
  const { destinationPath, destinationLabel } = useAcpModelContext();
  const reasonText = useReasonText();

  const handleSelect = (bundle: AgentModelBundle) => {
    const { action } = getBundleAction(bundle, ctx);
    select(bundle, action);
    onClose();
  };

  return (
    <>
      {groups.length > 0 ? (
        groups.map((group) => (
          <CatalogGroup
            key={group.key}
            group={group}
            ctx={ctx}
            reasonText={reasonText}
            onSelect={handleSelect}
          />
        ))
      ) : ctx.currentLabel ? (
        // No catalog (cloud / local-only surfaces unavailable) — show the
        // running model read-only, like the old ChatInputModel did.
        <li className="text-sm">
          <div className="p-2 leading-5 text-[var(--oh-foreground)] break-all">
            {ctx.currentLabel}
          </div>
        </li>
      ) : null}
      <Divider inset={dividerInset} />
      <li className="text-sm">
        <NavigationLink
          to={destinationPath}
          onClick={onClose}
          className={cn(
            "flex h-[30px] items-center gap-2 rounded p-2 leading-5 text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)] transition-colors",
            settingsLinkClassName,
          )}
        >
          <SettingsGearIcon
            width={16}
            height={16}
            className={cn("shrink-0", settingsIconClassName)}
            aria-hidden
          />
          <span>{destinationLabel}</span>
        </NavigationLink>
      </li>
    </>
  );
}

interface CatalogGroupProps {
  group: AgentBundleGroup;
  ctx: ActiveAgentBundleState;
  reasonText: (reason?: BundleActionReason) => string | undefined;
  onSelect: (bundle: AgentModelBundle) => void;
}

function CatalogGroup({ group, ctx, reasonText, onSelect }: CatalogGroupProps) {
  const { t } = useTranslation("openhands");
  const rows = group.bundles.map((bundle) => ({
    bundle,
    ...getBundleAction(bundle, ctx),
  }));

  // Inside a conversation, a wholly-incompatible group (every model would need
  // a new conversation) collapses to a single row instead of a wall of greyed
  // models — keeps the in-conversation picker readable.
  const collapsed =
    ctx.hasConversation && rows.every((r) => r.action === "start-new-only");

  if (collapsed) {
    const hint = reasonText(rows[0]?.reason);
    // ACP provider groups fork into a new conversation (the provider default,
    // listed first); forking to a native profile is deferred → greyed.
    const representative = group.key !== "openhands" ? group.bundles[0] : null;
    if (representative) {
      return (
        <ContextMenuListItem
          testId={`agent-bundle-group-collapsed-${group.key}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect(representative);
          }}
          className="flex flex-col gap-0.5"
        >
          <span className="block truncate text-sm leading-5">
            {group.label}
          </span>
          <span className="block truncate text-xs leading-4 text-[var(--oh-muted)]">
            {t(I18nKey.AGENT_PICKER$START_NEW_WITH, { name: group.label })}
          </span>
        </ContextMenuListItem>
      );
    }
    return (
      <li
        className="px-2 py-1.5 opacity-50"
        data-testid={`agent-bundle-group-collapsed-${group.key}`}
      >
        <span className="block truncate text-sm leading-5">{group.label}</span>
        {hint && (
          <span className="block truncate text-xs leading-4 text-[var(--oh-muted)]">
            {hint}
          </span>
        )}
      </li>
    );
  }

  return (
    <>
      <GroupHeader label={group.label} />
      {rows.map(({ bundle, action, reason }) => (
        <BundleRow
          key={bundle.id}
          bundle={bundle}
          action={action}
          reasonText={reasonText(reason)}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

/**
 * Unified inline model picker. Replaces both the native ``SwitchProfileButton``
 * and the ACP ``ChatInputModel`` with one capability-aware control: the inline
 * button shows the running selection, the popover offers the whole catalog with
 * each row enabled / disabled / collapsed per {@link getBundleAction}.
 */
export function AgentModelPicker() {
  const ctx = useActiveAgentBundleContext();
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    () => setIsOpen(false),
    triggerRef,
  );

  if (!ctx.currentLabel) {
    return null;
  }

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-[100px] border border-transparent px-1.5 text-sm font-normal leading-5 text-[var(--oh-muted)] whitespace-nowrap min-w-0 transition-[border-color,background-color,box-shadow,opacity] duration-150 motion-reduce:transition-none",
          "hover:text-white hover:bg-white/10 cursor-pointer",
        )}
        title={ctx.currentLabel}
        data-testid="agent-model-picker"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
      >
        <span>{truncateLabel(ctx.currentLabel)}</span>
        <ComboboxCaretInline isOpen={isOpen} />
      </button>

      {isOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="agent-model-picker-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[220px] max-w-[340px] max-h-[60vh] overflow-y-auto"
        >
          <AgentModelPickerMenuContent onClose={() => setIsOpen(false)} />
        </ContextMenu>
      )}
    </div>
  );
}
