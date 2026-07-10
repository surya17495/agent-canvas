import { Puzzle } from "lucide-react";
import type { PageItem } from "#/extensions/types";
import { cn } from "#/utils/utils";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { NavigationLink } from "#/components/shared/navigation-link";
import { SidebarCollapsedIconSlot } from "./sidebar-collapsed-icon-slot";
import {
  SIDEBAR_ICON_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_CLASS,
  sidebarNavLabelClassName,
  sidebarNavRowClassName,
} from "./sidebar-layout";

const ICON_SIZE = 18;

interface SidebarPageLinkProps {
  page: PageItem;
  collapsed?: boolean;
}

/**
 * Renders a sidebar navigation link for an extension-contributed page.
 *
 * Unlike `SidebarContributionButton` (which opens a side panel), this navigates to a
 * full-width page route at `/x/:extensionId/:pageId`, matching the behavior of built-in
 * nav items like Customize and Automate.
 *
 * Security: the icon is rendered as an `<img>` from a bundle-provided URL (never
 * injected as raw SVG markup). A missing/invalid icon falls back to a default glyph
 * so a malformed bundle can't break the rail.
 */
export function SidebarPageLink({
  page,
  collapsed = false,
}: SidebarPageLinkProps) {
  const to = `/x/${page.extensionId}/${page.id}`;

  const icon = page.iconUrl ? (
    <img
      src={page.iconUrl}
      alt=""
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden="true"
    />
  ) : (
    <Puzzle width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
  );

  const link = (
    <NavigationLink
      to={to}
      data-testid={`sidebar-page-${page.extensionId}-${page.id}`}
      aria-label={collapsed ? page.title : undefined}
      className={({ isActive }) =>
        cn(
          sidebarNavRowClassName({ collapsed }),
          isActive
            ? SIDEBAR_ROW_INTERACTIVE_CLASS.active
            : SIDEBAR_ROW_INTERACTIVE_CLASS.idle,
        )
      }
    >
      {collapsed ? (
        <SidebarCollapsedIconSlot active={false}>
          {icon}
        </SidebarCollapsedIconSlot>
      ) : (
        <span className={SIDEBAR_ICON_SLOT_CLASS}>{icon}</span>
      )}
      <span className={sidebarNavLabelClassName(collapsed)}>{page.title}</span>
    </NavigationLink>
  );

  if (!collapsed) return link;

  return (
    <StyledTooltip content={page.title} placement="right">
      {link}
    </StyledTooltip>
  );
}
