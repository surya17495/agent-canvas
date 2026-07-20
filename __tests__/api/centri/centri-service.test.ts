import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CentriService, {
  CentriEngineUnavailableError,
  CentriInvalidRequestError,
  CentriNotFoundError,
  CentriUnauthorizedError,
  CentriUnreachableError,
} from "#/api/centri/centri-service.api";

const getTokenMock = vi.hoisted(() => vi.fn<() => string | null>());
vi.mock("#/api/centri/centri-config", () => ({
  getCentridBaseUrl: () => "http://127.0.0.1:6789",
  getCentriPanelToken: getTokenMock,
}));

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: "",
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getTokenMock.mockReset();
  getTokenMock.mockReturnValue("panel-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CentriService.getSettings", () => {
  it("returns parsed settings on 200", async () => {
    const payload = { user: "alice", product_ready: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));

    await expect(CentriService.getSettings()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:6789/api/settings",
      undefined,
    );
  });

  it("throws CentriUnreachableError when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(CentriService.getSettings()).rejects.toBeInstanceOf(
      CentriUnreachableError,
    );
  });

  it("maps 401 to CentriUnauthorizedError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "no token" }, { ok: false, status: 401 }),
    );
    await expect(CentriService.getSettings()).rejects.toBeInstanceOf(
      CentriUnauthorizedError,
    );
  });
});

describe("CentriService.pump", () => {
  it("throws CentriUnauthorizedError up-front without a network call when no token", async () => {
    getTokenMock.mockReturnValue(null);
    await expect(CentriService.pump()).rejects.toBeInstanceOf(
      CentriUnauthorizedError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a bearer token and empty body when pumping all sessions", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [],
        summary: { pumped: 0, no_op: 0, failed: 0, ok: true },
      }),
    );

    await CentriService.pump();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer panel-token");
    expect(init.body).toBe(JSON.stringify({}));
  });

  it("includes session_id when pumping a single session", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [],
        summary: { pumped: 1, no_op: 0, failed: 0, ok: true },
      }),
    );

    await CentriService.pump("sess-1");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ session_id: "sess-1" }));
  });

  it("maps 404 to CentriNotFoundError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "unknown" }, { ok: false, status: 404 }),
    );
    await expect(CentriService.pump("nope")).rejects.toBeInstanceOf(
      CentriNotFoundError,
    );
  });

  it("maps 422 to CentriInvalidRequestError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "bad" }, { ok: false, status: 422 }),
    );
    await expect(CentriService.pump()).rejects.toBeInstanceOf(
      CentriInvalidRequestError,
    );
  });

  it("maps 502 to CentriEngineUnavailableError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "engine down" }, { ok: false, status: 502 }),
    );
    await expect(CentriService.pump("sess-1")).rejects.toBeInstanceOf(
      CentriEngineUnavailableError,
    );
  });
});
