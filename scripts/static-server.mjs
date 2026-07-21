/**
 * Combined static file server + reverse proxy.
 *
 * Replaces `sirv-cli` for the static launcher. The reason a plain static
 * server is not enough: Vite's dev server (used by `npm run dev`) configures
 * a proxy for `/api`, `/sockets`, `/server_info`, `/alive`, `/health`,
 * `/ready`, `/docs`, `/redoc`, `/openapi.json` (see vite.config.ts) so
 * requests to those paths are forwarded to
 * the agent-server even when the browser is hitting Vite directly on :3001.
 * sirv-cli has no proxy support, so under `--single` it falls back to
 * index.html for any of those paths — making `/server_info` look like HTML
 * to the SPA when the user hits the static port directly (e.g. via a tunnel
 * that exposes :3001).
 *
 * This script provides Vite-equivalent behaviour: serve static files from
 * --dir, fall back to index.html for HTML navigations, and reverse-proxy
 * configured prefixes to upstream backends. The proxy + WebSocket logic is
 * deliberately kept identical in spirit to scripts/ingress.mjs so the two
 * servers route the same way.
 *
 * Usage (mirrors scripts/ingress.mjs's --route flag style):
 *   node scripts/static-server.mjs \
 *     --port 3001 --dir build \
 *     --route "/api/automation=http://localhost:18001" \
 *     --route "/api=http://localhost:18000" \
 *     --route "/server_info=http://localhost:18000" \
 *     --route "/sockets=http://localhost:18000"
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import sirv from "sirv";

import {
  createProxyHandlers,
  createRewriteRouter,
  matchesPathPrefix,
} from "./proxy-utils.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// SPA fallback helpers
// ─────────────────────────────────────────────────────────────────────────────

const ASSET_LIKE_EXTENSIONS = new Set([
  ".br",
  ".css",
  ".gif",
  ".gz",
  ".html",
  ".htm",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".mp3",
  ".png",
  ".svg",
  ".ttf",
  ".txt",
  ".wav",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv = process.argv.slice(2)) {
  const config = {
    port: 3001,
    host: "::",
    dir: "build",
    routes: {},
    rejectPrefixes: [],
    sessionApiKey: null,
    authRequired: false,
    runtimeServicesInfo: null,
    lockToCloud: null,
    basePath: "/",
    centridBaseUrl: null,
    proxyBearer: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "-p":
      case "--port":
        config.port = Number.parseInt(argv[++i], 10);
        break;
      case "-H":
      case "--host":
        config.host = argv[++i];
        break;
      case "-d":
      case "--dir":
        config.dir = argv[++i];
        break;
      case "-r":
      case "--route": {
        const value = argv[++i];
        const eq = value.indexOf("=");
        if (eq < 0) {
          throw new Error(`Invalid --route (expected /prefix=url): ${value}`);
        }
        const prefix = value.slice(0, eq);
        const url = value.slice(eq + 1);
        if (!prefix.startsWith("/")) {
          throw new Error(`--route prefix must start with '/': ${prefix}`);
        }
        config.routes[prefix] = url;
        break;
      }
      case "--session-api-key":
        config.sessionApiKey = argv[++i] || null;
        break;
      case "--runtime-services-info":
        config.runtimeServicesInfo = argv[++i] || null;
        break;
      case "--lock-to-cloud":
        config.lockToCloud = argv[++i] || null;
        break;
      case "--centrid-base-url":
        config.centridBaseUrl = argv[++i] || null;
        break;
      case "--proxy-bearer": {
        // <prefix>=<ENV_NAME> — inject `Authorization: Bearer $ENV_NAME` into
        // proxied MUTATION requests under <prefix> (server-side, SPEC §3.12).
        // The token is read from the environment, NEVER from argv, so it
        // can't leak via `ps` — and it never reaches the browser: only the
        // boolean `window.__CENTRI_PANEL_PROXY_AUTH__` is injected into
        // index.html so the UI knows mutations are authorized.
        const value = argv[++i];
        const eq = value?.indexOf("=") ?? -1;
        if (eq < 0) {
          throw new Error(
            `Invalid --proxy-bearer (expected /prefix=ENV_NAME): ${value}`,
          );
        }
        const prefix = value.slice(0, eq);
        const envName = value.slice(eq + 1);
        if (!prefix.startsWith("/")) {
          throw new Error(`--proxy-bearer prefix must start with '/': ${prefix}`);
        }
        if (!envName) {
          throw new Error(`--proxy-bearer is missing the env var name: ${value}`);
        }
        config.proxyBearer = { prefix, envName };
        break;
      }
      case "--base-path":
        config.basePath = normalizeBasePath(argv[++i]);
        break;

      case "--auth-required":
        config.authRequired = true;
        break;
      case "--reject-prefix": {
        const prefix = argv[++i];
        if (!prefix || !prefix.startsWith("/")) {
          throw new Error(
            `--reject-prefix value must start with '/': ${prefix ?? "(empty)"}`,
          );
        }
        config.rejectPrefixes.push(prefix);
        break;
      }
      case "-h":
      case "--help":
        showHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  // Guard: --session-api-key and --auth-required are semantically
  // mutually exclusive. The first auto-injects the key (local mode);
  // the second forces the user to paste it (public mode). Combining
  // both is a misconfiguration.
  if (config.sessionApiKey && config.authRequired) {
    console.error(
      "ERROR: --session-api-key and --auth-required are mutually exclusive.\n" +
        "  Use --session-api-key for local mode (key auto-injected).\n" +
        "  Use --auth-required for public mode (user pastes key).",
    );
    process.exit(1);
  }

  return config;
}

function normalizeBasePath(value) {
  const raw = (value ?? "").trim();
  if (!raw || raw === "/") return "/";

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function showHelp() {
  console.log(`
Combined static file server + reverse proxy.

USAGE:
  node scripts/static-server.mjs [options]

OPTIONS:
  -p, --port  <port>           Port to bind (default: 3001)
  -H, --host  <host>           Hostname to bind (default: :: dual-stack)
  -d, --dir   <dir>            Directory to serve (default: build)
  -r, --route <prefix=url>     Proxy <prefix> (and subpaths) to <url>;
                               may be repeated. WebSockets supported.
                               <url> may end with ";strip-prefix" to remove
                               the matched prefix from the request URL before
                               proxying (e.g. /centri/api/x -> /api/x).
  --session-api-key <key>      Inject session API key into index.html so the
                               pre-built frontend authenticates to agent-server
                               without needing VITE_SESSION_API_KEY baked in.
  --auth-required              Inject authRequired flag into index.html so the
                               pre-built frontend shows the API key entry screen
                               (public mode) without VITE_AUTH_REQUIRED baked in.
  --runtime-services-info <json>
                               Inject a JSON description of the local runtime
                               services into index.html so the pre-built
                               frontend can populate the agent's
                               <RUNTIME_SERVICES> system-prompt block without
                               VITE_RUNTIME_SERVICES_INFO baked in.
  --lock-to-cloud <cloud-url>  Lock backend setup to a single OpenHands Cloud
                               URL. Hides manual/local backend setup and the
                               custom Cloud URL field in the pre-built frontend.
  --centrid-base-url <url-or-path>
                               Inject the Centri panel daemon base URL into
                               index.html (window.__CENTRI_CENTRID_BASE_URL__)
                               so the pre-built frontend reaches centrid
                               through a same-origin path (e.g. /centri)
                               instead of the loopback default.
  --proxy-bearer <prefix>=<ENV_NAME>
                               Inject "Authorization: Bearer $ENV_NAME" into
                               proxied POST/PUT/PATCH/DELETE requests under
                               <prefix> when the client sent no Authorization
                               header. The token is read from the environment
                               (never argv) and never reaches the browser —
                               only window.__CENTRI_PANEL_PROXY_AUTH__=true is
                               injected into index.html so the UI offers
                               mutations. Exits if the env var is unset.
  --base-path <path>           Mount the SPA under <path> (default: /).
                               For example, --base-path /canvas serves
                               index.html and assets under /canvas.
  --reject-prefix <prefix>     Return 503 for requests matching <prefix>
                               instead of SPA-fallbacking to index.html;
                               may be repeated. Useful in --frontend-only
                               mode to cleanly reject API paths.
  -h, --help                   Show this help

ROUTING:
  • Routes are matched by longest prefix first (most-specific wins).
  • Reject prefixes are checked before SPA fallback — matching requests
    get 503 immediately.
  • Anything that does not match a route or reject prefix is served
    from --dir.
  • Unknown paths fall back to index.html (SPA mode), unless they look
    like an asset request (have a known file extension), in which case
    a 404 is returned.
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime config injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a tiny inline script that seeds runtime config into the page.
 *
 * - `sessionApiKey`: exposed to the app two ways so a fresh-localStorage
 *   browser can authenticate even though the published bundle has no
 *   VITE_SESSION_API_KEY baked in:
 *     1. `window.__AGENT_CANVAS_SESSION_API_KEY__` — read by
 *        `getBakedSessionApiKey()` in `agent-server-config.ts` as a fallback
 *        when the env var is empty. This is symmetric with how
 *        `__AGENT_CANVAS_AUTH_REQUIRED__` works for the auth-required flag.
 *     2. Written to `openhands-agent-server-config.sessionApiKey` in
 *        localStorage for compatibility with the legacy storage key. Useful
 *        for any code path that still reads it (e.g. e2e test fixtures).
 *        Always overwrites when the stored value differs so a rotated key
 *        is not shadowed by a stale one.
 *
 * - `authRequired`: sets `window.__AGENT_CANVAS_AUTH_REQUIRED__ = true` so the
 *   pre-built frontend shows the API key entry screen (public mode) without
 *   VITE_AUTH_REQUIRED baked in.
 *
 * - `runtimeServicesInfo`: a JSON string describing the local services
 *   (agent-server, automation, …), exposed as
 *   `window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__`. Read by
 *   `parseRuntimeServicesInfo()` in `agent-server-adapter.ts` as a fallback
 *   when `VITE_RUNTIME_SERVICES_INFO` is empty, so static builds (Docker /
 *   published binary) still populate the agent's `<RUNTIME_SERVICES>` block.
 *
 * - `lockToCloud`: an OpenHands Cloud URL exposed as
 *   `window.__AGENT_CANVAS_LOCK_TO_CLOUD__`. Read by `getLockedCloudHost()` in
 *   `agent-server-config.ts` so pre-built frontend bundles can hide manual
 *   backend setup and the custom Cloud URL field at runtime.
 *
 * - `basePath`: the path prefix the SPA is mounted under, exposed as
 *   `window.__AGENT_CANVAS_BASE_PATH__` so runtime static assets like locale
 *   files can resolve through the same subpath as the built bundle.
 *
 * - `centridBaseUrl`: the Centri panel daemon base URL (absolute, or a
 *   same-origin path like `/centri`), exposed as
 *   `window.__CENTRI_CENTRID_BASE_URL__`. Read by `getCentridBaseUrl()` in
 *   `src/api/centri/centri-config.ts` as a fallback when
 *   `VITE_CENTRID_BASE_URL` is empty, so a deployment can point the
 *   pre-built frontend at a proxied centrid without rebuilding.
 */
function makeConfigInjectionScript(
  sessionApiKey,
  authRequired,
  runtimeServicesInfo,
  lockToCloud,
  basePath,
  centridBaseUrl,
  centriProxyAuth,
) {
  const parts = [];

  if (sessionApiKey) {
    const keyLiteral = JSON.stringify(sessionApiKey);
    // Window global — read at module init by getBakedSessionApiKey().
    // Set first so it's available even if the localStorage write throws.
    parts.push(`window.__AGENT_CANVAS_SESSION_API_KEY__=${keyLiteral};`);
    // Always overwrite when the stored key differs from the runtime key.
    // A previous session may have persisted a now-stale key; the runtime
    // value (from --session-api-key) is the server's truth.
    parts.push(
      `try{` +
        `var _k='openhands-agent-server-config',` +
        `_c=JSON.parse(localStorage.getItem(_k)||'{}');` +
        `if(_c.sessionApiKey!==${keyLiteral}){` +
        `_c.sessionApiKey=${keyLiteral};` +
        `localStorage.setItem(_k,JSON.stringify(_c));` +
        `}` +
        `}catch(e){}`,
    );
  }

  if (authRequired) {
    parts.push(`window.__AGENT_CANVAS_AUTH_REQUIRED__=true;`);
  }

  if (runtimeServicesInfo) {
    // Stored as the raw JSON string so the browser-side parser
    // (parseRuntimeServicesInfo) can JSON.parse it exactly like the
    // VITE_RUNTIME_SERVICES_INFO env var. JSON.stringify produces a safe JS
    // string literal for the inline <script>.
    parts.push(
      `window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__=${JSON.stringify(runtimeServicesInfo)};`,
    );
  }

  if (lockToCloud) {
    parts.push(
      `window.__AGENT_CANVAS_LOCK_TO_CLOUD__=${JSON.stringify(lockToCloud)};`,
    );
  }

  if (basePath && basePath !== "/") {
    parts.push(
      `window.__AGENT_CANVAS_BASE_PATH__=${JSON.stringify(basePath)};`,
    );
  }

  if (centridBaseUrl) {
    parts.push(
      `window.__CENTRI_CENTRID_BASE_URL__=${JSON.stringify(centridBaseUrl)};`,
    );
  }

  if (centriProxyAuth) {
    // Boolean ONLY — the token itself stays server-side (SPEC §3.12).
    parts.push(`window.__CENTRI_PANEL_PROXY_AUTH__=true;`);
  }

  if (parts.length === 0) return "";

  return `<script>(function(){${parts.join("")}}());</script>`;
}

/**
 * Serve index.html with runtime config injected into <head>.
 * Returns true if the response was written, false if the file was not found.
 */
async function serveInjectedIndexHtml(
  req,
  res,
  indexPath,
  {
    sessionApiKey,
    authRequired,
    runtimeServicesInfo,
    lockToCloud,
    basePath,
    centridBaseUrl,
    centriProxyAuth,
  } = {},
) {
  let content;
  try {
    content = await readFile(indexPath, "utf8");
  } catch {
    return false;
  }

  const script = makeConfigInjectionScript(
    sessionApiKey,
    authRequired,
    runtimeServicesInfo,
    lockToCloud,
    basePath,
    centridBaseUrl,
    centriProxyAuth,
  );
  // Inject right before </head> so the key is available before any app code runs.
  // replace() targets the first (and only) </head> in well-formed HTML.
  const injected = content.includes("</head>")
    ? content.replace("</head>", `${script}\n</head>`)
    : content.includes("</body>")
      ? content.replace("</body>", `${script}\n</body>`)
      : script + content;

  const buf = Buffer.from(injected, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-cache",
  });
  if (req.method === "HEAD") {
    res.end();
  } else {
    res.end(buf);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static file serving
// ─────────────────────────────────────────────────────────────────────────────

function parseUrlPath(req, res) {
  const rawPath = (req.url ?? "/").split("?")[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return null;
  }
}

function isGetOrHead(req) {
  return req.method === "GET" || req.method === "HEAD";
}

function needsRuntimeInjection(injectionOpts) {
  return Boolean(
    injectionOpts.sessionApiKey ||
    injectionOpts.authRequired ||
    injectionOpts.runtimeServicesInfo ||
    injectionOpts.lockToCloud ||
    injectionOpts.centridBaseUrl ||
    injectionOpts.centriProxyAuth ||
    (injectionOpts.basePath && injectionOpts.basePath !== "/"),
  );
}

function looksLikeAssetRequest(urlPath) {
  const last = urlPath.split("/").pop() ?? "";
  return ASSET_LIKE_EXTENSIONS.has(extname(last).toLowerCase());
}

function matchesAnyPrefix(urlPath, prefixes) {
  return prefixes.some((prefix) => matchesPathPrefix(urlPath, prefix));
}

function rejectUnavailable(res) {
  res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Service Unavailable (no backend configured for this route)");
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
}

function isMountedPath(urlPath, basePath) {
  return (
    basePath === "/" ||
    urlPath === basePath ||
    urlPath.startsWith(`${basePath}/`)
  );
}

function stripBasePathFromUrl(rawUrl, basePath) {
  if (basePath === "/") return rawUrl;

  const [rawPath = "/", ...rest] = (rawUrl || "/").split("?");
  const suffix = rawPath.slice(basePath.length) || "/";
  const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return rest.length > 0 ? `${path}?${rest.join("?")}` : path;
}

function redirectToMountedPath(req, res, urlPath, basePath) {
  if (basePath === "/" || !isGetOrHead(req) || looksLikeAssetRequest(urlPath)) {
    return false;
  }

  const [, query = ""] = (req.url ?? "/").split("?", 2);
  const path = urlPath === "/" ? "/" : urlPath;
  const location = `${basePath}${path}${query ? `?${query}` : ""}`;
  res.writeHead(308, { Location: location });
  res.end();
  return true;
}

function setStaticHeaders(res, pathname) {
  const extension = extname(pathname).toLowerCase();
  if (extension === ".js" || extension === ".mjs") {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  }

  if (pathname.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
}

function createStaticMiddleware(dirAbs) {
  return sirv(dirAbs, {
    etag: true,
    single: false,
    setHeaders: setStaticHeaders,
  });
}

async function handleStatic(
  req,
  res,
  dirAbs,
  staticMiddleware,
  injectionOpts = {},
  rejectPrefixes = [],
  basePath = "/",
) {
  const urlPath = parseUrlPath(req, res);
  if (urlPath === null) return;

  if (!isMountedPath(urlPath, basePath)) {
    if (matchesAnyPrefix(urlPath, rejectPrefixes)) {
      rejectUnavailable(res);
      return;
    }
    if (!redirectToMountedPath(req, res, urlPath, basePath)) notFound(res);
    return;
  }

  const mountedUrl = stripBasePathFromUrl(req.url ?? "/", basePath);
  const mountedPath = parseUrlPath({ ...req, url: mountedUrl }, res);
  if (mountedPath === null) return;

  const injectRuntimeConfig = needsRuntimeInjection(injectionOpts);
  const indexPath = resolve(dirAbs, "index.html");

  if (
    injectRuntimeConfig &&
    isGetOrHead(req) &&
    (mountedPath === "/" || mountedPath === "/index.html")
  ) {
    if (await serveInjectedIndexHtml(req, res, indexPath, injectionOpts))
      return;
  }

  const mountedReq = Object.create(req);
  mountedReq.url = mountedUrl;

  staticMiddleware(mountedReq, res, async () => {
    if (matchesAnyPrefix(mountedPath, rejectPrefixes)) {
      rejectUnavailable(res);
      return;
    }

    if (isGetOrHead(req) && !looksLikeAssetRequest(mountedPath)) {
      if (await serveInjectedIndexHtml(req, res, indexPath, injectionOpts)) {
        return;
      }
    }

    notFound(res);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

/** Methods that need the injected bearer; reads stay unauthenticated. */
const PROXY_BEARER_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** True when `url`'s path falls under `prefix` (segment-aware, query-safe). */
function underPathPrefix(url, prefix) {
  if (!url.startsWith(prefix)) return false;
  const next = url.charAt(prefix.length);
  return next === "" || next === "/" || next === "?";
}

/**
 * Resolves --proxy-bearer into `{ prefix, token }`, reading the token from
 * the environment. Fail-closed: a configured flag with a missing/empty env
 * var is a deploy misconfiguration — exit loudly instead of silently serving
 * a UI whose mutations would all 401.
 */
function resolveProxyBearer(proxyBearer) {
  if (!proxyBearer) return null;
  const token = (process.env[proxyBearer.envName] ?? "").trim();
  if (!token) {
    console.error(
      `ERROR: --proxy-bearer names env var ${proxyBearer.envName}, ` +
        `but it is not set (or empty).`,
    );
    process.exit(1);
  }
  return { prefix: proxyBearer.prefix, token };
}

export function startStaticServer(config) {
  // No default backend: the static handler below is the fallback.
  const route = createRewriteRouter(config.routes);
  const proxy = createProxyHandlers({ label: `static:${config.port}` });
  const dirAbs = resolve(config.dir);
  const proxyBearer = resolveProxyBearer(config.proxyBearer);
  const injectionOpts = {
    sessionApiKey: config.sessionApiKey || null,
    authRequired: config.authRequired || false,
    runtimeServicesInfo: config.runtimeServicesInfo || null,
    lockToCloud: config.lockToCloud || null,
    basePath: normalizeBasePath(config.basePath),
    centridBaseUrl: config.centridBaseUrl || null,
    centriProxyAuth: Boolean(proxyBearer),
  };
  const basePath = injectionOpts.basePath;
  const rejectPrefixes = config.rejectPrefixes ?? [];
  const staticMiddleware = createStaticMiddleware(dirAbs);

  const uninstallDiagnostics = proxy.installDiagnostics();

  const server = createServer((req, res) => {
    const originalUrl = req.url ?? "/";
    const match = route(originalUrl);
    if (match) {
      // Server-side bearer injection (SPEC §3.12): mutation requests under
      // the configured prefix get the token added HERE, at the same-origin
      // proxy — the browser never holds it. An explicit client header (the
      // browser-token dev seam) always wins; reads pass through untouched.
      if (
        proxyBearer &&
        underPathPrefix(originalUrl, proxyBearer.prefix) &&
        PROXY_BEARER_METHODS.has(req.method ?? "") &&
        !req.headers.authorization
      ) {
        req.headers.authorization = `Bearer ${proxyBearer.token}`;
      }
      req.url = match.url;
      proxy.proxyHttp(req, res, match.backend);
      return;
    }
    handleStatic(
      req,
      res,
      dirAbs,
      staticMiddleware,
      injectionOpts,
      rejectPrefixes,
      basePath,
    ).catch((err) => {
      console.error(`Static handler error for ${req.url}:`, err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const match = route(req.url ?? "/");
    if (match) {
      req.url = match.url;
      proxy.proxyWebSocket(req, socket, head, match.backend);
      return;
    }
    socket.destroy();
  });
  server.on("close", uninstallDiagnostics);

  return new Promise((resolveListen) => {
    server.listen(config.port, config.host, () => {
      const displayPath = basePath === "/" ? "/" : `${basePath}/`;
      console.log("");
      console.log(
        `Static-server + proxy listening on http://${config.host}:${config.port}${displayPath}`,
      );
      console.log(`  Static dir: ${dirAbs}`);
      console.log(`  Base path: ${basePath}`);
      const sortedRoutes = Object.entries(config.routes).sort(
        ([a], [b]) => b.length - a.length,
      );
      for (const [prefix, backend] of sortedRoutes) {
        console.log(`  ${prefix} -> ${backend}`);
      }
      if (rejectPrefixes.length > 0) {
        for (const prefix of rejectPrefixes) {
          console.log(`  ${prefix} -> 503 (rejected)`);
        }
      }
      if (config.lockToCloud) {
        console.log(`  Backend setup locked to Cloud: ${config.lockToCloud}`);
      }
      console.log("  * (default) -> static files + SPA fallback");
      console.log("");
      resolveListen(server);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    const config = parseArgs();
    await startStaticServer(config);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
