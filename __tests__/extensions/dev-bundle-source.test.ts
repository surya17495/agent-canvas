import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpBundleSource } from "#/extensions/dev-bundle-source";

describe("createHttpBundleSource", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches and parses the manifest", async () => {
    const manifest = { id: "acme.hello" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => manifest,
    });
    vi.stubGlobal("fetch", fetchMock);

    const source = createHttpBundleSource("/__extensions/hello-sidebar");
    await expect(source.readManifest()).resolves.toEqual(manifest);
    expect(fetchMock).toHaveBeenCalledWith(
      "/__extensions/hello-sidebar/extension.json",
    );
  });

  it("throws when the manifest request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const source = createHttpBundleSource("/__extensions/missing");
    await expect(source.readManifest()).rejects.toThrow(/HTTP 404/);
  });

  it("resolves asset URLs against the base, tolerating slashes", async () => {
    const source = createHttpBundleSource("/__extensions/hello-sidebar/");
    await expect(source.assetUrl("panel.html")).resolves.toBe(
      "/__extensions/hello-sidebar/panel.html",
    );
    await expect(source.assetUrl("/icon.svg")).resolves.toBe(
      "/__extensions/hello-sidebar/icon.svg",
    );
  });
});
