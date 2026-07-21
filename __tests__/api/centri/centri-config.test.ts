import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CENTRID_BASE_URL,
  getCentridBaseUrl,
  getCentriPanelToken,
  hasCentriPanelToken,
} from "#/api/centri/centri-config";

const BASE_URL_WINDOW_KEY = "__CENTRI_CENTRID_BASE_URL__";
const PANEL_TOKEN_WINDOW_KEY = "__CENTRI_PANEL_TOKEN__";

type InjectedWindow = Window &
  Record<string, unknown> & {
    [BASE_URL_WINDOW_KEY]?: unknown;
    [PANEL_TOKEN_WINDOW_KEY]?: unknown;
  };

const injectedWindow = window as unknown as InjectedWindow;

afterEach(() => {
  vi.unstubAllEnvs();
  delete injectedWindow[BASE_URL_WINDOW_KEY];
  delete injectedWindow[PANEL_TOKEN_WINDOW_KEY];
});

describe("getCentridBaseUrl", () => {
  it("falls back to the loopback default with no config", () => {
    expect(getCentridBaseUrl()).toBe(DEFAULT_CENTRID_BASE_URL);
  });

  // The deployed stack (see scripts/dev-with-automation.mjs) proxies centrid
  // under the app's own origin and injects "/centri" at serve time; the
  // client must keep it path-relative so `${base}${path}` stays same-origin.
  it("keeps a window-injected path-relative base URL as-is", () => {
    injectedWindow[BASE_URL_WINDOW_KEY] = "/centri";
    expect(getCentridBaseUrl()).toBe("/centri");
  });

  it("trims trailing slashes from a path-relative base URL", () => {
    injectedWindow[BASE_URL_WINDOW_KEY] = "/centri///";
    expect(getCentridBaseUrl()).toBe("/centri");
  });

  it("treats a bare '/' as unset and falls back to the default", () => {
    injectedWindow[BASE_URL_WINDOW_KEY] = "/";
    expect(getCentridBaseUrl()).toBe(DEFAULT_CENTRID_BASE_URL);
  });

  it("keeps absolute http(s) URLs unchanged", () => {
    injectedWindow[BASE_URL_WINDOW_KEY] = "https://centrid.example.com";
    expect(getCentridBaseUrl()).toBe("https://centrid.example.com");
  });

  it("prefixes bare host:port values with http://", () => {
    injectedWindow[BASE_URL_WINDOW_KEY] = "127.0.0.1:7000";
    expect(getCentridBaseUrl()).toBe("http://127.0.0.1:7000");
  });

  it("prefers the VITE env var over the window global", () => {
    vi.stubEnv("VITE_CENTRID_BASE_URL", "http://127.0.0.1:7001");
    injectedWindow[BASE_URL_WINDOW_KEY] = "/centri";
    expect(getCentridBaseUrl()).toBe("http://127.0.0.1:7001");
  });

  it("accepts a path-relative VITE env var", () => {
    vi.stubEnv("VITE_CENTRID_BASE_URL", "/centri/");
    expect(getCentridBaseUrl()).toBe("/centri");
  });

  it("ignores non-string window values", () => {
    injectedWindow[BASE_URL_WINDOW_KEY] = 12345;
    expect(getCentridBaseUrl()).toBe(DEFAULT_CENTRID_BASE_URL);
  });
});

describe("getCentriPanelToken", () => {
  it("returns null when nothing is configured", () => {
    expect(getCentriPanelToken()).toBeNull();
    expect(hasCentriPanelToken()).toBe(false);
  });

  it("reads a window-injected token", () => {
    injectedWindow[PANEL_TOKEN_WINDOW_KEY] = "tok-abc";
    expect(getCentriPanelToken()).toBe("tok-abc");
    expect(hasCentriPanelToken()).toBe(true);
  });
});
