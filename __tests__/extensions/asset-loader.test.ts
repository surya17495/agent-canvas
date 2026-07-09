import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetLoader } from "#/extensions/asset-loader";

describe("AssetLoader", () => {
  let loader: AssetLoader;
  let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>();
    loader = new AssetLoader({ fetch: mockFetch });
  });

  afterEach(() => {
    loader.dispose();
  });

  describe("loadAsset", () => {
    it("loads assets from GitHub sources", async () => {
      const content = new TextEncoder().encode('{"test": true}');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      } as unknown as Response);

      const asset = await loader.loadAsset(
        "gh:owner/repo@abc1234",
        "extension.json",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/owner/repo/abc1234/extension.json",
        expect.objectContaining({
          headers: { Accept: "application/octet-stream" },
        }),
      );
      expect(asset.mimeType).toBe("application/json");
      expect(asset.blobUrl).toMatch(/^blob:/);
    });

    it("handles sources with subpaths", async () => {
      const content = new TextEncoder().encode("test");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      } as unknown as Response);

      await loader.loadAsset(
        "gh:owner/repo/packages/ext@abc1234",
        "panel.html",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/owner/repo/packages/ext/abc1234/panel.html",
        expect.any(Object),
      );
    });

    it("adds authorization header when GitHub token is provided", async () => {
      const tokenFetch = vi.fn<typeof fetch>();
      const loaderWithToken = new AssetLoader({
        fetch: tokenFetch,
        githubToken: "test-token",
      });

      const content = new TextEncoder().encode("test");
      tokenFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      } as unknown as Response);

      await loaderWithToken.loadAsset("gh:owner/repo@abc1234", "file.js");

      expect(tokenFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );

      loaderWithToken.dispose();
    });

    it("caches SHA-pinned assets", async () => {
      const content = new TextEncoder().encode("cached content");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      } as unknown as Response);

      // Use a 40-char SHA to trigger immutable caching
      const source = "gh:owner/repo@abc1234abc1234abc1234abc1234abc1234abc1";
      await loader.loadAsset(source, "file.js");
      await loader.loadAsset(source, "file.js");

      // Should only fetch once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(loader.isCached(source, "file.js")).toBe(true);
    });

    it("throws on fetch errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(
        loader.loadAsset("gh:owner/repo@abc1234", "missing.json"),
      ).rejects.toThrow("Failed to load asset: 404 missing.json");
    });

    it("throws on invalid source format", async () => {
      await expect(
        loader.loadAsset("invalid-source", "file.js"),
      ).rejects.toThrow("Invalid GitHub source: invalid-source");
    });
  });

  describe("getMimeType", () => {
    it("returns correct MIME types for known extensions", async () => {
      const testCases = [
        { file: "app.js", expected: "application/javascript" },
        { file: "app.mjs", expected: "application/javascript" },
        { file: "data.json", expected: "application/json" },
        { file: "page.html", expected: "text/html" },
        { file: "page.htm", expected: "text/html" },
        { file: "style.css", expected: "text/css" },
        { file: "icon.svg", expected: "image/svg+xml" },
        { file: "photo.png", expected: "image/png" },
        { file: "photo.jpg", expected: "image/jpeg" },
        { file: "photo.jpeg", expected: "image/jpeg" },
        { file: "animation.gif", expected: "image/gif" },
        { file: "photo.webp", expected: "image/webp" },
      ];

      for (const { file, expected } of testCases) {
        const content = new TextEncoder().encode("test");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(content.buffer),
        } as unknown as Response);

        const asset = await loader.loadAsset("gh:owner/repo@abc1234", file);
        expect(asset.mimeType).toBe(expected);
      }
    });

    it("returns octet-stream for unknown extensions", async () => {
      const content = new TextEncoder().encode("test");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      } as unknown as Response);

      const asset = await loader.loadAsset("gh:owner/repo@abc1234", "file.xyz");
      expect(asset.mimeType).toBe("application/octet-stream");
    });
  });

  describe("getBlobUrl", () => {
    it("returns a blob URL for the asset", async () => {
      const content = new TextEncoder().encode("test content");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      } as unknown as Response);

      const url = await loader.getBlobUrl("gh:owner/repo@abc1234", "file.js");
      expect(url).toMatch(/^blob:/);
    });
  });

  describe("disposeExtension", () => {
    it("removes cached assets for the extension", async () => {
      const content = new TextEncoder().encode("test");
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(content.buffer),
      } as unknown as Response);

      // Use a 40-char SHA to trigger immutable caching
      const source = "gh:owner/repo@abc1234abc1234abc1234abc1234abc1234abc1";
      await loader.loadAsset(source, "file1.js");
      await loader.loadAsset(source, "file2.js");

      expect(loader.getCacheStats().entries).toBe(2);

      loader.disposeExtension(source);

      expect(loader.getCacheStats().entries).toBe(0);
    });
  });
});
