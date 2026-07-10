import { useMemo } from "react";
import {
  selectActivityBarItems,
  selectCommands,
  selectMenuItemsForSlot,
  selectPages,
  selectSettingsPages,
  selectViews,
  useContributionRegistry,
} from "./contribution-registry";
import type {
  ActivityBarItem,
  CommandItem,
  MenuItem,
  PageItem,
  SettingsPageItem,
  ViewItem,
} from "./types";
import { useUiContext } from "./ui-context";
import { evaluateWhen } from "./when";

/**
 * React hooks exposing the contribution registry to host UI. Each selects a single
 * slice so a component only re-renders when its relevant contributions change.
 */

export function useActivityBarItems(): ActivityBarItem[] {
  return useContributionRegistry(selectActivityBarItems);
}

export function useExtensionCommands(): CommandItem[] {
  return useContributionRegistry(selectCommands);
}

export function useExtensionViews(): ViewItem[] {
  return useContributionRegistry(selectViews);
}

/**
 * Menu items contributed into a single named menu slot (see `menu-slots.ts`),
 * filtered by each item's optional `when` clause against the host UI-context (see
 * `ui-context.tsx`). Filtering reads host facts only — it runs no extension code, so
 * a hidden item is simply never rendered.
 *
 * The result is memoised on the (stable) slot items and the UI-context, so a host
 * menu renders it without re-render loops; an empty/unfiltered slot still resolves to
 * a stable reference between renders.
 */
export function useMenuItems(slot: string): MenuItem[] {
  const items = useContributionRegistry(selectMenuItemsForSlot(slot));
  const context = useUiContext();
  return useMemo(
    () => items.filter((item) => evaluateWhen(item.when, context)),
    [items, context],
  );
}

/**
 * Contributed settings pages, filtered by each page's optional `when` clause against
 * the host UI-context (see `ui-context.tsx`). Filtering reads host facts only — it
 * runs no extension code, so a hidden page is simply never surfaced (neither its nav
 * item nor its route body). Memoised on the (stable) registry slice + UI-context.
 */
export function useSettingsPages(): SettingsPageItem[] {
  const pages = useContributionRegistry(selectSettingsPages);
  const context = useUiContext();
  return useMemo(
    () => pages.filter((page) => evaluateWhen(page.when, context)),
    [pages, context],
  );
}

/**
 * Contributed full-width pages (sidebar nav items), filtered by each page's optional
 * `when` clause against the host UI-context. Filtering reads host facts only — it
 * runs no extension code, so a hidden page is simply never rendered in the sidebar.
 * Memoised on the (stable) registry slice + UI-context.
 */
export function useExtensionPages(): PageItem[] {
  const pages = useContributionRegistry(selectPages);
  const context = useUiContext();
  return useMemo(
    () => pages.filter((page) => evaluateWhen(page.when, context)),
    [pages, context],
  );
}
