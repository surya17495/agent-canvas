import { Puzzle } from "lucide-react";
import { useMenuItems } from "#/extensions/use-contributions";
import type { MenuItem } from "#/extensions/types";
import { cn } from "#/utils/utils";
import {
  dropdownInstantColorClassName,
  dropdownMenuRowIconWrapperClassName,
} from "#/utils/dropdown-classes";

interface ExtensionMenuItemsProps {
  /** Menu-slot id to render items for (see `menu-slots.ts`). */
  slot: string;
  /** Called after an item runs, e.g. to close the host menu. */
  onAfterSelect?: () => void;
}

/**
 * Renders the extension-contributed menu items (`contributes.menus`) targeting a
 * named slot, as `<li>` rows suitable for dropping into a host `ContextMenu`.
 *
 * Declarative-first: the item's label comes from its bound command's title and
 * selecting it runs that command — no extension code executes while the menu is shown.
 * When the slot has no contributions (including when extensions are disabled, leaving
 * the registry empty) it renders nothing, so host menus pay no cost.
 *
 * Mirrors `SidebarContributionButton`: contributed items use the host's own menu-row
 * styling so they're visually consistent with built-ins, with a default puzzle glyph.
 */
export function ExtensionMenuItems({
  slot,
  onAfterSelect,
}: ExtensionMenuItemsProps) {
  const items = useMenuItems(slot);

  if (items.length === 0) {
    return null;
  }

  const handleSelect = (item: MenuItem) => {
    Promise.resolve(item.run()).catch(() => {});
    onAfterSelect?.();
  };

  return (
    <>
      <li
        role="separator"
        aria-hidden
        data-testid="extension-menu-separator"
        className="my-1 h-px bg-[var(--oh-border-subtle)] list-none"
      />
      {items.map((item) => (
        <li key={`${item.extensionId}:${item.command}`} className="list-none">
          <button
            type="button"
            data-testid={`extension-menu-item-${item.extensionId}-${item.command}`}
            title={item.title}
            onClick={() => handleSelect(item)}
            className={cn(
              "group flex h-[30px] w-full min-w-0 cursor-pointer items-center gap-2 rounded p-2 text-start text-sm text-white",
              dropdownInstantColorClassName,
              "hover:bg-[var(--oh-interactive-hover)]",
            )}
          >
            <span className={dropdownMenuRowIconWrapperClassName} aria-hidden>
              <Puzzle className="h-4 w-4" />
            </span>
            <span className="truncate">{item.title}</span>
          </button>
        </li>
      ))}
    </>
  );
}
