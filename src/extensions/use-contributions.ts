import {
  selectActivityBarItems,
  selectCommands,
  selectMenuItemsForSlot,
  selectViews,
  useContributionRegistry,
} from "./contribution-registry";
import type { ActivityBarItem, CommandItem, MenuItem, ViewItem } from "./types";

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
 * Menu items contributed into a single named menu slot (see `menu-slots.ts`). Returns
 * a stable reference between mutations so a host menu can render it without re-render
 * loops; an empty slot yields a shared empty array.
 */
export function useMenuItems(slot: string): MenuItem[] {
  return useContributionRegistry(selectMenuItemsForSlot(slot));
}
