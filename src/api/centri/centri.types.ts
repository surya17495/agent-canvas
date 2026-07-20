/**
 * Wire types for the Centri panel daemon (`centrid`) API — SPEC §3.15.
 *
 * `centrid` is a loopback-only view + mutation surface over Centri's existing
 * stores (spine, engine adapter, pin manifest). It is a *separate* process
 * from the OpenHands agent-server; the frontend reaches it through the config
 * seam in {@link ./centri-config}, never through the agent-server client.
 *
 * These shapes mirror the daemon's Pydantic response models exactly. Only the
 * fields the Settings UI consumes are typed; unknown extra fields are ignored.
 */

export type CentriEngineStatus = "up" | "unavailable";

export interface CentriEngineState {
  base_url: string;
  reachable: boolean;
  status: CentriEngineStatus;
  version_pin: string;
}

/**
 * BOOLEANS ONLY. `centrid` never returns raw key material (§3.12); the UI
 * must never display or persist a key value. These flags say only whether a
 * key is present.
 */
export interface CentriKeyState {
  llm_key_present: boolean;
  engine_key_present: boolean;
}

export interface CentriPendingSession {
  session_id: string;
  [extra: string]: unknown;
}

export interface CentriSyncState {
  sessions_total: number;
  sessions_pending_pump: number;
  roles: string[];
  pending: CentriPendingSession[];
}

export interface CentriDeployComponent {
  name: string;
  fork_pinned_commit: string;
  [extra: string]: unknown;
}

export interface CentriDeployState {
  lock_valid: boolean;
  error: string | null;
  components: CentriDeployComponent[];
}

/** Response of `GET /api/settings`. */
export interface CentriSettings {
  user: string;
  engine: CentriEngineState;
  product_ready: boolean;
  key: CentriKeyState;
  sync: CentriSyncState;
  deploy: CentriDeployState;
}

export interface CentriHealth {
  status: string;
  service: string;
}

/** Per-session outcome from `POST /api/pump`. */
export type CentriPumpStatus = "pumped" | "no-op" | "failed";

export interface CentriPumpResult {
  session_id: string;
  status: CentriPumpStatus;
  document_id?: string | null;
  error?: string | null;
  [extra: string]: unknown;
}

export interface CentriPumpSummary {
  pumped: number;
  no_op: number;
  failed: number;
  ok: boolean;
}

export interface CentriPumpResponse {
  results: CentriPumpResult[];
  summary: CentriPumpSummary;
}

// -- memory (U3): authored frame stores browse/edit/forget — SPEC §3.14 ------
//
// These mirror the `centrid` Memory API models. The stores are the SAME
// spine-side authored files M3's renderer injects at turn zero (rules.md /
// identity.md / working_notes.md per role); editing one changes the next
// injected frame, forgetting one drops it from the next fetch (§3.14 matrix).

/** The authored store kinds, one per authored file (SPEC §3.14). */
export type CentriMemoryKind = "rules" | "identity" | "working_notes";

/** Presence + size metadata for one authored store (no content). */
export interface CentriMemoryStore {
  role: string;
  kind: CentriMemoryKind;
  filename: string;
  /** Frame section this store feeds ("Rules" | "Role Identity"). */
  section: string;
  present: boolean;
  bytes: number;
  chars: number;
  lines: number;
}

export interface CentriMemoryRole {
  role: string;
  stores: CentriMemoryStore[];
}

/**
 * An engine-derived frame section that is omitted (never mocked) until its
 * §9 route is proven. Surfaced so the UI shows *why* a section is absent.
 */
export interface CentriEngineSection {
  name: string;
  reason: string;
}

/** Response of `GET /api/memory/stores`. */
export interface CentriMemoryListResponse {
  frames_dir: string;
  roles: CentriMemoryRole[];
  engine_sections: CentriEngineSection[];
}

/** Response of `GET`/`PUT /api/memory/stores/{role}/{kind}`. */
export interface CentriMemoryStoreContent {
  store: CentriMemoryStore;
  content: string;
}

/** Response of `DELETE /api/memory/stores/{role}/{kind}`. */
export interface CentriMemoryForgetResponse {
  role: string;
  kind: CentriMemoryKind;
  forgotten: boolean;
}
