import { describe, expect, it } from "vitest";
import {
  WEBVIEW_CSP,
  WEBVIEW_CSP_DIRECTIVES,
  WEBVIEW_OPAQUE_ORIGIN,
  WEBVIEW_SANDBOX,
} from "#/extensions/webview-security";

/**
 * These assert the security posture so a regression that quietly widens the trust
 * boundary fails CI instead of shipping.
 */
describe("webview security constants", () => {
  it("sandboxes without allow-same-origin", () => {
    expect(WEBVIEW_SANDBOX).toContain("allow-scripts");
    expect(WEBVIEW_SANDBOX).not.toContain("allow-same-origin");
  });

  it("expects the opaque origin for sandboxed frames", () => {
    expect(WEBVIEW_OPAQUE_ORIGIN).toBe("null");
  });

  it("denies all by default and blocks every network channel", () => {
    expect(WEBVIEW_CSP_DIRECTIVES["default-src"]).toBe("'none'");
    // No exfiltration: connect-src 'none' kills fetch/XHR/WebSocket/EventSource/beacon.
    expect(WEBVIEW_CSP_DIRECTIVES["connect-src"]).toBe("'none'");
    expect(WEBVIEW_CSP_DIRECTIVES["base-uri"]).toBe("'none'");
    expect(WEBVIEW_CSP_DIRECTIVES["form-action"]).toBe("'none'");
  });

  it("serializes to a single header value", () => {
    expect(WEBVIEW_CSP).toContain("default-src 'none'");
    expect(WEBVIEW_CSP).toContain("connect-src 'none'");
    expect(WEBVIEW_CSP.includes("\n")).toBe(false);
  });
});
