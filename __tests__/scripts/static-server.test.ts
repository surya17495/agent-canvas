import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { connect as netConnect } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";

import { parseArgs, startStaticServer } from "../../scripts/static-server.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const staticServerScript = path.join(repoRoot, "scripts", "static-server.mjs");

describe("static-server.mjs", () => {
  const servers: Server[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function startServer(
    dir: string,
    overrides: Partial<Parameters<typeof startStaticServer>[0]> = {},
  ) {
    const server = await startStaticServer({
      port: 0,
      host: "127.0.0.1",
      dir,
      routes: {},
      ...overrides,
    });
    servers.push(server);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Static server did not bind to a TCP port");
    }

    return `http://127.0.0.1:${address.port}`;
  }

  describe("parseArgs", () => {
    it("defaults sessionApiKey to null", () => {
      const config = parseArgs([]);
      expect(config.sessionApiKey).toBeNull();
    });

    it("parses --session-api-key", () => {
      const config = parseArgs(["--session-api-key", "my-test-key"]);
      expect(config.sessionApiKey).toBe("my-test-key");
    });

    it("treats empty string as null for session key", () => {
      const config = parseArgs(["--session-api-key", ""]);
      expect(config.sessionApiKey).toBeNull();
    });

    it("defaults runtimeServicesInfo to null", () => {
      const config = parseArgs([]);
      expect(config.runtimeServicesInfo).toBeNull();
    });

    it("defaults lockToCloud to null", () => {
      const config = parseArgs([]);
      expect(config.lockToCloud).toBeNull();
    });

    it("parses --lock-to-cloud", () => {
      const config = parseArgs([
        "--lock-to-cloud",
        "https://cloud.example.com",
      ]);
      expect(config.lockToCloud).toBe("https://cloud.example.com");
    });

    it("treats empty string as null for lockToCloud", () => {
      const config = parseArgs(["--lock-to-cloud", ""]);
      expect(config.lockToCloud).toBeNull();
    });

    it("defaults basePath to root", () => {
      const config = parseArgs([]);
      expect(config.basePath).toBe("/");
    });

    it("parses and normalizes --base-path", () => {
      const config = parseArgs(["--base-path", "canvas/"]);
      expect(config.basePath).toBe("/canvas");
    });

    it("treats empty string as root for basePath", () => {
      const config = parseArgs(["--base-path", ""]);
      expect(config.basePath).toBe("/");
    });

    it("parses --runtime-services-info", () => {
      const json = '{"mode":"docker"}';
      const config = parseArgs(["--runtime-services-info", json]);
      expect(config.runtimeServicesInfo).toBe(json);
    });

    it("treats empty string as null for runtime services info", () => {
      const config = parseArgs(["--runtime-services-info", ""]);
      expect(config.runtimeServicesInfo).toBeNull();
    });

    it("defaults centridBaseUrl to null", () => {
      const config = parseArgs([]);
      expect(config.centridBaseUrl).toBeNull();
    });

    it("parses --centrid-base-url", () => {
      const config = parseArgs(["--centrid-base-url", "/centri"]);
      expect(config.centridBaseUrl).toBe("/centri");
    });

    it("treats empty string as null for centridBaseUrl", () => {
      const config = parseArgs(["--centrid-base-url", ""]);
      expect(config.centridBaseUrl).toBeNull();
    });
  });

  describe("centrid base URL injection", () => {
    // The deployed stack mounts centrid at /centri on the same origin (see
    // dev-with-automation.mjs). The pre-built frontend learns about it via
    // this injected window global, read by `getCentridBaseUrl()` in
    // src/api/centri/centri-config.ts.
    it("exposes the base URL on window.__CENTRI_CENTRID_BASE_URL__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServer(buildDir, {
        centridBaseUrl: "/centri",
      });
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__CENTRI_CENTRID_BASE_URL__");
      expect(body).toContain('"/centri"');
    });

    it("injects into SPA fallback index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServer(buildDir, {
        centridBaseUrl: "/centri",
      });
      const response = await fetch(`${origin}/settings/memory`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("__CENTRI_CENTRID_BASE_URL__");
    });

    it("does not inject when centridBaseUrl is null", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServer(buildDir, { centridBaseUrl: null });
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).not.toContain("__CENTRI_CENTRID_BASE_URL__");
    });
  });

  describe("strip-prefix proxy routes", () => {
    // Runs the static server as a child process: msw's request interceptor
    // (vitest.setup.ts) wraps in-process http.ClientRequest and stalls the
    // proxy's piped upstream request, so an in-process startStaticServer
    // cannot exercise the proxy path under vitest.
    async function getFreePort() {
      const probe = createServer();
      await new Promise<void>((resolve) =>
        probe.listen(0, "127.0.0.1", () => resolve()),
      );
      const address = probe.address();
      if (!address || typeof address === "string") {
        throw new Error("Probe server did not bind to a TCP port");
      }
      const { port } = address;
      await new Promise<void>((resolve) => probe.close(() => resolve()));
      return port;
    }

    async function waitForPort(port: number, child: ChildProcess) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (child.exitCode !== null) {
          throw new Error(`Static server exited early: ${child.exitCode}`);
        }
        const connected = await new Promise<boolean>((resolve) => {
          const socket = netConnect({ host: "127.0.0.1", port });
          socket.setTimeout(500);
          socket.once("connect", () => {
            socket.destroy();
            resolve(true);
          });
          socket.once("error", () => resolve(false));
          socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
          });
        });
        if (connected) return;
        await delay(50);
      }
      throw new Error(`Timed out waiting for port ${port}`);
    }

    it("strips the matched prefix before proxying to the backend", async () => {
      const backend = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ path: req.url }));
      });
      servers.push(backend);
      await new Promise<void>((resolve) =>
        backend.listen(0, "127.0.0.1", () => resolve()),
      );
      const backendAddress = backend.address();
      if (!backendAddress || typeof backendAddress === "string") {
        throw new Error("Backend did not bind to a TCP port");
      }

      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const port = await getFreePort();
      const child = spawn(
        process.execPath,
        [
          staticServerScript,
          "--port",
          port.toString(),
          "--host",
          "127.0.0.1",
          "--dir",
          buildDir,
          "--route",
          `/centri=http://127.0.0.1:${backendAddress.port};strip-prefix`,
        ],
        { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
      );

      try {
        await waitForPort(port, child);
        const origin = `http://127.0.0.1:${port}`;

        const response = await fetch(`${origin}/centri/api/settings?x=1`);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.path).toBe("/api/settings?x=1");

        // Non-matching paths still fall through to the static handler.
        const staticResponse = await fetch(`${origin}/`);
        expect(staticResponse.status).toBe(200);
        await expect(staticResponse.text()).resolves.toContain("app");
      } finally {
        child.kill("SIGTERM");
        await Promise.race([once(child, "exit"), delay(2000)]);
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    });
  });

  describe("runtime services info injection", () => {
    async function startServerWithRuntimeInfo(
      dir: string,
      runtimeServicesInfo: string,
    ) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        runtimeServicesInfo,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    // Regression test for the Docker / published-binary path: static builds
    // have no VITE_RUNTIME_SERVICES_INFO baked in, so the agent's
    // <RUNTIME_SERVICES> block is populated from this injected window global
    // (see `parseRuntimeServicesInfo()` in src/api/agent-server-adapter.ts).
    it("exposes the JSON on window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const info = JSON.stringify({
        mode: "docker",
        services: {
          agent_server: { url_from_agent: "http://127.0.0.1:18000" },
        },
      });
      const origin = await startServerWithRuntimeInfo(buildDir, info);
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__");
      // Stored as a JSON *string* (note the escaped quotes) so the browser can
      // JSON.parse it, exactly like the VITE_RUNTIME_SERVICES_INFO env var.
      expect(body).toContain('\\"mode\\"');
      expect(body).toContain("docker");
    });

    it("does not inject when runtimeServicesInfo is null", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        runtimeServicesInfo: null,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${(address as { port: number }).port}`;

      const body = await (await fetch(`${origin}/`)).text();
      expect(body).not.toContain("__AGENT_CANVAS_RUNTIME_SERVICES_INFO__");
    });
  });

  describe("lock-to-cloud injection", () => {
    async function startServerLockedToCloud(dir: string, lockToCloud: string) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        lockToCloud,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    it("exposes the locked Cloud URL on window.__AGENT_CANVAS_LOCK_TO_CLOUD__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerLockedToCloud(
        buildDir,
        "https://cloud.example.com",
      );
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__AGENT_CANVAS_LOCK_TO_CLOUD__");
      expect(body).toContain('"https://cloud.example.com"');
    });

    it("injects lock-to-cloud into SPA fallback index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerLockedToCloud(
        buildDir,
        "https://cloud.example.com",
      );
      const response = await fetch(`${origin}/some/deep/route`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("__AGENT_CANVAS_LOCK_TO_CLOUD__");
    });
  });

  describe("session key injection", () => {
    async function startServerWithKey(dir: string, sessionApiKey: string) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        sessionApiKey,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    it("injects session key script into index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "test-session-key");
      const response = await fetch(`${origin}/`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("openhands-agent-server-config");
      expect(body).toContain("test-session-key");
      expect(body).toContain("sessionApiKey");
    });

    // Regression test: the published `agent-canvas` binary builds without
    // VITE_SESSION_API_KEY baked in, so the React app reads the key from
    // `window.__AGENT_CANVAS_SESSION_API_KEY__` (see
    // `getBakedSessionApiKey()` in `src/api/agent-server-config.ts`).
    // Without this assignment, `makeDefaultLocalBackend()` returns null
    // on a fresh install and the user gets the Manage Backends modal
    // instead of onboarding.
    it("exposes the session key on window.__AGENT_CANVAS_SESSION_API_KEY__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "runtime-key");
      const response = await fetch(`${origin}/`);
      const body = await response.text();

      expect(body).toContain("window.__AGENT_CANVAS_SESSION_API_KEY__");
      expect(body).toContain('"runtime-key"');
      // The window assignment must precede the localStorage write so the
      // global is set even if storage access throws (private mode, etc.).
      const windowIdx = body.indexOf("__AGENT_CANVAS_SESSION_API_KEY__");
      const localStorageIdx = body.indexOf("openhands-agent-server-config");
      expect(windowIdx).toBeGreaterThan(-1);
      expect(localStorageIdx).toBeGreaterThan(-1);
      expect(windowIdx).toBeLessThan(localStorageIdx);
    });

    it("injects session key into SPA fallback index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "fallback-key");
      const response = await fetch(`${origin}/some/deep/route`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("fallback-key");
    });

    it("does not inject into non-html asset responses", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      mkdirSync(path.join(buildDir, "assets"));
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );
      writeFileSync(
        path.join(buildDir, "assets", "app.js"),
        "console.log('app');",
      );

      const origin = await startServerWithKey(buildDir, "should-not-inject");
      const response = await fetch(`${origin}/assets/app.js`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain("should-not-inject");
    });

    it("sets Cache-Control: no-cache for injected index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "cache-test-key");
      const response = await fetch(`${origin}/`);

      expect(response.headers.get("cache-control")).toBe("no-cache");
    });

    it("does not inject when sessionApiKey is null", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        sessionApiKey: null,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${(address as { port: number }).port}`;

      const response = await fetch(`${origin}/`);
      const body = await response.text();
      expect(body).not.toContain("openhands-agent-server-config");
      expect(body).not.toContain("__AGENT_CANVAS_SESSION_API_KEY__");
    });

    it("injects session key into HTML without </head> tag (falls back to </body>)", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><body>no-head</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "no-head-key");
      const response = await fetch(`${origin}/`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("no-head-key");
      expect(body).toContain("openhands-agent-server-config");
      // Script should appear before </body>, not at the very front of the document
      expect(body.indexOf("no-head-key")).toBeLessThan(body.indexOf("</body>"));
      expect(body.indexOf("no-head-key")).toBeGreaterThan(0);
    });
  });

  it("serves nested build assets on all platforms", async () => {
    const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
    tempDirs.push(buildDir);
    mkdirSync(path.join(buildDir, "assets"));
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    writeFileSync(
      path.join(buildDir, "assets", "entry.client-test.js"),
      "export const loaded = true;\n",
    );

    const origin = await startServer(buildDir);
    const response = await fetch(`${origin}/assets/entry.client-test.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    await expect(response.text()).resolves.toContain("loaded = true");
  });

  describe("base path mounting", () => {
    it("serves index.html and injects the base path under the mount", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServer(buildDir, { basePath: "/canvas" });
      const response = await fetch(`${origin}/canvas/conversations/abc`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("window.__AGENT_CANVAS_BASE_PATH__");
      expect(body).toContain('"/canvas"');
    });

    it("serves static assets from underneath the mount", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      mkdirSync(path.join(buildDir, "assets"));
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
      writeFileSync(
        path.join(buildDir, "assets", "entry.client-test.js"),
        "export const loaded = true;\n",
      );

      const origin = await startServer(buildDir, { basePath: "/canvas" });
      const response = await fetch(
        `${origin}/canvas/assets/entry.client-test.js`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/javascript",
      );
      await expect(response.text()).resolves.toContain("loaded = true");
    });

    it("redirects app routes outside the mount to the configured base path", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const origin = await startServer(buildDir, { basePath: "/canvas" });
      const response = await fetch(`${origin}/conversations/abc?tab=files`, {
        redirect: "manual",
      });

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "/canvas/conversations/abc?tab=files",
      );
    });

    it("does not redirect asset-like requests outside the configured mount", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const origin = await startServer(buildDir, { basePath: "/canvas" });
      const response = await fetch(`${origin}/assets/missing.js`, {
        redirect: "manual",
      });

      expect(response.status).toBe(404);
    });
  });

  it("keeps paths confined to the static directory", async () => {
    const parentDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-parent-"));
    tempDirs.push(parentDir);
    const buildDir = path.join(parentDir, "build");
    mkdirSync(buildDir);
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    writeFileSync(path.join(parentDir, "secret.txt"), "secret\n");

    const origin = await startServer(buildDir);
    const response = await fetch(`${origin}/../secret.txt`);

    expect(response.status).not.toBe(200);
    await expect(response.text()).resolves.not.toContain("secret");
  });
});
