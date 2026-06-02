import {
  readStoredActiveBackend,
  readStoredBackends,
  writeStoredActiveBackend,
  writeStoredBackends,
} from "./storage";
import type { Backend, BackendSelection, ResolvedActiveBackend } from "./types";

type Listener = () => void;

interface Snapshot {
  backends: Backend[];
  selection: BackendSelection | null;
  active: ResolvedActiveBackend;
}

export const NO_BACKEND_ID = "no-backend";

export const NO_BACKEND: Backend = {
  id: NO_BACKEND_ID,
  name: "No Backend Available",
  host: "",
  apiKey: "",
  kind: "local",
};

export function isNoBackend(backend: Backend): boolean {
  return backend.id === NO_BACKEND_ID;
}

function pickFallbackBackend(backends: Backend[]): Backend {
  return backends[0] ?? NO_BACKEND;
}

function computeSnapshot(
  backends: Backend[],
  selection: BackendSelection | null,
): Snapshot {
  let activeBackend: Backend | null = null;
  let activeOrgId: string | null = null;

  if (selection) {
    const found = backends.find((b) => b.id === selection.backendId);
    if (found) {
      activeBackend = found;
      activeOrgId = selection.orgId ?? null;
    }
    // If the selection points at a removed backend, fall through to
    // the unselected case below; we also drop the orgId since it only
    // makes sense in the context of a specific cloud backend.
  }

  // @spec BM-003 — Fallback on active backend removal
  if (!activeBackend) {
    activeBackend = pickFallbackBackend(backends);
    activeOrgId = null;
  }

  return {
    backends,
    selection,
    active: { backend: activeBackend, orgId: activeOrgId },
  };
}

let snapshot: Snapshot = computeSnapshot(
  readStoredBackends(),
  readStoredActiveBackend(),
);

const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getActiveBackend(): ResolvedActiveBackend {
  return snapshot.active;
}

/**
 * Pick the backend to use for *local agent-server protocol* calls.
 *
 * Most of the GUI's services (settings reads/writes, conversation CRUD,
 * skills/MCP/secrets, etc.) speak the local agent-server's protocol —
 * they would fail against a cloud host. When the user has chosen a
 * cloud backend as active, those calls fall back to the first registered
 * local backend. If no local backend is registered, callers should skip
 * local-only work instead of synthesizing one.
 */
export function getEffectiveLocalBackend(): Backend | null {
  const active = snapshot.active.backend;
  if (active.kind === "local" && !isNoBackend(active)) return active;
  return snapshot.backends.find((backend) => backend.kind === "local") ?? null;
}

export function getRegisteredBackends(): Backend[] {
  return snapshot.backends;
}

export function getActiveSelection(): BackendSelection | null {
  return snapshot.selection;
}

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function setActiveSelection(selection: BackendSelection | null): void {
  writeStoredActiveBackend(selection);
  snapshot = computeSnapshot(snapshot.backends, selection);
  notify();
}

export function setRegisteredBackends(backends: Backend[]): void {
  writeStoredBackends(backends);

  let nextSelection = snapshot.selection;
  if (
    nextSelection &&
    !backends.some((b) => b.id === nextSelection!.backendId)
  ) {
    nextSelection = null;
    writeStoredActiveBackend(null);
  }

  snapshot = computeSnapshot(backends, nextSelection);
  notify();
}

export function subscribeActiveBackend(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: re-read storage and clear listeners. */

export function __resetActiveStoreForTests(): void {
  snapshot = computeSnapshot(readStoredBackends(), readStoredActiveBackend());
  listeners.clear();
}
