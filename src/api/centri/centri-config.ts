/**
 * Config seam for the Centri panel daemon (`centrid`).
 *
 * `centrid` runs as a separate loopback process (default `127.0.0.1:6789`,
 * see `centri/config.py` `CENTRI_PANEL_HOST` / `CENTRI_PANEL_PORT`). The
 * Settings UI needs two pieces of deployment-supplied config to talk to it:
 *
 *   1. Base URL — where `centrid` is listening.
 *   2. Panel token — the bearer token that authorizes *mutations*
 *      (`POST /api/pump`). Reads are unauthenticated (loopback surface).
 *
 * Both are resolved from two sources, in order, mirroring the session-key
 * seam in `agent-server-config.ts`:
 *
 *   1. `VITE_*` env var — baked into the bundle at build/dev time.
 *   2. `window.__CENTRI_*__` global — injected into `index.html` at serve
 *      time by the deployment (the published-binary path).
 *
 * The panel token is a secret: it is held only in memory here and is NEVER
 * persisted to localStorage nor rendered in the UI (§3.12). The UI only ever
 * reflects {@link hasCentriPanelToken}.
 */

export const DEFAULT_CENTRID_BASE_URL = "http://127.0.0.1:6789";

const CENTRID_BASE_URL_WINDOW_KEY = "__CENTRI_CENTRID_BASE_URL__";
const PANEL_TOKEN_WINDOW_KEY = "__CENTRI_PANEL_TOKEN__";

function trimToNull(value?: string | null): string | null {
  return value?.trim() || null;
}

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function readWindowString(key: string): string | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as Record<string, unknown>)[key];
  return typeof injected === "string" ? trimToNull(injected) : null;
}

/**
 * Base URL of the `centrid` daemon. Falls back to the loopback default so a
 * developer running `centri up` with default flags needs no extra config.
 */
export function getCentridBaseUrl(): string {
  const envUrl = normalizeBaseUrl(import.meta.env.VITE_CENTRID_BASE_URL);
  if (envUrl) return envUrl;

  const injected = normalizeBaseUrl(
    readWindowString(CENTRID_BASE_URL_WINDOW_KEY),
  );
  if (injected) return injected;

  return DEFAULT_CENTRID_BASE_URL;
}

/**
 * Bearer token for authenticated `centrid` mutations, or null if none is
 * configured. Never persisted, never displayed.
 */
export function getCentriPanelToken(): string | null {
  const envToken = trimToNull(import.meta.env.VITE_CENTRI_PANEL_TOKEN);
  if (envToken) return envToken;

  return readWindowString(PANEL_TOKEN_WINDOW_KEY);
}

/**
 * Whether a panel token is configured. Drives whether the "Sync now"
 * mutation is offered: `centrid` is fail-closed and refuses every mutation
 * with 401 when no token is set, so the UI disables the action up front and
 * explains why instead of surfacing a guaranteed 401.
 */
export function hasCentriPanelToken(): boolean {
  return getCentriPanelToken() !== null;
}
