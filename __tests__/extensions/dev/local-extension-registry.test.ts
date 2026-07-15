// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveId,
  expandUser,
  LocalExtensionRegistry,
  resolveRoot,
} from "#/extensions/dev/local-extension-registry";

let tmp: string;
let home: string;
let extDir: string;
let registryFile: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ext-registry-"));
  home = join(tmp, "home");
  extDir = join(home, "code", "my-ext");
  mkdirSync(extDir, { recursive: true });
  writeFileSync(join(extDir, "extension.json"), '{"id":"acme.hello"}', "utf8");
  registryFile = join(tmp, ".agent-canvas", "dev-extensions.json");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("expandUser", () => {
  it("expands a leading ~ / ~/ but leaves other tildes alone", () => {
    expect(expandUser("~", "/home/jp")).toBe("/home/jp");
    expect(expandUser("~/code", "/home/jp")).toBe("/home/jp/code");
    expect(expandUser("/abs/~/x", "/home/jp")).toBe("/abs/~/x");
  });
});

describe("resolveRoot", () => {
  it("expands ~ and returns the realpath'd directory", () => {
    const resolved = resolveRoot("~/code/my-ext", home);
    // realpathSync may prepend /private on macOS; assert it ends with the dir.
    expect(resolved.endsWith(join("code", "my-ext"))).toBe(true);
  });

  it("resolve-then-confine: ~/../../etc-style escapes resolve to a non-dir/absent and throw", () => {
    // `~/../../nonexistent` resolves under tmp's parent; assert it rejects a missing dir.
    expect(() => resolveRoot("~/../does-not-exist-xyz", home)).toThrow(
      /does not exist/,
    );
  });

  it("throws when the path is a file, not a directory", () => {
    expect(() => resolveRoot("~/code/my-ext/extension.json", home)).toThrow(
      /not a directory/,
    );
  });
});

describe("deriveId", () => {
  it("is deterministic for the same resolved path (idempotent ids)", () => {
    expect(deriveId("/a/b/c")).toBe(deriveId("/a/b/c"));
    expect(deriveId("/a/b/c")).not.toBe(deriveId("/a/b/d"));
  });
});

describe("LocalExtensionRegistry", () => {
  it("registers a directory and looks it up by id (idempotent)", () => {
    const registry = new LocalExtensionRegistry(registryFile, home);
    const first = registry.register("~/code/my-ext");
    const second = registry.register("~/code/my-ext");
    expect(first.id).toBe(second.id);
    expect(registry.list()).toHaveLength(1);
    expect(registry.lookup(first.id)?.resolvedRoot).toBe(first.resolvedRoot);
  });

  it("rejects registering a path that does not exist", () => {
    const registry = new LocalExtensionRegistry(registryFile, home);
    expect(() => registry.register("~/nope")).toThrow(/does not exist/);
  });

  it("confines file requests under the registered root", () => {
    const registry = new LocalExtensionRegistry(registryFile, home);
    const { id, resolvedRoot } = registry.register("~/code/my-ext");
    const ok = registry.resolveFileWithinRoot(id, "extension.json");
    expect(ok).toBe(join(resolvedRoot, "extension.json"));
  });

  it("rejects traversal escapes and unknown ids on file requests", () => {
    const registry = new LocalExtensionRegistry(registryFile, home);
    const { id } = registry.register("~/code/my-ext");
    // /__ext-local/<id>/../../secret style escape.
    expect(registry.resolveFileWithinRoot(id, "../../secret")).toBeNull();
    expect(registry.resolveFileWithinRoot(id, "../extension.json")).toBeNull();
    // The root itself (empty remainder) is not a servable file.
    expect(registry.resolveFileWithinRoot(id, "")).toBeNull();
    // Unknown id.
    expect(
      registry.resolveFileWithinRoot("deadbeef", "extension.json"),
    ).toBeNull();
  });

  it("persists across instances (disposable server, durable registry)", () => {
    const first = new LocalExtensionRegistry(registryFile, home);
    const entry = first.register("~/code/my-ext");
    // A fresh instance (simulating a restart) re-validates and restores by id.
    const second = new LocalExtensionRegistry(registryFile, home);
    expect(second.lookup(entry.id)?.resolvedRoot).toBe(entry.resolvedRoot);
  });

  it("silently drops persisted entries whose directory no longer exists", () => {
    const first = new LocalExtensionRegistry(registryFile, home);
    const entry = first.register("~/code/my-ext");
    rmSync(extDir, { recursive: true, force: true });
    const second = new LocalExtensionRegistry(registryFile, home);
    expect(second.lookup(entry.id)).toBeUndefined();
    expect(second.list()).toHaveLength(0);
  });
});
