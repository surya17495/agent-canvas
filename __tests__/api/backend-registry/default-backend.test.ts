import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEEDED_DEFAULT_BACKEND_ID,
  makeDefaultLocalBackend,
} from "#/api/backend-registry/default-backend";

const ORIGINAL_LOCATION = window.location;

function mockWindowLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

function setInjectedKey(value: unknown) {
  (
    window as unknown as Record<string, unknown>
  ).__AGENT_CANVAS_SESSION_API_KEY__ = value;
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as unknown as Record<string, unknown>)
    .__AGENT_CANVAS_SESSION_API_KEY__;
  delete (window as unknown as Record<string, unknown>)
    .__AGENT_CANVAS_LOCK_TO_CLOUD__;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

describe("makeDefaultLocalBackend", () => {
  // Gate-7 invariant: in public mode the frontend has no baked/injected
  // session key, so it must NOT fabricate a default local backend (which
  // would silently invent/expose a key). The user pastes the key instead.
  it("returns null in public mode (no baked or injected key)", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    mockWindowLocation("http://localhost:8000/");

    expect(makeDefaultLocalBackend()).toBeNull();
  });

  it("seeds a local backend from the env-baked session key", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "baked-key");
    mockWindowLocation("http://localhost:8000/");

    const backend = makeDefaultLocalBackend();
    expect(backend).not.toBeNull();
    expect(backend).toMatchObject({
      id: SEEDED_DEFAULT_BACKEND_ID,
      kind: "local",
      host: "http://localhost:8000",
      apiKey: "baked-key",
    });
  });

  it("seeds from the runtime-injected key when no env key is baked in", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    setInjectedKey("runtime-injected-key");
    mockWindowLocation("http://localhost:8000/");

    expect(makeDefaultLocalBackend()?.apiKey).toBe("runtime-injected-key");
  });

  it("returns null when locked to a Cloud host even if a key is present", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "baked-key");
    vi.stubEnv("VITE_LOCK_TO_CLOUD", "app.all-hands.dev");
    mockWindowLocation("http://localhost:8000/");

    expect(makeDefaultLocalBackend()).toBeNull();
  });
});
