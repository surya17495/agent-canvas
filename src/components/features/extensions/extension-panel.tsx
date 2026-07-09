import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useExtensionPanelStore } from "#/extensions/panel-store";
import { useExtensionViews } from "#/extensions/use-contributions";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { ExtensionWebview } from "./extension-webview";

/**
 * Host-owned region that renders the currently open extension webview panel (driven by
 * `useExtensionPanelStore`). Renders nothing when no view is open or the feature is
 * disabled (no extension context).
 */
export function ExtensionPanel() {
  const { t } = useTranslation("openhands");
  const activeExtensionId = useExtensionPanelStore((s) => s.activeExtensionId);
  const activeViewId = useExtensionPanelStore((s) => s.activeViewId);
  const close = useExtensionPanelStore((s) => s.close);
  const views = useExtensionViews();
  const context = useExtensionContext();

  const view = React.useMemo(
    () =>
      views.find(
        (v) => v.extensionId === activeExtensionId && v.id === activeViewId,
      ),
    [views, activeExtensionId, activeViewId],
  );

  if (!view || !context) {
    return null;
  }

  return (
    <aside
      data-testid="extension-panel"
      className="hidden md:flex md:flex-col w-[360px] shrink-0 h-full border-l border-(--oh-border-input) bg-base"
    >
      <header className="flex items-center justify-between px-3 h-10 shrink-0 border-b border-(--oh-border-input)">
        <span className="text-sm font-medium truncate">{view.name}</span>
        <button
          type="button"
          onClick={close}
          aria-label={t(I18nKey.BUTTON$CLOSE)}
          className="p-1 rounded hover:bg-(--oh-color-tertiary) cursor-pointer"
        >
          <X size={16} />
        </button>
      </header>
      <div className="flex-1 min-h-0">
        {view.pageUrl ? (
          <ExtensionWebview
            extensionId={view.extensionId}
            capabilities={view.capabilities ?? []}
            deps={context.deps}
            src={view.pageUrl}
            title={view.name}
            extensionSource={view.extensionSource}
          />
        ) : (
          <div data-testid="extension-panel-empty" className="h-full" />
        )}
      </div>
    </aside>
  );
}
