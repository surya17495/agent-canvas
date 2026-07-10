import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useSettingsPages } from "#/extensions/use-contributions";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { ExtensionWebview } from "#/components/features/extensions/extension-webview";
import { I18nKey } from "#/i18n/declaration";

/** Bottom padding to leave below the iframe */
const BOTTOM_PADDING = 24;
/** Minimum height for the settings iframe */
const MIN_HEIGHT = 400;

/**
 * Hook that calculates available height from an element to the bottom of the viewport.
 * Updates on window resize and when the element's position changes.
 * Uses a callback ref to handle cases where the element is conditionally rendered.
 */
function useAvailableHeight(minHeight: number = MIN_HEIGHT) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>(minHeight);

  // Callback ref that captures the element when it mounts
  const ref = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;

    const updateHeight = () => {
      const rect = element.getBoundingClientRect();
      const availableHeight = window.innerHeight - rect.top - BOTTOM_PADDING;
      setHeight(Math.max(availableHeight, minHeight));
    };

    // Defer initial calculation to next frame to ensure layout is complete
    const rafId = requestAnimationFrame(() => {
      updateHeight();
    });

    window.addEventListener("resize", updateHeight);
    window.addEventListener("scroll", updateHeight, { passive: true });

    // Use ResizeObserver to detect layout changes
    const observer = new ResizeObserver(updateHeight);
    if (element.parentElement) {
      observer.observe(element.parentElement);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("scroll", updateHeight);
      observer.disconnect();
    };
  }, [element, minHeight]);

  return { ref, height };
}

/**
 * Catch-all Settings route (`/settings/x/:extensionId`) that mounts a contributed
 * settings page (`contributes.settingsPages`) as a sandboxed {@link ExtensionWebview}.
 *
 * Declarative-first: the page is resolved from the contribution registry (already
 * `when`-filtered) and rendered host-side; no extension code runs to show it. The
 * webview persists via the extension's existing `storage` capability, so this needs no
 * new capability. Unknown / disabled / hidden pages render a neutral fallback rather
 * than throwing.
 *
 * Layout: Uses `autoResize` mode so the iframe grows to fit its content naturally,
 * matching how native settings pages flow down the page without fixed height constraints.
 */
export default function ExtensionSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { extensionId } = useParams();
  const pages = useSettingsPages();
  const context = useExtensionContext();

  // Hooks must be called unconditionally, before any early returns
  const { ref, height } = useAvailableHeight();

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
      ref={ref}
      data-testid="extension-settings"
      style={{ height }}
      className="overflow-hidden"
    >
      <ExtensionWebview
        extensionId={page.extensionId}
        capabilities={page.capabilities ?? []}
        deps={context.deps}
        src={page.pageUrl}
        title={page.title}
        extensionSource={page.extensionSource}
      />
    </div>
  );
}
