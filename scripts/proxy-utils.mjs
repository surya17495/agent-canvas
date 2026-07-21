import { createProxyServer } from "httpxy";

const DEFAULT_PROXY_TIMEOUT_MS = 120_000;
const BENIGN_SOCKET_ERRORS = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNABORTED",
  "ERR_STREAM_PREMATURE_CLOSE",
]);

export function matchesPathPrefix(url, prefix) {
  return (
    url === prefix ||
    url.startsWith(prefix + "/") ||
    url.startsWith(prefix + "?")
  );
}

export function createRouter(routes, defaultBackend = null) {
  const sortedRoutes = Object.entries(routes).sort(
    ([a], [b]) => b.length - a.length,
  );

  return function route(url) {
    for (const [prefix, backend] of sortedRoutes) {
      if (matchesPathPrefix(url, prefix)) {
        return backend;
      }
    }
    return defaultBackend;
  };
}

/**
 * Parse a route target value into `{ url, strip }`.
 *
 * A target is a backend URL optionally followed by `;strip-prefix`, e.g.
 * `http://127.0.0.1:6789;strip-prefix`. With `strip-prefix`, the matched
 * route prefix is removed from the request URL before proxying, so a
 * backend that serves its API at `/api/...` can be mounted under a
 * non-colliding public prefix (e.g. `/centri/api/...` -> `/api/...`).
 * Unknown flags are rejected so typos fail fast instead of silently
 * proxying with the prefix intact.
 */
export function parseRouteTarget(value) {
  const [url, ...flags] = String(value).split(";");
  let strip = false;
  for (const flag of flags) {
    if (flag === "strip-prefix") {
      strip = true;
    } else {
      throw new Error(`Unknown route flag: ${JSON.stringify(flag)}`);
    }
  }
  return { url, strip };
}

/**
 * Remove a matched route prefix from a request URL, preserving the query
 * string and always returning a path that starts with "/".
 */
export function stripPathPrefix(url, prefix) {
  const rest = url.slice(prefix.length);
  if (rest === "") return "/";
  if (rest.startsWith("?")) return `/${rest}`;
  return rest;
}

/**
 * Like {@link createRouter}, but returns `{ backend, url }` where `url` is
 * the (possibly prefix-stripped) request URL to forward. Route values may
 * carry the `;strip-prefix` flag (see {@link parseRouteTarget}). Matching
 * semantics are identical: longest prefix wins, then the default backend
 * (which never strips). Returns null when nothing matches.
 */
export function createRewriteRouter(routes, defaultBackend = null) {
  const sortedRoutes = Object.entries(routes)
    .map(([prefix, value]) => [prefix, parseRouteTarget(value)])
    .sort(([a], [b]) => b.length - a.length);

  return function route(url) {
    for (const [prefix, target] of sortedRoutes) {
      if (matchesPathPrefix(url, prefix)) {
        return {
          backend: target.url,
          url: target.strip ? stripPathPrefix(url, prefix) : url,
        };
      }
    }
    return defaultBackend ? { backend: defaultBackend, url } : null;
  };
}

export function isBenignSocketError(err) {
  return Boolean(err && BENIGN_SOCKET_ERRORS.has(err.code));
}

function once(fn) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    fn(...args);
  };
}

function writeProxyError(res, message) {
  if (res.destroyed) return;
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Bad Gateway: ${message}`);
    return;
  }
  res.destroy();
}

export function createProxyHandlers({
  label = "proxy",
  timeout = DEFAULT_PROXY_TIMEOUT_MS,
  proxyTimeout = DEFAULT_PROXY_TIMEOUT_MS,
} = {}) {
  const proxy = createProxyServer({
    ws: true,
    changeOrigin: true,
    xfwd: true,
    timeout,
    proxyTimeout,
  });
  const metrics = {
    activeHttpRequests: 0,
    activeWebSockets: 0,
    totalHttpRequests: 0,
    totalWebSockets: 0,
    totalErrors: 0,
  };

  proxy.on("error", (err, _req, resOrSocket, target) => {
    metrics.totalErrors += 1;
    const targetText = target ? ` -> ${target}` : "";
    if (!isBenignSocketError(err)) {
      console.error(`[${label}] Proxy error${targetText}: ${err.message}`);
    }
    if (resOrSocket && typeof resOrSocket.writeHead === "function") {
      writeProxyError(resOrSocket, err.message);
    } else if (resOrSocket && typeof resOrSocket.destroy === "function") {
      resOrSocket.destroy();
    }
  });

  function proxyHttp(req, res, target) {
    metrics.activeHttpRequests += 1;
    metrics.totalHttpRequests += 1;
    const finish = once(() => {
      metrics.activeHttpRequests = Math.max(0, metrics.activeHttpRequests - 1);
    });
    res.on("close", finish);
    res.on("finish", finish);
    res.on("error", finish);

    proxy.web(req, res, { target }).catch((err) => {
      metrics.totalErrors += 1;
      if (!isBenignSocketError(err)) {
        console.error(
          `[${label}] Proxy error for ${req.url} -> ${target}:`,
          err,
        );
      }
      writeProxyError(res, err instanceof Error ? err.message : String(err));
      finish();
    });
  }

  function proxyWebSocket(req, socket, head, target) {
    metrics.activeWebSockets += 1;
    metrics.totalWebSockets += 1;
    const finish = once(() => {
      metrics.activeWebSockets = Math.max(0, metrics.activeWebSockets - 1);
    });
    socket.on("close", finish);
    socket.on("error", finish);

    try {
      proxy.ws(req, socket, { target }, head).catch((err) => {
        metrics.totalErrors += 1;
        if (!isBenignSocketError(err)) {
          console.error(
            `[${label}] WebSocket proxy error for ${req.url} -> ${target}:`,
            err,
          );
        }
        socket.destroy();
        finish();
      });
    } catch (err) {
      metrics.totalErrors += 1;
      if (!isBenignSocketError(err)) {
        console.error(
          `[${label}] WebSocket proxy error for ${req.url} -> ${target}:`,
          err,
        );
      }
      socket.destroy();
      finish();
    }
  }

  function dumpMetrics() {
    console.log(
      `[${label}] active_http=${metrics.activeHttpRequests} ` +
        `active_ws=${metrics.activeWebSockets} ` +
        `total_http=${metrics.totalHttpRequests} ` +
        `total_ws=${metrics.totalWebSockets} ` +
        `total_errors=${metrics.totalErrors}`,
    );
  }

  function installDiagnostics(signal = "SIGUSR1") {
    process.on(signal, dumpMetrics);
    return () => {
      process.off(signal, dumpMetrics);
    };
  }

  return {
    proxyHttp,
    proxyWebSocket,
    dumpMetrics,
    installDiagnostics,
    metrics,
  };
}
