/**
 * Gate for the (experimental) UI extension system. Off by default so the feature ships
 * dark; enable locally with `VITE_ENABLE_EXTENSIONS=true` in the dev environment.
 */
export const EXTENSIONS_ENABLED =
  import.meta.env.VITE_ENABLE_EXTENSIONS === "true";

/**
 * Dev bundles to auto-install when the feature is enabled. Each entry is a base URL
 * served by the dev middleware (see `vite.config.ts`) that exposes the bundle's
 * `extension.json` and assets.
 *
 * Example extensions are now hosted externally at:
 * https://github.com/jpshackelford/agent-canvas-experimental-extensions
 *
 * To test dev extensions locally, add paths to `examples/extensions/<name>` here
 * and the Vite middleware will serve them at `/__extensions/<name>`.
 *
 * For an interactive local-dev loop, prefer adding a **local directory** from the
 * "Add extension" box (`~/path`, `/abs`, or `file:///abs`): the dev middleware registers
 * and serves it at `/__ext-local/<id>` with hot Reload and no restart. See
 * `docs/extensions/AUTHOR_GUIDE.md` ("Local Development") and
 * `src/extensions/sources/local-path.ts`.
 */
export const DEV_EXTENSION_BUNDLE_URLS: string[] = [];
