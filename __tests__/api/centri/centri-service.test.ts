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
  hasCentriProxyAuth: () => false,
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

describe("CentriService memory stores", () => {
  it("lists stores via an unauthenticated GET", async () => {
    const payload = { frames_dir: "/frames", roles: [], engine_sections: [] };
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));

    await expect(CentriService.listMemoryStores()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:6789/api/memory/stores",
      undefined,
    );
  });

  it("reads one store, percent-encoding role and kind in the path", async () => {
    const payload = {
      store: { role: "a:b", kind: "rules" },
      content: "hi",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));

    await expect(
      CentriService.readMemoryStore("a:b", "rules"),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:6789/api/memory/stores/a%3Ab/rules",
      undefined,
    );
  });

  it("read maps a not-found to CentriNotFoundError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "bad kind" }, { ok: false, status: 422 }),
    );
    await expect(
      CentriService.readMemoryStore("writer", "rules"),
    ).rejects.toBeInstanceOf(CentriInvalidRequestError);
  });

  it("edits a store with a bearer token and JSON body", async () => {
    const payload = { store: { role: "writer", kind: "rules" }, content: "x" };
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));

    await CentriService.editMemoryStore("writer", "rules", "x");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:6789/api/memory/stores/writer/rules");
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toBe("Bearer panel-token");
    expect(init.body).toBe(JSON.stringify({ content: "x" }));
  });

  it("edit fails closed with no network call when no token is configured", async () => {
    getTokenMock.mockReturnValue(null);
    await expect(
      CentriService.editMemoryStore("writer", "rules", "x"),
    ).rejects.toBeInstanceOf(CentriUnauthorizedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("edit maps 422 to CentriInvalidRequestError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "too big" }, { ok: false, status: 422 }),
    );
    await expect(
      CentriService.editMemoryStore("writer", "rules", "x"),
    ).rejects.toBeInstanceOf(CentriInvalidRequestError);
  });

  it("forgets a store with a bearer token via DELETE", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ role: "writer", kind: "rules", forgotten: true }),
    );

    await CentriService.forgetMemoryStore("writer", "rules");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:6789/api/memory/stores/writer/rules");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer panel-token");
  });

  it("forget fails closed with no network call when no token is configured", async () => {
    getTokenMock.mockReturnValue(null);
    await expect(
      CentriService.forgetMemoryStore("writer", "rules"),
    ).rejects.toBeInstanceOf(CentriUnauthorizedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forget maps 404 (already gone) to CentriNotFoundError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "nothing to forget" }, { ok: false, status: 404 }),
    );
    await expect(
      CentriService.forgetMemoryStore("writer", "rules"),
    ).rejects.toBeInstanceOf(CentriNotFoundError);
  });
});
