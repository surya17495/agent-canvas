import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useExtensionPages } from "#/extensions/use-contributions";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import { ExtensionWebview } from "#/components/features/extensions/extension-webview";
import { I18nKey } from "#/i18n/declaration";

/** Bottom padding to leave below the iframe */
const BOTTOM_PADDING = 24;
/** Minimum height for the page iframe */
const MIN_HEIGHT = 400;

/**
 * Hook that calculates available height from an element to the bottom of the viewport.
 * Updates on window resize and when the element's position changes.
 */
function useAvailableHeight(minHeight: number = MIN_HEIGHT) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>(minHeight);

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

    const rafId = requestAnimationFrame(() => {
      updateHeight();
    });

    window.addEventListener("resize", updateHeight);
    window.addEventListener("scroll", updateHeight, { passive: true });

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
 * Full-width extension page route (`/x/:extensionId/:pageId`) that mounts a contributed
 * page (`contributes.pages`) as a sandboxed {@link ExtensionWebview}.
 *
 * This is the destination for extension sidebar nav items contributed via `pages`. Unlike
 * side panels (activity bar views), these render in the main content area like built-in
 * pages such as Customize and Automate.
 *
 * Declarative-first: the page is resolved from the contribution registry (already
 * `when`-filtered) and rendered host-side; no extension code runs to show it. Unknown /
 * disabled / hidden pages render a neutral fallback rather than throwing.
 */
export default function ExtensionPageScreen() {
  const { t } = useTranslation("openhands");
  const { extensionId, pageId } = useParams();
  const context = useExtensionContext();
  const { ref, height } = useAvailableHeight();

  // Subscribe to the pages reactively so we re-render when extensions load
  const allPages = useExtensionPages();

  // Look up the page from the registered pages
  const page = useMemo(
    () =>
      extensionId && pageId
        ? allPages.find((p) => p.extensionId === extensionId && p.id === pageId)
        : undefined,
    [allPages, extensionId, pageId],
  );

  if (!page || !context || !page.pageUrl) {
    return (
      <div
        data-testid="extension-page-unavailable"
        className="flex items-center justify-center h-full text-sm text-tertiary-light"
      >
        {t(I18nKey.EXTENSIONS$PAGE_UNAVAILABLE)}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-testid="extension-page"
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
