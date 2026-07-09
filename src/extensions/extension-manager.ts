import {
  ExtensionHost,
  type ExtensionHostHooks,
  type WorkerLike,
} from "./host/extension-host";
import type { HostApiDeps } from "./host/host-api";
import {
  loadExtension,
  unloadExtension,
  type BundleSource,
  type LoadExtensionOptions,
  type LoadResult,
} from "./loader";

/**
 * Default factory for a production extension worker: a module Worker booted from our
 * `worker-bootstrap`, which then dynamically imports the extension's `main` module.
 */
function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL("./sdk/worker-bootstrap.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}

/**
 * Top-level coordinator that ties the declarative {@link loadExtension} pipeline to the
 * imperative {@link ExtensionHost}. This is the single entry point the app (and the
 * future management UI) uses to install/uninstall extensions.
 *
 * The worker factory is injectable so tests — and webview-only deployments — can swap
 * the real `Worker` for a fake or a no-op.
 */
export class ExtensionManager {
  readonly host: ExtensionHost;

  constructor(
    deps: HostApiDeps,
    private readonly createWorker: () => WorkerLike = defaultWorkerFactory,
    hooks: ExtensionHostHooks = {},
  ) {
    this.host = new ExtensionHost(deps, hooks);
  }

  /**
   * Load a bundle: register its declarative contributions and, if it ships a worker
   * entry, register how to activate it. Returns the loader result.
   *
   * @param source - The bundle source to load from
   * @param options - Optional settings including extensionSource for asset relay
   */
  async install(
    source: BundleSource,
    options: LoadExtensionOptions = {},
  ): Promise<LoadResult> {
    const result = await loadExtension(source, this.host, options);
    if (!result.ok) {
      return result;
    }

    const { manifest } = result;
    if (manifest.main) {
      const moduleUrl = await source.assetUrl(manifest.main);
      if (moduleUrl) {
        this.host.register(manifest.id, {
          capabilities: manifest.capabilities ?? [],
          moduleUrl,
          createWorker: this.createWorker,
        });
      }
    }
    return result;
  }

  /** Remove an extension's UI contributions and terminate its worker. */
  uninstall(extensionId: string): void {
    this.host.unregister(extensionId);
    unloadExtension(extensionId);
  }
}
