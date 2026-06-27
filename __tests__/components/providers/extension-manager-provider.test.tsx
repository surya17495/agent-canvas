import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import {
  ExtensionManagerProviderInner,
  useExtensionContext,
} from "#/components/providers/extension-manager-provider";
import { useInstalledExtensionsStore } from "#/extensions/installed-store";
import { contributionRegistry } from "#/extensions/contribution-registry";
import type { ExtensionManifest } from "#/extensions/manifest";

// Keep the auto-install effect from touching the network with dev bundles.
vi.mock("#/extensions/feature-flag", () => ({
  EXTENSIONS_ENABLED: true,
  DEV_EXTENSION_BUNDLE_URLS: [],
}));

type Ctx = NonNullable<ReturnType<typeof useExtensionContext>>;

interface FetchState {
  latestVersion: string;
  manifests: Record<string, ExtensionManifest>;
}

function manifest(over: Partial<ExtensionManifest> = {}): ExtensionManifest {
  return {
    id: "acme.test",
    name: "Test",
    version: "1.0.0",
    engines: { agentCanvas: "^1.0.0" },
    ...over,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

function installFetch(state: FetchState) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("data.jsdelivr.com")) {
      return jsonResponse({ version: state.latestVersion });
    }
    if (url.endsWith("/extension.json")) {
      const base = url.replace(/\/extension\.json$/, "");
      const m = state.manifests[base];
      return m ? jsonResponse(m) : jsonResponse(null, 404);
    }
    return jsonResponse(null, 404);
  }) as unknown as typeof fetch;
}

function base(version: string) {
  return `https://cdn.jsdelivr.net/npm/acme-test@${version}`;
}

async function mountProvider(): Promise<Ctx> {
  let ctx: Ctx | null = null;
  function Capture() {
    ctx = useExtensionContext();
    return null;
  }
  await act(async () => {
    render(
      <ExtensionManagerProviderInner>
        <Capture />
      </ExtensionManagerProviderInner>,
    );
  });
  if (!ctx) throw new Error("context not available");
  return ctx;
}

describe("ExtensionManagerProvider update detection", () => {
  beforeEach(() => {
    localStorage.clear();
    contributionRegistry.clear();
    useInstalledExtensionsStore.getState().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    contributionRegistry.clear();
    useInstalledExtensionsStore.getState().clear();
  });

  it("reports no update when the resolved version is unchanged", async () => {
    const state: FetchState = {
      latestVersion: "1.0.0",
      manifests: { [base("1.0.0")]: manifest({ version: "1.0.0" }) },
    };
    vi.stubGlobal("fetch", installFetch(state));
    const ctx = await mountProvider();

    await act(async () => {
      await ctx.installFromUrl("npm:acme-test@^1");
    });
    expect(await ctx.checkForUpdate("acme.test")).toBeNull();
  });

  it("detects and applies a newer version within range", async () => {
    const state: FetchState = {
      latestVersion: "1.0.0",
      manifests: {
        [base("1.0.0")]: manifest({ version: "1.0.0" }),
        [base("1.5.0")]: manifest({ version: "1.5.0" }),
      },
    };
    vi.stubGlobal("fetch", installFetch(state));
    const ctx = await mountProvider();

    await act(async () => {
      await ctx.installFromUrl("npm:acme-test@^1");
    });

    // A newer release appears within the recorded range.
    state.latestVersion = "1.5.0";
    const update = await ctx.checkForUpdate("acme.test");
    expect(update).toEqual({
      id: "acme.test",
      currentVersion: "1.0.0",
      latestVersion: "1.5.0",
      sourceRef: "npm:acme-test@^1",
    });

    await act(async () => {
      await ctx.updateExtension("acme.test");
    });
    const installed = useInstalledExtensionsStore
      .getState()
      .installed.find((e) => e.id === "acme.test");
    expect(installed?.version).toBe("1.5.0");
    expect(installed?.sourceUrl).toBe(base("1.5.0"));
  });

  it("refuses (non-destructively) to update when the new version requests new capabilities", async () => {
    const state: FetchState = {
      latestVersion: "1.0.0",
      manifests: {
        [base("1.0.0")]: manifest({ version: "1.0.0", capabilities: [] }),
        [base("2.0.0")]: manifest({
          version: "2.0.0",
          capabilities: ["storage"],
        }),
      },
    };
    vi.stubGlobal("fetch", installFetch(state));
    const ctx = await mountProvider();

    await act(async () => {
      await ctx.installFromUrl("npm:acme-test@^1");
    });
    state.latestVersion = "2.0.0";

    await expect(ctx.updateExtension("acme.test")).rejects.toThrow(
      /new permissions/,
    );
    // The running version is untouched.
    const installed = useInstalledExtensionsStore
      .getState()
      .installed.find((e) => e.id === "acme.test");
    expect(installed?.version).toBe("1.0.0");
  });

  it("refuses (non-destructively) to update to a host-incompatible version", async () => {
    const state: FetchState = {
      latestVersion: "1.0.0",
      manifests: {
        [base("1.0.0")]: manifest({ version: "1.0.0" }),
        [base("2.0.0")]: manifest({
          version: "2.0.0",
          engines: { agentCanvas: "^99.0.0" },
        }),
      },
    };
    vi.stubGlobal("fetch", installFetch(state));
    const ctx = await mountProvider();

    await act(async () => {
      await ctx.installFromUrl("npm:acme-test@^1");
    });
    state.latestVersion = "2.0.0";

    await expect(ctx.updateExtension("acme.test")).rejects.toThrow(
      /requires Agent Canvas/,
    );
    const installed = useInstalledExtensionsStore
      .getState()
      .installed.find((e) => e.id === "acme.test");
    expect(installed?.version).toBe("1.0.0");
  });

  it("reports no update channel for url-kind installs", async () => {
    const state: FetchState = {
      latestVersion: "1.0.0",
      manifests: {
        "https://cdn.example.com/ext": manifest({ version: "1.0.0" }),
      },
    };
    vi.stubGlobal("fetch", installFetch(state));
    const ctx = await mountProvider();

    await act(async () => {
      await ctx.installFromUrl("https://cdn.example.com/ext");
    });
    expect(await ctx.checkForUpdate("acme.test")).toBeNull();
  });
});
