import React from "react";
import { UserAvatar } from "./user-avatar";
import { UserContextMenu } from "../user/user-context-menu";
import { AddBackendModal } from "../backends/add-backend-modal";
import { EditBackendModal } from "../backends/edit-backend-modal";
import { ManageBackendsModal } from "../backends/manage-backends-modal";
import { cn } from "#/utils/utils";
import type { Backend } from "#/api/backend-registry/types";

interface UserActionsProps {
  user?: { avatar_url: string };
  isLoading?: boolean;
}

export function UserActions({ user, isLoading }: UserActionsProps) {
  const [accountContextMenuIsVisible, setAccountContextMenuIsVisible] =
    React.useState(false);
  const [menuResetCount, setMenuResetCount] = React.useState(0);
  const [addBackendModalOpen, setAddBackendModalOpen] = React.useState(false);
  const [manageBackendsModalOpen, setManageBackendsModalOpen] =
    React.useState(false);
  const [editingBackend, setEditingBackend] = React.useState<Backend | null>(
    null,
  );
  const hideTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    },
    [],
  );

  const showAccountMenu = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setAccountContextMenuIsVisible(true);
  };

  const isAnyModalOpen =
    addBackendModalOpen || manageBackendsModalOpen || editingBackend !== null;

  const hideAccountMenu = () => {
    // Don't auto-hide while any modal is open — the user is
    // interacting with content outside the menu's hover area.
    if (isAnyModalOpen) return;
    hideTimeoutRef.current = window.setTimeout(() => {
      setAccountContextMenuIsVisible(false);
      setMenuResetCount((c) => c + 1);
    }, 500);
  };

  const closeAccountMenu = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (accountContextMenuIsVisible) {
      setAccountContextMenuIsVisible(false);
      setMenuResetCount((c) => c + 1);
    }
  };

  const openAddBackendModal = () => {
    closeAccountMenu();
    setAddBackendModalOpen(true);
  };

  const openManageBackendsModal = () => {
    closeAccountMenu();
    setManageBackendsModalOpen(true);
  };

  const openEditBackendModal = (backend: Backend) => {
    setManageBackendsModalOpen(false);
    setEditingBackend(backend);
  };

  const closeEditBackendModal = () => {
    setEditingBackend(null);
    setManageBackendsModalOpen(true);
  };

  return (
    <div
      data-testid="user-actions"
      className="relative cursor-pointer group"
      onMouseEnter={showAccountMenu}
      onMouseLeave={hideAccountMenu}
    >
      <UserAvatar avatarUrl={user?.avatar_url} isLoading={isLoading} />

      <div
        data-testid="user-context-menu-wrapper"
        className={cn(
          "opacity-0 pointer-events-none",
          // Suppress hover-visible behavior whenever any modal
          // is open so the menu doesn't bleed through behind the dialog.
          !isAnyModalOpen &&
            "group-hover:opacity-100 group-hover:pointer-events-auto",
          accountContextMenuIsVisible &&
            !isAnyModalOpen &&
            "opacity-100 pointer-events-auto",
        )}
      >
        <UserContextMenu
          key={menuResetCount}
          onClose={closeAccountMenu}
          onOpenAddBackend={openAddBackendModal}
          onOpenManageBackends={openManageBackendsModal}
        />
      </div>

      {addBackendModalOpen ? (
        <AddBackendModal onClose={() => setAddBackendModalOpen(false)} />
      ) : null}

      {manageBackendsModalOpen ? (
        <ManageBackendsModal
          onClose={() => setManageBackendsModalOpen(false)}
          onEditBackend={openEditBackendModal}
        />
      ) : null}

      {editingBackend ? (
        <EditBackendModal
          backend={editingBackend}
          onClose={closeEditBackendModal}
        />
      ) : null}
    </div>
  );
}
