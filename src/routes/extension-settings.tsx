import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useSettingsPages } from "#/extensions/use-contributions";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { ExtensionWebview } from "#/components/features/extensions/extension-webview";
import { I18nKey } from "#/i18n/declaration";

/**
 * Catch-all Settings route (`/settings/x/:extensionId`) that mounts a contributed
 * settings page (`contributes.settingsPages`) as a sandboxed {@link ExtensionWebview}.
 *
 * Declarative-first: the page is resolved from the contribution registry (already
 * `when`-filtered) and rendered host-side; no extension code runs to show it. The
 * webview persists via the extension's existing `storage` capability, so this needs no
 * new capability. Unknown / disabled / hidden pages render a neutral fallback rather
 * than throwing.
 */
export default function ExtensionSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { extensionId } = useParams();
  const pages = useSettingsPages();
  const context = useExtensionContext();

  // One settings page per extension is surfaced via this catch-all route; mount the
  // first contributed (and `when`-visible) page for the extension.
  const page = pages.find((p) => p.extensionId === extensionId);

  if (!page || !context || !page.pageUrl) {
    return (
      <div
        data-testid="extension-settings-unavailable"
        className="text-sm text-tertiary-light"
      >
        {t(I18nKey.SETTINGS$EXTENSION_PAGE_UNAVAILABLE)}
      </div>
    );
  }

  return (
    <div
      data-testid="extension-settings"
      className="h-full min-h-[480px] overflow-hidden rounded-md border border-(--oh-border-input)"
    >
      <ExtensionWebview
        extensionId={page.extensionId}
        capabilities={page.capabilities ?? []}
        deps={context.deps}
        src={page.pageUrl}
        title={page.title}
      />
    </div>
  );
}
