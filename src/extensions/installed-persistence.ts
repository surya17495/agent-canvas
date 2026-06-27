import type { Capability } from "./manifest";

/**
 * A user-installed bundle remembered across reloads. Only metadata and the granted
 * capabilities are stored — never executable code — so restoring on startup means
 * re-fetching and re-installing from `sourceUrl`, re-running validation.
 *
 * `sourceUrl` is the *resolved, pinned* bundle base URL, so restore is deterministic
 * and offline-of-the-registry (no version re-resolution on every load). `sourceRef`
 * (the `npm:`/`gh:`/`url` the user installed) and `version` are kept for display and a
 * future update check, and are optional for backward compatibility with older records.
 */
export interface PersistedInstall {
  id: string;
  sourceUrl: string;
  sourceRef?: string;
  version?: string;
  capabilities: Capability[];
}

const STORAGE_KEY = "agent-canvas:extensions:user-installs";

function isPersistedInstall(value: unknown): value is PersistedInstall {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.sourceUrl === "string" &&
    Array.isArray(v.capabilities)
  );
}

/** Read the persisted user-installed bundles; tolerant of absent/corrupt storage. */
export function loadPersistedInstalls(): PersistedInstall[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPersistedInstall);
  } catch {
    return [];
  }
}

export function savePersistedInstalls(installs: PersistedInstall[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(installs));
  } catch {
    // Best-effort: a full/unavailable storage shouldn't break installs in-session.
  }
}

export function addPersistedInstall(install: PersistedInstall): void {
  const next = loadPersistedInstalls().filter((i) => i.id !== install.id);
  next.push(install);
  savePersistedInstalls(next);
}

export function removePersistedInstall(id: string): void {
  savePersistedInstalls(loadPersistedInstalls().filter((i) => i.id !== id));
}
