/**
 * Canonical security constants for extension webviews — the single source of truth
 * shared by the runtime (`ExtensionWebview`, host transport) and the asset server
 * (the dev middleware in `vite.config.ts`; a real deployment must send the same
 * headers from wherever it serves bundle assets).
 *
 * Threat model: a webview runs **untrusted, customer-supplied** HTML/JS. The defences
 * are layered so no single regression is catastrophic:
 *
 * 1. Sandbox — `allow-scripts` only (deliberately NO `allow-same-origin`), so the
 *    frame has an opaque ("null") origin and cannot read host cookies, storage, or the
 *    parent DOM, nor submit forms / navigate the top frame / open popups.
 * 2. CSP — `connect-src 'none'` removes every network channel (fetch/XHR/WebSocket/
 *    EventSource/beacon), so a webview **cannot exfiltrate data**; its only outbound
 *    path is the capability-gated `postMessage` RPC. `default-src 'none'` denies
 *    everything not explicitly re-allowed.
 * 3. Origin-checked RPC — the host only accepts messages whose `event.source` is the
 *    frame AND whose `event.origin` is the opaque origin (see below), and every
 *    privileged call is gated by the extension's granted capabilities.
 */

/** `sandbox` attribute for extension webview iframes. Never add `allow-same-origin`. */
export const WEBVIEW_SANDBOX = "allow-scripts";

/**
 * Serialized origin of a sandboxed (no `allow-same-origin`) iframe. The host requires
 * inbound RPC messages to carry this origin; if the sandbox were ever loosened to add
 * `allow-same-origin`, the frame's origin would change and RPC would fail loudly
 * rather than silently widening the trust boundary.
 */
export const WEBVIEW_OPAQUE_ORIGIN = "null";

/**
 * Strict Content-Security-Policy enforced on webview documents. Sent as an HTTP header
 * by the asset server so it is authoritative regardless of any `<meta>` CSP a bundle
 * ships (header + meta combine to the intersection).
 *
 * `'unsafe-inline'` for scripts/styles is currently required to run unbundled webview
 * code with no build step; it is acceptable only because the frame is sandboxed
 * (opaque origin) and `connect-src 'none'` denies all exfiltration. A future iteration
 * can move to per-load nonces.
 */
export const WEBVIEW_CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'none'",
  "script-src": "'unsafe-inline'",
  "style-src": "'unsafe-inline'",
  "img-src": "data: blob:",
  "font-src": "data:",
  "connect-src": "'none'",
  "form-action": "'none'",
  "base-uri": "'none'",
};

/** The {@link WEBVIEW_CSP_DIRECTIVES} serialized as a CSP header value. */
export const WEBVIEW_CSP = Object.entries(WEBVIEW_CSP_DIRECTIVES)
  .map(([directive, value]) => `${directive} ${value}`)
  .join("; ");
