import { describe, it, expect, vi } from "vitest";
import { resolveSource, toBundleSource } from "#/extensions/sources/resolve";

function mockResolvedFetch(version: string) {
  return vi.fn(
    async (url: string | URL) =>
      new Response(JSON.stringify({ version }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

describe("resolveSource", () => {
  it("resolves an npm ref to a pinned jsDelivr base URL", async () => {
    const fetchImpl = mockResolvedFetch("1.4.2");
    const descriptor = await resolveSource("npm:@acme/hello@^1", fetchImpl);

    expect(descriptor).toEqual({
      sourceRef: "npm:@acme/hello@^1",
      kind: "npm",
      version: "1.4.2",
      baseUrl: "https://cdn.jsdelivr.net/npm/@acme/hello@1.4.2",
      format: "dir",
    });
    const calledUrl = String(
      (fetchImpl as never as { mock: { calls: string[][] } }).mock.calls[0][0],
    );
    expect(calledUrl).toContain(
      "data.jsdelivr.com/v1/packages/npm/@acme/hello/resolved",
    );
    expect(calledUrl).toContain("specifier=%5E1");
  });

  it("resolves a gh monorepo ref, pinning the tag and keeping the subpath", async () => {
    const fetchImpl = mockResolvedFetch("2.0.0");
    const descriptor = await resolveSource(
      "gh:acme/exts/packages/hello@^2",
      fetchImpl,
    );

    expect(descriptor).toEqual({
      sourceRef: "gh:acme/exts/packages/hello@^2",
      kind: "gh",
      version: "2.0.0",
      baseUrl: "https://cdn.jsdelivr.net/gh/acme/exts@2.0.0/packages/hello",
      format: "dir",
    });
    const calledUrl = String(
      (fetchImpl as never as { mock: { calls: string[][] } }).mock.calls[0][0],
    );
    expect(calledUrl).toContain("packages/gh/acme/exts/resolved");
  });

  it("defaults to latest (specifier=*) when no range is given", async () => {
    const fetchImpl = mockResolvedFetch("9.9.9");
    await resolveSource("npm:hello", fetchImpl);
    const calledUrl = String(
      (fetchImpl as never as { mock: { calls: string[][] } }).mock.calls[0][0],
    );
    expect(calledUrl).toContain("specifier=*");
  });

  it("passes raw url sources through without a network call", async () => {
    const fetchImpl = vi.fn();
    const descriptor = await resolveSource(
      "https://cdn.example.com/ext/",
      fetchImpl as unknown as typeof fetch,
    );
    expect(descriptor).toEqual({
      sourceRef: "https://cdn.example.com/ext",
      kind: "url",
      baseUrl: "https://cdn.example.com/ext",
      format: "dir",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces a clear error when no version satisfies the range", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ version: null }), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(resolveSource("npm:hello@^99", fetchImpl)).rejects.toThrow(
      /no version of npm:hello satisfies/,
    );
  });
});

describe("toBundleSource", () => {
  it("builds an HTTP bundle source rooted at the descriptor base URL", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(
        "https://cdn.jsdelivr.net/npm/hello@1.0.0/extension.json",
      );
      return new Response(JSON.stringify({ id: "acme.hello" }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const source = toBundleSource({
        sourceRef: "npm:hello",
        kind: "npm",
        version: "1.0.0",
        baseUrl: "https://cdn.jsdelivr.net/npm/hello@1.0.0",
        format: "dir",
      });
      await expect(source.readManifest()).resolves.toEqual({
        id: "acme.hello",
      });
      await expect(source.assetUrl("main.js")).resolves.toBe(
        "https://cdn.jsdelivr.net/npm/hello@1.0.0/main.js",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
