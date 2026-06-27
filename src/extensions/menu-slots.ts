/**
 * Registry of named menu **slots** — the host surfaces that can host extension
 * contributed menu items (`contributes.menus`). A slot id is the stable contract
 * between a host menu component and the items extensions target at it, mirroring
 * VS Code menu ids such as `view/title` or `editor/context`.
 *
 * Adding a new host menu is "add a slot id here + have that component call
 * `useMenuItems(slot)`". Extensions place items by using the slot id as the key under
 * `contributes.menus`. Slot ids are *not* validated in the manifest (an extension may
 * target a slot a given host build doesn't render yet); unknown slots simply render
 * nothing, exactly like VS Code.
 */
export const MENU_SLOTS = {
  /** The conversation-tabs overflow/context menu. */
  conversationTabsContext: "conversationTabs/context",
} as const;

export type MenuSlotId = (typeof MENU_SLOTS)[keyof typeof MENU_SLOTS];
