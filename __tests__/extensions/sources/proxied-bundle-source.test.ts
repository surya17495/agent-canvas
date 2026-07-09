import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProxiedBundleSource } from "#/extensions/sources/proxied-bundle-source";

describe("createProxiedBundleSource", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("readManifest", () => {
    it("fetches manifest through proxy endpoint", async () => {
      const manifest = { id: "test.extension", name: "Test", version: "1.0.0" };
      const fetchImpl = vi.fn(async (url: string | URL) => {
        const urlStr = String(url);
        expect(urlStr).toContain("/api/extensions/proxy");
        expect(urlStr).toContain("source=gh%3Aowner%2Frepo%40abc123");
        expect(urlStr).toContain("file=extension.json");
        return new Response(JSON.stringify(manifest), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchImpl);

      const source = createProxiedBundleSource("gh:owner/repo@abc123");
      const result = await source.readManifest();

      expect(result).toEqual(manifest);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("includes subpath in proxy source ref", async () => {
      const manifest = { id: "mono.extension", name: "Mono", version: "2.0.0" };
      const fetchImpl = vi.fn(async (url: string | URL) => {
        const urlStr = String(url);
        expect(urlStr).toContain(
          "source=gh%3Aowner%2Frepo%2Fpackages%2Fext%40sha789",
        );
        return new Response(JSON.stringify(manifest), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchImpl);

      const source = createProxiedBundleSource(
        "gh:owner/repo/packages/ext@sha789",
      );
      await source.readManifest();

      expect(fetchImpl).toHaveBeenCalled();
    });

    it("throws clear error for 404 (not found)", async () => {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
      vi.stubGlobal("fetch", fetchImpl);

      const source = createProxiedBundleSource("gh:owner/missing@abc");
      await expect(source.readManifest()).rejects.toThrow(
        /manifest not found.*gh:owner\/missing@abc/i,
      );
    });

    it("throws clear error for 502 (upstream failure)", async () => {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 502 }));
      vi.stubGlobal("fetch", fetchImpl);

      const source = createProxiedBundleSource("gh:owner/repo@abc");
      await expect(source.readManifest()).rejects.toThrow(
        /fetch extension from upstream/i,
      );
    });

    it("throws clear error for 400 (bad request)", async () => {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 400 }));
      vi.stubGlobal("fetch", fetchImpl);

      const source = createProxiedBundleSource("invalid:source");
      await expect(source.readManifest()).rejects.toThrow(
        /invalid extension source/i,
      );
    });

    it("throws generic error for other HTTP failures", async () => {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
      vi.stubGlobal("fetch", fetchImpl);

      const source = createProxiedBundleSource("gh:owner/repo@abc");
      await expect(source.readManifest()).rejects.toThrow(/HTTP 500/);
    });
  });

  describe("assetUrl", () => {
    it("returns proxy URL for assets", async () => {
      const source = createProxiedBundleSource("gh:owner/repo@abc123");
      const url = await source.assetUrl("panel.html");

      expect(url).toContain("/api/extensions/proxy");
      expect(url).toContain("source=gh%3Aowner%2Frepo%40abc123");
      expect(url).toContain("file=panel.html");
    });

    it("strips leading slashes from file paths", async () => {
      const source = createProxiedBundleSource("gh:owner/repo@abc");
      const url = await source.assetUrl("/main.js");

      // Should have file=main.js not file=%2Fmain.js (the leading slash is stripped)
      expect(url).toContain("file=main.js");
      // The file parameter shouldn't start with an encoded slash
      expect(url).not.toContain("file=%2F");
    });

    it("handles nested paths", async () => {
      const source = createProxiedBundleSource("gh:owner/repo@abc");
      const url = await source.assetUrl("assets/icons/icon.svg");

      expect(url).toContain("file=assets%2Ficons%2Ficon.svg");
    });

    it("handles special characters in file names", async () => {
      const source = createProxiedBundleSource("gh:owner/repo@abc");
      const url = await source.assetUrl("file with spaces.js");

      expect(url).toContain("file=file+with+spaces.js");
    });
  });

  describe("URL construction", () => {
    it("correctly encodes source with special characters", async () => {
      const source = createProxiedBundleSource(
        "gh:my-org/my-repo/path/to/ext@feature/branch",
      );
      const url = await source.assetUrl("extension.json");

      // The @ and / should be encoded
      expect(url).toContain(
        "source=gh%3Amy-org%2Fmy-repo%2Fpath%2Fto%2Fext%40feature%2Fbranch",
      );
    });

    it("builds correct proxy URL format", async () => {
      const source = createProxiedBundleSource("gh:test/repo@sha123");
      const url = await source.assetUrl("style.css");

      // Should be: /api/extensions/proxy?source=..&file=..
      expect(url).toMatch(/^\/api\/extensions\/proxy\?/);
      expect(url).toContain("source=");
      expect(url).toContain("file=");
    });
  });
});
