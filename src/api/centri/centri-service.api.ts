/**
 * Client for the Centri panel daemon (`centrid`) — SPEC §3.15.
 *
 * Uses `fetch` directly (not the agent-server SDK client): `centrid` is a
 * separate loopback service with its own base URL and bearer-token auth,
 * resolved via {@link ./centri-config}. Errors are mapped to typed classes so
 * the UI can render distinct states (unauthorized / engine-unavailable /
 * not-found / invalid / unreachable) rather than a generic failure.
 */
import { getCentridBaseUrl, getCentriPanelToken } from "./centri-config";
import type {
  CentriHealth,
  CentriPumpResponse,
  CentriSettings,
} from "./centri.types";

/** Base class for every `centrid` error, carrying the HTTP status when known. */
export class CentriError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "CentriError";
    this.status = status;
  }
}

/** The request never reached `centrid` (daemon down, wrong URL, CORS). */
export class CentriUnreachableError extends CentriError {
  constructor(message: string) {
    super(message, null);
    this.name = "CentriUnreachableError";
  }
}

/** 401 — missing/invalid panel token, or no token configured on the daemon. */
export class CentriUnauthorizedError extends CentriError {
  constructor(message: string) {
    super(message, 401);
    this.name = "CentriUnauthorizedError";
  }
}

/** 404 — unknown session id passed to pump. */
export class CentriNotFoundError extends CentriError {
  constructor(message: string) {
    super(message, 404);
    this.name = "CentriNotFoundError";
  }
}

/** 422 — malformed request body. */
export class CentriInvalidRequestError extends CentriError {
  constructor(message: string) {
    super(message, 422);
    this.name = "CentriInvalidRequestError";
  }
}

/** 502 — engine unreachable while pumping a single session (§3.9). */
export class CentriEngineUnavailableError extends CentriError {
  constructor(message: string) {
    super(message, 502);
    this.name = "CentriEngineUnavailableError";
  }
}

const CONTENT_TYPE_HEADER = "Content-Type";
const JSON_CONTENT_TYPE = "application/json";
const AUTHORIZATION_HEADER = "Authorization";

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body?.detail === "string") return body.detail;
    if (body?.detail != null) return JSON.stringify(body.detail);
  } catch {
    // Non-JSON error body — fall through to the status text.
  }
  return response.statusText || `HTTP ${response.status}`;
}

async function throwForStatus(response: Response): Promise<never> {
  const detail = await readErrorDetail(response);
  switch (response.status) {
    case 401:
      throw new CentriUnauthorizedError(detail);
    case 404:
      throw new CentriNotFoundError(detail);
    case 422:
      throw new CentriInvalidRequestError(detail);
    case 502:
      throw new CentriEngineUnavailableError(detail);
    default:
      throw new CentriError(detail, response.status);
  }
}

async function centriFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getCentridBaseUrl()}${path}`;
  try {
    return await fetch(url, init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new CentriUnreachableError(detail);
  }
}

const CentriService = {
  /** `GET /api/health` — daemon liveness (distinct from engine reachability). */
  async getHealth(): Promise<CentriHealth> {
    const response = await centriFetch("/api/health");
    if (!response.ok) await throwForStatus(response);
    return (await response.json()) as CentriHealth;
  },

  /**
   * `GET /api/settings` — read-only panel state. Unauthenticated (loopback
   * read surface). Engine-unreachable is a *state* here, not an error: the
   * daemon still returns 200 with `product_ready:false`.
   */
  async getSettings(): Promise<CentriSettings> {
    const response = await centriFetch("/api/settings");
    if (!response.ok) await throwForStatus(response);
    return (await response.json()) as CentriSettings;
  },

  /**
   * `POST /api/pump` — "sync now" mutation. Requires the panel token; when
   * none is configured this throws {@link CentriUnauthorizedError} up front
   * (fail-closed) without hitting the network. Pass a `sessionId` to pump a
   * single session, or omit it to pump all pending sessions.
   */
  async pump(sessionId?: string): Promise<CentriPumpResponse> {
    const token = getCentriPanelToken();
    if (!token) {
      throw new CentriUnauthorizedError("No panel token configured.");
    }

    const response = await centriFetch("/api/pump", {
      method: "POST",
      headers: {
        [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE,
        [AUTHORIZATION_HEADER]: `Bearer ${token}`,
      },
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
    });
    if (!response.ok) await throwForStatus(response);
    return (await response.json()) as CentriPumpResponse;
  },
};

export default CentriService;
