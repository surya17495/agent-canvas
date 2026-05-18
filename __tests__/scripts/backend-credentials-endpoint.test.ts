// @vitest-environment node
import { createServer } from "node:http";
import { mkdtemp, readFile, stat, writeFile, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSetupServerRequest } from "../../scripts/setup_server/handle-setup-server-request.mjs";

const SESSION_KEY = "session-secret";

let previousPersistenceDir: string | undefined;
let previousSessionKey: string | undefined;
let baseUrl = "";
let closeServer: (() => Promise<void>) | null = null;

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  return { "X-Session-API-Key": SESSION_KEY, ...extra };
}

function credentialDir() {
  return path.join(
    process.env.OPENHANDS_PERSISTENCE_DIR!,
    "agent-canvas",
    "backends",
  );
}

function encodedCredentialFile(id: string) {
  return path.join(
    credentialDir(),
    `${Buffer.from(id, "utf8").toString("base64url")}.json`,
  );
}

async function startServer() {
  const server = createServer(async (req, res) => {
    if (await handleSetupServerRequest(req, res)) return;
    res.writeHead(404);
    res.end("Not Found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = () => new Promise((resolve) => server.close(() => resolve()));
}

beforeEach(async () => {
  previousPersistenceDir = process.env.OPENHANDS_PERSISTENCE_DIR;
  previousSessionKey = process.env.SESSION_API_KEY;
  process.env.OPENHANDS_PERSISTENCE_DIR = await mkdtemp(
    path.join(os.tmpdir(), "agent-canvas-credentials-"),
  );
  process.env.SESSION_API_KEY = SESSION_KEY;
  await startServer();
});

afterEach(async () => {
  if (closeServer) await closeServer();
  closeServer = null;
  if (previousPersistenceDir === undefined)
    delete process.env.OPENHANDS_PERSISTENCE_DIR;
  else process.env.OPENHANDS_PERSISTENCE_DIR = previousPersistenceDir;
  if (previousSessionKey === undefined) delete process.env.SESSION_API_KEY;
  else process.env.SESSION_API_KEY = previousSessionKey;
});

describe("/setup/backends", () => {
  it("persists, lists, and deletes Cloud backend credentials", async () => {
    const credential = {
      id: "cloud-1",
      name: "OpenHands Cloud",
      host: "https://app.all-hands.dev/",
      kind: "cloud",
      api_key: "cloud-api-key",
    };

    const saveResponse = await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(credential),
    });
    await expect(saveResponse.json()).resolves.toEqual({
      backend: { ...credential, host: "https://app.all-hands.dev" },
    });

    const listResponse = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    await expect(listResponse.json()).resolves.toEqual({
      backends: [{ ...credential, host: "https://app.all-hands.dev" }],
    });

    const deleteResponse = await fetch(`${baseUrl}/setup/backends/cloud-1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(deleteResponse.ok).toBe(true);

    const emptyResponse = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    await expect(emptyResponse.json()).resolves.toEqual({ backends: [] });
  });

  it("writes credential files with private permissions", async () => {
    await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "cloud-api-key",
      }),
    });

    const dirStat = await stat(credentialDir());
    expect(dirStat.mode & 0o777).toBe(0o700);

    const fileStat = await stat(encodedCredentialFile("cloud-1"));
    expect(fileStat.mode & 0o777).toBe(0o600);
    await expect(
      readFile(encodedCredentialFile("cloud-1"), "utf8"),
    ).resolves.toContain("cloud-api-key");
  });

  it("requires the configured session API key and fails closed", async () => {
    const unauthorized = await fetch(`${baseUrl}/setup/backends`);
    expect(unauthorized.status).toBe(401);

    delete process.env.SESSION_API_KEY;
    const noConfiguredKey = await fetch(`${baseUrl}/setup/backends`);
    expect(noConfiguredKey.status).toBe(401);

    process.env.SESSION_API_KEY = SESSION_KEY;
    const authorized = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    expect(authorized.status).toBe(200);
  });

  it("rejects non-Cloud or malformed credential payloads", async () => {
    const response = await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "local-1",
        name: "Local",
        host: "http://localhost:8000",
        kind: "local",
        api_key: "local-key",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("does not remove lock files owned by a running process", async () => {
    await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "initial",
        name: "Initial",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "initial-key",
      }),
    });

    const lockFile = `${encodedCredentialFile("__store__")}.lock`;
    await writeFile(lockFile, JSON.stringify({ pid: process.pid }), {
      mode: 0o600,
    });
    const staleTime = new Date(Date.now() - 60_000);
    await utimes(lockFile, staleTime, staleTime);

    const response = await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "blocked",
        name: "Blocked",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "blocked-key",
      }),
    });

    expect(response.status).toBe(500);
    await expect(readFile(lockFile, "utf8")).resolves.toContain(
      String(process.pid),
    );
  });

  it("deduplicates concurrent equivalent credential writes", async () => {
    const payload = {
      name: "OpenHands Cloud",
      host: "https://app.all-hands.dev",
      kind: "cloud",
      api_key: "shared-key",
    };

    const responses = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        fetch(`${baseUrl}/setup/backends`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ ...payload, id: `cloud-${index}` }),
        }),
      ),
    );

    expect(responses.every((response) => response.ok)).toBe(true);
    const listResponse = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    const { backends } = await listResponse.json();
    expect(backends).toHaveLength(1);
    expect(backends[0]).toEqual(
      expect.objectContaining({ api_key: "shared-key" }),
    );
  });
});
