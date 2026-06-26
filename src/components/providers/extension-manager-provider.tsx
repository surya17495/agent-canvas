import React from "react";
import { ExtensionManager } from "#/extensions/extension-manager";
import { createAppHostDeps } from "#/extensions/host/create-app-host-deps";
import { createHttpBundleSource } from "#/extensions/dev-bundle-source";
import { useExtensionPanelStore } from "#/extensions/panel-store";
import {
  DEV_EXTENSION_BUNDLE_URLS,
  EXTENSIONS_ENABLED,
} from "#/extensions/feature-flag";
import type { HostApiDeps } from "#/extensions/host/host-api";

interface ExtensionContextValue {
  manager: ExtensionManager;
  deps: HostApiDeps;
}

const ExtensionContext = React.createContext<ExtensionContextValue | null>(
  null,
);

/** Access the extension manager/deps; null when the feature is disabled. */
export function useExtensionContext(): ExtensionContextValue | null {
  return React.useContext(ExtensionContext);
}

function ExtensionManagerProviderInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const deps = React.useMemo(() => createAppHostDeps(), []);

  const managerRef = React.useRef<ExtensionManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new ExtensionManager(deps, undefined, {
      onOpenView: (extensionId, viewId) =>
        useExtensionPanelStore.getState().openView(extensionId, viewId),
    });
  }
  const manager = managerRef.current;

  React.useEffect(() => {
    let cancelled = false;
    const installed: string[] = [];

    (async () => {
      for (const url of DEV_EXTENSION_BUNDLE_URLS) {
        const result = await manager.install(createHttpBundleSource(url));
        if (cancelled) return;
        if (result.ok) {
          installed.push(result.manifest.id);
        } else {
          console.warn(`[extensions] failed to install ${url}:`, result.errors);
        }
      }
    })();

    return () => {
      cancelled = true;
      installed.forEach((id) => manager.uninstall(id));
      manager.host.disposeAll();
      useExtensionPanelStore.getState().close();
    };
  }, [manager]);

  const value = React.useMemo(() => ({ manager, deps }), [manager, deps]);

  return (
    <ExtensionContext.Provider value={value}>
      {children}
    </ExtensionContext.Provider>
  );
}

/**
 * Instantiates a single {@link ExtensionManager} at app startup (wired to live host
 * dependencies), auto-installs the configured dev bundles, and exposes both via
 * context. A no-op pass-through when the feature flag is off, so the app is unchanged
 * unless `VITE_ENABLE_EXTENSIONS=true`.
 */
export function ExtensionManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!EXTENSIONS_ENABLED) {
    return <>{children}</>;
  }
  return (
    <ExtensionManagerProviderInner>{children}</ExtensionManagerProviderInner>
  );
}
