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
 */
export const DEV_EXTENSION_BUNDLE_URLS = ["/__extensions/hello-sidebar"];
