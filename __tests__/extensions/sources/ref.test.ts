import { describe, it, expect } from "vitest";
import {
  formatSourceRef,
  parseSourceRef,
  type ExtensionSourceRef,
} from "#/extensions/sources/ref";

describe("parseSourceRef", () => {
  it("parses an unscoped npm ref with a range", () => {
    expect(parseSourceRef("npm:hello-ext@^1.2.0")).toEqual({
      kind: "npm",
      name: "hello-ext",
      range: "^1.2.0",
    });
  });

  it("parses a scoped npm ref, distinguishing the scope @ from the range @", () => {
    expect(parseSourceRef("npm:@acme/hello@^1")).toEqual({
      kind: "npm",
      name: "@acme/hello",
      range: "^1",
    });
    expect(parseSourceRef("npm:@acme/hello")).toEqual({
      kind: "npm",
      name: "@acme/hello",
      range: undefined,
    });
  });

  it("parses a gh ref at repo root (zero-config default)", () => {
    expect(parseSourceRef("gh:acme/hello")).toEqual({
      kind: "gh",
      owner: "acme",
      repo: "hello",
      subpath: undefined,
      range: undefined,
    });
  });

  it("parses a gh monorepo ref with a subpath and range", () => {
    expect(parseSourceRef("gh:acme/exts/packages/hello@^1.0.0")).toEqual({
      kind: "gh",
      owner: "acme",
      repo: "exts",
      subpath: "packages/hello",
      range: "^1.0.0",
    });
  });

  it("strips a .git suffix and trailing slashes on gh repos", () => {
    expect(parseSourceRef("gh:acme/hello.git")).toMatchObject({
      repo: "hello",
    });
    expect(parseSourceRef("gh:acme/exts/sub/@^1")).toMatchObject({
      subpath: "sub",
      range: "^1",
    });
  });

  it("parses an https bundle directory URL and strips trailing slashes", () => {
    expect(parseSourceRef("https://cdn.example.com/ext/")).toEqual({
      kind: "url",
      baseUrl: "https://cdn.example.com/ext",
    });
  });

  it("rejects empty, bare, and malformed refs", () => {
    expect(() => parseSourceRef("   ")).toThrow(/empty/);
    expect(() => parseSourceRef("acme/hello")).toThrow(/unsupported/);
    expect(() => parseSourceRef("gh:acme")).toThrow(/expected gh:/);
    expect(() => parseSourceRef("npm:@bad@scope/x")).toThrow(/invalid npm/);
  });
});

describe("formatSourceRef round-trips", () => {
  const cases: ExtensionSourceRef[] = [
    { kind: "npm", name: "@acme/hello", range: "^1" },
    { kind: "npm", name: "hello", range: undefined },
    { kind: "gh", owner: "acme", repo: "hello", range: undefined },
    {
      kind: "gh",
      owner: "acme",
      repo: "exts",
      subpath: "packages/hello",
      range: "^1.0.0",
    },
    { kind: "url", baseUrl: "https://cdn.example.com/ext" },
  ];

  it.each(cases)("re-parses formatted ref %o", (ref) => {
    expect(parseSourceRef(formatSourceRef(ref))).toEqual(ref);
  });
});
