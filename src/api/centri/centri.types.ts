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
