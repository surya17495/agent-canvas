import React from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import type { ProfileInfo } from "@openhands/typescript-client";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import CheckIcon from "#/icons/checkmark.svg?react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { Divider } from "#/ui/divider";
import { Typography } from "#/ui/typography";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { mapProvider } from "#/utils/map-provider";
import { extractModelAndProvider } from "#/utils/extract-model-and-provider";
import { dropdownMenuRowForegroundClassName } from "#/utils/dropdown-classes";

/**
 * Number of profiles at or above which the search box is shown. Below this a
 * short list is faster to scan than to filter, so search would just add noise.
 */
const SEARCH_VISIBILITY_THRESHOLD = 6;

/**
 * Meets the mobile 44x44px touch target on small screens, then relaxes to the
 * compact desktop height so the menu doesn't grow excessively tall with a
 * pointer. Applied to the interactive rows the picker adds.
 */
const menuRowTouchTargetClassName = "min-h-[44px] sm:min-h-0";

/** Visible keyboard-focus treatment for the picker's interactive rows. */
const menuRowFocusVisibleClassName = cn(
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset",
  "focus-visible:ring-white/40 focus-visible:bg-[var(--oh-interactive-hover)]",
);

interface ProfileGroup {
  /** Provider id used for the group key (e.g. "anthropic", or "" for custom). */
  providerId: string;
  /** Human label for the group heading (brand name, not translated). */
  label: string;
  profiles: ProfileInfo[];
}

/**
 * Groups profiles by the provider parsed from their model id. A profile with no
 * model (or a bare model with no provider prefix) lands in the "Custom" group so
 * it never disappears from the list. Groups are sorted by label; profiles within
 * a group keep their incoming order (the backend list order).
 */
export function groupProfilesByProvider(
  profiles: ProfileInfo[],
  customLabel: string,
): ProfileGroup[] {
  const byProvider = new Map<string, ProfileGroup>();
  for (const profile of profiles) {
    const providerId = profile.model
      ? extractModelAndProvider(profile.model).provider
      : "";
    const label = providerId ? mapProvider(providerId) : customLabel;
    const existing = byProvider.get(providerId);
    if (existing) {
      existing.profiles.push(profile);
    } else {
      byProvider.set(providerId, { providerId, label, profiles: [profile] });
    }
  }
  return Array.from(byProvider.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export interface LlmModelPickerMenuProps {
  profiles: ProfileInfo[];
  /** The profile the active conversation / default is currently using. */
  currentProfileName: string | null;
  isLoading: boolean;
  isError: boolean;
  /** True while a switch mutation is in flight. */
  isSwitching: boolean;
  onSelect: (profileName: string) => void;
  onClose: () => void;
  /** Deep link into the real LLM Settings UI (add/configure providers). */
  settingsPath: string;
  settingsLabel: string;
  dividerInset?: "menu";
  settingsLinkClassName?: string;
  settingsIconClassName?: string;
}

/**
 * Production LLM model picker rendered inside a ContextMenu popover whose owning
 * `<ul>` carries `role="menu"`. Populated only from the real LLM-profile list
 * (no hardcoded models). Provides search, provider grouping, keyboard
 * navigation, current-selection indication, and explicit loading / empty /
 * error / mutation-pending states. Selecting a profile live-swaps the running
 * conversation's LLM (local: POST /switch_llm; cloud: POST /switch_profile) or,
 * with no conversation, activates it as the pre-conversation default — all via
 * the caller-supplied `onSelect`.
 *
 * Accessibility: each profile is a `menuitemradio` (`aria-checked` marks the
 * current profile) wrapped in an `<li role="none">`, and the Settings deep link
 * is a `menuitem`; headings/dividers/search are presentation-only so the menu
 * exposes exactly the actionable items. Escape closes the menu from the search
 * box, any profile row, and the Settings row.
 *
 * Presentational by design: all data + mutations arrive as props so it can be
 * unit-tested against adapter-boundary fixtures.
 */
export function LlmModelPickerMenu({
  profiles,
  currentProfileName,
  isLoading,
  isError,
  isSwitching,
  onSelect,
  onClose,
  settingsPath,
  settingsLabel,
  dividerInset,
  settingsLinkClassName,
  settingsIconClassName,
}: LlmModelPickerMenuProps) {
  const { t } = useTranslation("openhands");
  const [query, setQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const showSearch = profiles.length >= SEARCH_VISIBILITY_THRESHOLD;

  const filteredProfiles = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.model?.toLowerCase().includes(q) ?? false),
    );
  }, [profiles, query]);

  const groups = React.useMemo(
    () =>
      groupProfilesByProvider(filteredProfiles, t(I18nKey.MODEL$CUSTOM_MODEL)),
    [filteredProfiles, t],
  );
  // Group only once there is more than one provider to distinguish; a single
  // provider renders as a flat list under the generic "Available profiles"
  // heading so the extra brand heading doesn't add noise.
  const isGrouped = groups.length > 1;

  // Flat, render-order list of the option profiles so keyboard navigation and
  // the ref array line up 1:1 with what's on screen.
  const flatProfiles = React.useMemo(
    () => groups.flatMap((group) => group.profiles),
    [groups],
  );

  React.useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, flatProfiles.length);
  }, [flatProfiles.length]);

  // Focus management: land focus on the search box when present, otherwise the
  // first option, so the picker is immediately keyboard-drivable on open.
  React.useEffect(() => {
    if (isLoading || isError) return;
    if (showSearch) {
      searchInputRef.current?.focus();
    } else {
      optionRefs.current[0]?.focus();
    }
    // Run once on open (deps intentionally cover the branch inputs only).
  }, [isLoading, isError, showSearch]);

  const focusOption = (index: number) => {
    const clamped = Math.max(0, Math.min(index, flatProfiles.length - 1));
    optionRefs.current[clamped]?.focus();
  };

  const handleSelect = (profileName: string, isCurrent: boolean) => {
    if (isCurrent || isSwitching) {
      onClose();
      return;
    }
    onSelect(profileName);
    onClose();
  };

  const handleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (index === flatProfiles.length - 1) return;
        focusOption(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (index === 0) {
          if (showSearch) searchInputRef.current?.focus();
          return;
        }
        focusOption(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusOption(0);
        break;
      case "End":
        event.preventDefault();
        focusOption(flatProfiles.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (query) {
        setQuery("");
        return;
      }
      onClose();
    }
  };

  const settingsLink = (
    <li role="none" className="text-sm">
      <NavigationLink
        to={settingsPath}
        role="menuitem"
        onClick={onClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        data-testid="llm-model-picker-settings-link"
        className={cn(
          "flex min-h-[44px] items-center gap-2 rounded p-2 leading-5 sm:min-h-[30px]",
          "text-[var(--oh-foreground)] transition-colors hover:bg-[var(--oh-interactive-hover)]",
          menuRowFocusVisibleClassName,
          settingsLinkClassName,
        )}
      >
        <SettingsGearIcon
          width={16}
          height={16}
          className={cn("shrink-0", settingsIconClassName)}
          aria-hidden
        />
        <span>{settingsLabel}</span>
      </NavigationLink>
    </li>
  );

  const menuDivider = (
    <li role="presentation">
      <Divider inset={dividerInset} />
    </li>
  );

  if (isLoading) {
    return (
      <li
        role="presentation"
        data-testid="llm-model-picker-loading"
        className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-[var(--oh-muted)]"
      >
        <LoadingSpinner size="small" />
        <span>{t(I18nKey.HOME$LOADING)}</span>
      </li>
    );
  }

  if (isError) {
    return (
      <>
        <li
          role="presentation"
          data-testid="llm-model-picker-error"
          className="px-2 py-3 text-sm text-danger"
        >
          {t(I18nKey.MODEL$LIST_FAILED)}
        </li>
        {menuDivider}
        {settingsLink}
      </>
    );
  }

  // Empty state: no configured profiles at all — point the user at settings to
  // add one (the picker never invents models).
  if (profiles.length === 0) {
    return (
      <>
        <li
          role="presentation"
          data-testid="llm-model-picker-empty"
          className="flex flex-col gap-1 px-2 py-3 text-sm"
        >
          <span className="text-[var(--oh-foreground)]">
            {t(I18nKey.MODEL$NO_SAVED_PROFILES)}
          </span>
          <span className="text-xs text-[var(--oh-muted)]">
            {t(I18nKey.MODEL$NO_PROFILES_HINT)}
          </span>
        </li>
        {menuDivider}
        {settingsLink}
      </>
    );
  }

  const optionIndexByName = new Map(
    flatProfiles.map((profile, index) => [profile.name, index]),
  );

  return (
    <>
      {showSearch && (
        <li role="presentation" className="px-1 pt-1 pb-1">
          <div
            data-testid="llm-model-picker-search"
            className={cn(
              "relative flex items-center rounded-md",
              "border border-[var(--oh-border)] bg-base-secondary",
              "focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20",
              "transition-colors",
            )}
          >
            <Search
              className="ml-2 h-3.5 w-3.5 shrink-0 text-[var(--oh-muted)]"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t(I18nKey.MODEL$SEARCH_PLACEHOLDER)}
              aria-label={t(I18nKey.MODEL$SEARCH_PLACEHOLDER)}
              data-testid="llm-model-picker-search-input"
              className={cn(
                "min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm leading-4",
                "text-[var(--oh-foreground)] outline-none border-0",
                "placeholder:text-[var(--oh-muted)]",
                "[&::-webkit-search-cancel-button]:hidden",
              )}
            />
            {query && (
              <button
                type="button"
                aria-label={t(I18nKey.COMMAND_MENU$CLEAR_SEARCH_LABEL)}
                data-testid="llm-model-picker-search-clear"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className={cn(
                  "mr-1 flex min-h-[44px] min-w-[44px] items-center justify-center rounded",
                  "sm:min-h-0 sm:min-w-0 sm:p-0.5",
                  "text-[var(--oh-muted)] hover:text-[var(--oh-foreground)]",
                  menuRowFocusVisibleClassName,
                )}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        </li>
      )}

      {flatProfiles.length === 0 ? (
        <li
          role="presentation"
          data-testid="llm-model-picker-no-results"
          className="px-2 py-3 text-sm text-[var(--oh-muted)]"
        >
          {t(I18nKey.COMMON$NO_RESULTS)}
        </li>
      ) : (
        groups.map((group) => (
          <React.Fragment key={group.providerId || "custom"}>
            {/* role="presentation" keeps the section label a valid <li> child
                of the role="menu" <ul> without exposing it as a menu item. */}
            <li role="presentation" className="px-2 pt-1 pb-0.5">
              <Typography.Text className="text-xs font-medium uppercase leading-4 tracking-wide text-[var(--oh-text-dim)]">
                {isGrouped
                  ? group.label
                  : t(I18nKey.SETTINGS$AVAILABLE_PROFILES)}
              </Typography.Text>
            </li>
            {group.profiles.map((profile) => {
              const optionIndex = optionIndexByName.get(profile.name) ?? 0;
              const isCurrent = profile.name === currentProfileName;
              return (
                <li role="none" key={profile.name}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    ref={(node) => {
                      optionRefs.current[optionIndex] = node;
                    }}
                    data-testid={`chat-input-llm-profile-option-${profile.name}`}
                    onKeyDown={(event) =>
                      handleOptionKeyDown(event, optionIndex)
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleSelect(profile.name, isCurrent);
                    }}
                    className={cn(
                      dropdownMenuRowForegroundClassName,
                      "flex flex-col items-stretch justify-center gap-0.5",
                      menuRowTouchTargetClassName,
                      menuRowFocusVisibleClassName,
                      isCurrent && "bg-[var(--oh-interactive-hover)]",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="flex-1 truncate text-sm leading-5"
                        title={profile.model ?? profile.name}
                      >
                        {profile.name}
                      </span>
                      {isCurrent && (
                        <CheckIcon
                          width={14}
                          height={14}
                          className="shrink-0"
                          aria-hidden
                          data-testid={`llm-model-picker-current-${profile.name}`}
                        />
                      )}
                    </span>
                    {profile.model && (
                      <span className="block truncate text-xs leading-4 text-[var(--oh-muted)]">
                        {profile.model}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </React.Fragment>
        ))
      )}

      {menuDivider}
      {settingsLink}
    </>
  );
}
