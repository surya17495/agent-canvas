import React from "react";
import { ExtensionManager } from "#/extensions/extension-manager";
import { createAppHostDeps } from "#/extensions/host/create-app-host-deps";
import { createHttpBundleSource } from "#/extensions/dev-bundle-source";
import { useExtensionPanelStore } from "#/extensions/panel-store";
import {
  useInstalledExtensionsStore,
  type ExtensionUpdate,
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
import { assertHostCompatible } from "#/extensions/engines";
import {
  resolveSource,
  toBundleSource,
  type ArtifactDescriptor,
} from "#/extensions/sources/resolve";
import {
  githubUrlPath,
  githubUrlToSource,
  rawGithubUrl,
} from "#/extensions/marketplace/source";
import {
  fetchMarketplace,
  type MarketplaceResult,
} from "#/extensions/marketplace/client";
import {
  DEV_EXTENSION_BUNDLE_URLS,
  EXTENSIONS_ENABLED,
} from "#/extensions/feature-flag";
import type { HostApiDeps } from "#/extensions/host/host-api";

interface ExtensionContextValue {
  manager: ExtensionManager;
  deps: HostApiDeps;
  /** Fetch + validate a bundle manifest to show its requested permissions (consent). */
  previewManifest: (source: string) => Promise<ManifestPreview>;
  /** Install a bundle from a source ref and record it as a persisted user install. */
  installFromUrl: (source: string) => Promise<InstalledExtension>;
  /** Load a plugin marketplace (git repo or URL) and list its UI extensions. */
  fetchMarketplace: (source: string) => Promise<MarketplaceResult>;
  /**
   * Re-resolve an installed extension's source ref and report a newer pinned artifact
   * (within its recorded range), or null if it is current / has no update channel.
   */
  checkForUpdate: (id: string) => Promise<ExtensionUpdate | null>;
  /**
   * Update an installed extension to the latest within its range. Throws (non-destructively)
   * when the new version is host-incompatible or requests capabilities beyond those already
   * granted — the caller should then re-run the consent flow with the source ref.
   */
  updateExtension: (id: string) => Promise<InstalledExtension>;
  /** Remove an extension and forget any persisted user install. */
  uninstall: (id: string) => void;
}

/**
 * Normalize a pasted `github.com` folder/tree URL into a raw bundle base URL so it
 * parses as a `url` source. `npm:`/`gh:`/raw `https://` inputs pass straight through to
 * the source-ref resolver.
 */
function normalizeLegacyInput(input: string): string {
  const trimmed = input.trim();
  const github = githubUrlToSource(trimmed);
  if (github) return rawGithubUrl(github, githubUrlPath(trimmed) ?? "");
  return trimmed;
}

/** Parse + resolve any supported source string to a pinned artifact descriptor. */
function resolveDescriptor(input: string): Promise<ArtifactDescriptor> {
  return resolveSource(normalizeLegacyInput(input));
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
  sourceRef?: string,
): InstalledExtension {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    publisher: manifest.publisher,
    capabilities: manifest.capabilities ?? [],
    sourceUrl,
    sourceRef,
    origin,
  };
}

// Exported for tests: renders the live provider without the feature-flag gate.
export function ExtensionManagerProviderInner({
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
    async (source: string): Promise<ManifestPreview> => {
      const descriptor = await resolveDescriptor(source);
      const raw = await toBundleSource(descriptor).readManifest();
      const parsed = parseManifest(raw);
      if (!parsed.ok) {
        throw new Error(parsed.errors.join("; "));
      }
      const { manifest } = parsed;
      // Surface incompatibility before the user grants consent.
      assertHostCompatible(manifest.engines.agentCanvas);
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
    async (source: string): Promise<InstalledExtension> => {
      const descriptor = await resolveDescriptor(source);
      const result = await manager.install(toBundleSource(descriptor));
      if (!result.ok) {
        throw new Error(result.errors.join("; "));
      }
      // Roll back the install if the resolved version is host-incompatible.
      try {
        assertHostCompatible(result.manifest.engines.agentCanvas);
      } catch (error) {
        manager.uninstall(result.manifest.id);
        throw error;
      }
      const extension = toInstalledExtension(
        result.manifest,
        descriptor.baseUrl,
        "user",
        descriptor.sourceRef,
      );
      useInstalledExtensionsStore.getState().add(extension);
      addPersistedInstall({
        id: extension.id,
        sourceUrl: extension.sourceUrl,
        sourceRef: descriptor.sourceRef,
        version: descriptor.version ?? extension.version,
        capabilities: extension.capabilities,
      });
      return extension;
    },
    [manager],
  );

  const checkForUpdate = React.useCallback(
    async (id: string): Promise<ExtensionUpdate | null> => {
      const installed = useInstalledExtensionsStore
        .getState()
        .installed.find((e) => e.id === id);
      // No update channel for dev bundles or installs without a recorded ref.
      if (!installed?.sourceRef) return null;
      const descriptor = await resolveDescriptor(installed.sourceRef);
      // The pinned base URL encodes the version, so a changed URL means a newer artifact.
      // `url` sources resolve to the same base, so they naturally report "no update".
      if (descriptor.baseUrl === installed.sourceUrl) return null;
      return {
        id,
        currentVersion: installed.version,
        latestVersion: descriptor.version ?? installed.version,
        sourceRef: installed.sourceRef,
      };
    },
    [],
  );

  const updateExtension = React.useCallback(
    async (id: string): Promise<InstalledExtension> => {
      const installed = useInstalledExtensionsStore
        .getState()
        .installed.find((e) => e.id === id);
      if (!installed?.sourceRef) {
        throw new Error(`extension "${id}" has no update channel`);
      }
      const descriptor = await resolveDescriptor(installed.sourceRef);

      // Validate the candidate *before* tearing down the running version so a rejected
      // update is non-destructive.
      const raw = await toBundleSource(descriptor).readManifest();
      const parsed = parseManifest(raw);
      if (!parsed.ok) throw new Error(parsed.errors.join("; "));
      const next = parsed.manifest;
      assertHostCompatible(next.engines.agentCanvas);
      const grantsNewCapability = (next.capabilities ?? []).some(
        (cap) => !installed.capabilities.includes(cap),
      );
      if (grantsNewCapability) {
        throw new Error(
          `update to ${next.name} requests new permissions; reinstall to grant them`,
        );
      }

      // Swap: the contribution registry and host are keyed by id, so installing the new
      // bundle replaces the old contributions; uninstall first to terminate the old worker.
      manager.uninstall(id);
      const result = await manager.install(toBundleSource(descriptor));
      if (!result.ok) throw new Error(result.errors.join("; "));

      const extension = toInstalledExtension(
        result.manifest,
        descriptor.baseUrl,
        "user",
        descriptor.sourceRef,
      );
      useInstalledExtensionsStore.getState().add(extension);
      addPersistedInstall({
        id: extension.id,
        sourceUrl: extension.sourceUrl,
        sourceRef: descriptor.sourceRef,
        version: descriptor.version ?? extension.version,
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
      sourceRef?: string,
    ) => {
      // Restore re-installs from the *pinned* base URL recorded at install time, so it
      // is deterministic and needs no version re-resolution.
      const result = await manager.install(createHttpBundleSource(url));
      if (cancelled) return;
      if (!result.ok) {
        console.warn(`[extensions] failed to install ${url}:`, result.errors);
        return;
      }
      try {
        assertHostCompatible(result.manifest.engines.agentCanvas);
      } catch (error) {
        manager.uninstall(result.manifest.id);
        console.warn(`[extensions] skipped ${url}:`, error);
        return;
      }
      store.add(toInstalledExtension(result.manifest, url, origin, sourceRef));
    };

    (async () => {
      for (const url of DEV_EXTENSION_BUNDLE_URLS) {
        await installFrom(url, "dev");
      }
      for (const persisted of loadPersistedInstalls()) {
        await installFrom(persisted.sourceUrl, "user", persisted.sourceRef);
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

  const loadMarketplace = React.useCallback(
    (source: string) => fetchMarketplace(source),
    [],
  );

  const value = React.useMemo(
    () => ({
      manager,
      deps,
      previewManifest,
      installFromUrl,
      fetchMarketplace: loadMarketplace,
      checkForUpdate,
      updateExtension,
      uninstall,
    }),
    [
      manager,
      deps,
      previewManifest,
      installFromUrl,
      loadMarketplace,
      checkForUpdate,
      updateExtension,
      uninstall,
    ],
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
