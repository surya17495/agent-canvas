import React from "react";
import { ExtensionManager } from "#/extensions/extension-manager";
import { createAppHostDeps } from "#/extensions/host/create-app-host-deps";
import { createHttpBundleSource } from "#/extensions/dev-bundle-source";
import { useExtensionPanelStore } from "#/extensions/panel-store";
import {
  useInstalledExtensionsStore,
  type InstalledExtension,
  type InstalledExtensionOrigin,
  type ManifestPreview,
} from "#/extensions/installed-store";
import {
  addPersistedInstall,
  loadPersistedInstalls,
  removePersistedInstall,
} from "#/extensions/installed-persistence";
import { parseManifest, type ExtensionManifest } from "#/extensions/manifest";
import {
  DEV_EXTENSION_BUNDLE_URLS,
  EXTENSIONS_ENABLED,
} from "#/extensions/feature-flag";
import type { HostApiDeps } from "#/extensions/host/host-api";

interface ExtensionContextValue {
  manager: ExtensionManager;
  deps: HostApiDeps;
  /** Fetch + validate a bundle manifest to show its requested permissions (consent). */
  previewManifest: (url: string) => Promise<ManifestPreview>;
  /** Install a bundle from a URL and record it as a persisted user install. */
  installFromUrl: (url: string) => Promise<InstalledExtension>;
  /** Remove an extension and forget any persisted user install. */
  uninstall: (id: string) => void;
}

const ExtensionContext = React.createContext<ExtensionContextValue | null>(
  null,
);

/** Access the extension manager/deps; null when the feature is disabled. */
export function useExtensionContext(): ExtensionContextValue | null {
  return React.useContext(ExtensionContext);
}

function toInstalledExtension(
  manifest: ExtensionManifest,
  sourceUrl: string,
  origin: InstalledExtensionOrigin,
): InstalledExtension {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    publisher: manifest.publisher,
    capabilities: manifest.capabilities ?? [],
    sourceUrl,
    origin,
  };
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

  const previewManifest = React.useCallback(
    async (url: string): Promise<ManifestPreview> => {
      const raw = await createHttpBundleSource(url).readManifest();
      const parsed = parseManifest(raw);
      if (!parsed.ok) {
        throw new Error(parsed.errors.join("; "));
      }
      const { manifest } = parsed;
      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        publisher: manifest.publisher,
        capabilities: manifest.capabilities ?? [],
      };
    },
    [],
  );

  const installFromUrl = React.useCallback(
    async (url: string): Promise<InstalledExtension> => {
      const result = await manager.install(createHttpBundleSource(url));
      if (!result.ok) {
        throw new Error(result.errors.join("; "));
      }
      const extension = toInstalledExtension(result.manifest, url, "user");
      useInstalledExtensionsStore.getState().add(extension);
      addPersistedInstall({
        id: extension.id,
        sourceUrl: extension.sourceUrl,
        capabilities: extension.capabilities,
      });
      return extension;
    },
    [manager],
  );

  const uninstall = React.useCallback(
    (id: string): void => {
      manager.uninstall(id);
      useInstalledExtensionsStore.getState().remove(id);
      removePersistedInstall(id);
      const panel = useExtensionPanelStore.getState();
      if (panel.activeExtensionId === id) panel.close();
    },
    [manager],
  );

  React.useEffect(() => {
    let cancelled = false;
    const store = useInstalledExtensionsStore.getState();

    const installFrom = async (
      url: string,
      origin: InstalledExtensionOrigin,
    ) => {
      const result = await manager.install(createHttpBundleSource(url));
      if (cancelled) return;
      if (result.ok) {
        store.add(toInstalledExtension(result.manifest, url, origin));
      } else {
        console.warn(`[extensions] failed to install ${url}:`, result.errors);
      }
    };

    (async () => {
      for (const url of DEV_EXTENSION_BUNDLE_URLS) {
        await installFrom(url, "dev");
      }
      for (const persisted of loadPersistedInstalls()) {
        await installFrom(persisted.sourceUrl, "user");
      }
    })();

    return () => {
      cancelled = true;
      useInstalledExtensionsStore
        .getState()
        .installed.forEach((e) => manager.uninstall(e.id));
      useInstalledExtensionsStore.getState().clear();
      manager.host.disposeAll();
      useExtensionPanelStore.getState().close();
    };
  }, [manager]);

  const value = React.useMemo(
    () => ({ manager, deps, previewManifest, installFromUrl, uninstall }),
    [manager, deps, previewManifest, installFromUrl, uninstall],
  );

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
