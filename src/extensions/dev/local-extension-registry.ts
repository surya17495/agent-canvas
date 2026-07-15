/**
 * Runtime registry of **local extension directories** — the Node-only, filesystem-aware
 * half of the local-dev extension workflow. Imported solely by the dev-only Vite
 * middleware (`vite.config.ts`, `apply: "serve"`), so it never enters a production or
 * library build. See `src/extensions/sources/local-path.ts` for the browser half.
 *
 * Design (per the task's two-layer model):
 * - The `/__ext-local/<id>/*` route is fixed at server boot; the `id → resolvedRoot`
 *   map is **request-time state** mutated by the register endpoint, so adding a new
 *   directory takes effect instantly — no server restart.
 * - The registry is an **allowlist** of roots the user explicitly named (this session or
 *   a prior one). It is empty on first boot; there is no "serve any absolute path"
 *   endpoint.
 * - Ids are a deterministic hash of the *resolved* path, so re-registering the same
 *   directory is idempotent and survives restarts (same path → same id → same URL →
 *   nothing to re-add).
 * - Persisted to a small gitignored JSON file so the dev server is disposable but the
 *   registry is durable. On load, every entry is re-validated (expanduser → realpath →
 *   is-dir → confine); entries whose directory no longer exists are silently dropped.
 *
 * Security invariant — **resolve then confine**, on every register AND every file
 * request: `expanduser() → realpath() → assert the fully-resolved path is a directory /
 * is inside a registered root`. We validate the *resolved* path, never the raw string, so
 * `~/../../etc/passwd` (register) and `/__ext-local/<id>/../../secret` (file request)
 * are both rejected.
 */

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/** One registered local extension directory. */
export interface LocalExtensionEntry {
  /** Deterministic id derived from {@link resolvedRoot} (see {@link deriveId}). */
  id: string;
  /** The raw path the user typed (kept for display / re-registration). */
  rawPath: string;
  /** The realpath'd, home-expanded absolute directory the id maps to. */
  resolvedRoot: string;
}

/** Persisted registry file shape. */
interface RegistryFile {
  version: 1;
  entries: LocalExtensionEntry[];
}

/** Length (hex chars) of the id derived from the resolved path. 12 bytes = 24 chars. */
const ID_HEX_LENGTH = 24;

/**
 * Expand a leading `~` / `~/…` to the current user's home directory. Only a leading
 * tilde is expanded (matching the shell + the SDK's `Path.expanduser`); a `~` elsewhere
 * in the path is left verbatim.
 */
export function expandUser(
  inputPath: string,
  home: string = homedir(),
): string {
  if (inputPath === "~") return home;
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return join(home, inputPath.slice(2));
  }
  return inputPath;
}

/** Derive the stable id for a resolved root (idempotent across sessions). */
export function deriveId(resolvedRoot: string): string {
  return createHash("sha256")
    .update(resolvedRoot)
    .digest("hex")
    .slice(0, ID_HEX_LENGTH);
}

/**
 * Resolve a raw local path to an absolute, realpath'd directory root, asserting it exists
 * and is a directory. This is the **resolve** step; confinement happens against the
 * result. Throws with an actionable message on any failure.
 *
 * `home` is injectable for tests so `~` expansion is deterministic without touching the
 * real `$HOME`.
 */
export function resolveRoot(rawPath: string, home: string = homedir()): string {
  const expanded = expandUser(rawPath.trim(), home);
  const absolute = isAbsolute(expanded) ? expanded : resolve(expanded);
  let real: string;
  try {
    // realpath collapses `..` and follows symlinks, so `~/../../etc` becomes `/etc`
    // and is then subject to the is-directory check below — we validate the *resolved*
    // path, never the raw string.
    real = realpathSync(absolute);
  } catch {
    throw new Error(`local extension path does not exist: ${absolute}`);
  }
  if (!statSync(real).isDirectory()) {
    throw new Error(`local extension path is not a directory: ${real}`);
  }
  return real;
}

/**
 * A durable, disposable-server registry of local extension roots. Construct once at
 * server boot with the persistence file path; it loads + re-validates any prior entries.
 */
export class LocalExtensionRegistry {
  private readonly entries = new Map<string, LocalExtensionEntry>();

  private readonly filePath: string;

  private readonly home: string;

  constructor(filePath: string, home: string = homedir()) {
    this.filePath = filePath;
    this.home = home;
    this.loadPersisted();
  }

  /**
   * Register a raw path: resolve + confine, store `{ id → resolvedRoot }`, persist, and
   * return the entry. Idempotent — re-registering the same directory returns the same id.
   */
  register(rawPath: string): LocalExtensionEntry {
    const resolvedRoot = resolveRoot(rawPath, this.home);
    const id = deriveId(resolvedRoot);
    const entry: LocalExtensionEntry = {
      id,
      rawPath: rawPath.trim(),
      resolvedRoot,
    };
    this.entries.set(id, entry);
    this.save();
    return entry;
  }

  /** Look up a registered root by id, or undefined if unknown. */
  lookup(id: string): LocalExtensionEntry | undefined {
    return this.entries.get(id);
  }

  /** All registered entries (for diagnostics / tests). */
  list(): LocalExtensionEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Resolve a requested file (the remainder after `/__ext-local/<id>/`) to an absolute
   * path **confined under the registered root**. This is the **confine** step for file
   * requests: it rejects any path that escapes the root via `..` or symlink. Returns null
   * when the id is unknown or the resolved path escapes the root.
   */
  resolveFileWithinRoot(id: string, requestedPath: string): string | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    const filePath = resolve(entry.resolvedRoot, requestedPath);
    const rel = relative(entry.resolvedRoot, filePath);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      // rel === "" means the request targeted the root directory itself (not a file).
      return null;
    }
    return filePath;
  }

  /**
   * Load persisted entries and re-validate each (expanduser → realpath → is-dir). Entries
   * whose directory no longer exists (or is no longer a directory) are silently dropped;
   * the id is re-derived from the current resolved path so a moved-then-restored dir keeps
   * its id. Tolerant of an absent/corrupt file.
   */
  private loadPersisted(): void {
    let parsed: RegistryFile | null = null;
    try {
      if (!existsSync(this.filePath)) return;
      parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as RegistryFile;
    } catch {
      return;
    }
    if (!parsed || !Array.isArray(parsed.entries)) return;
    let dropped = false;
    for (const stored of parsed.entries) {
      if (typeof stored?.rawPath !== "string") continue;
      try {
        const resolvedRoot = resolveRoot(stored.rawPath, this.home);
        const id = deriveId(resolvedRoot);
        this.entries.set(id, { id, rawPath: stored.rawPath, resolvedRoot });
      } catch {
        // Directory gone / no longer a dir: drop it silently.
        dropped = true;
      }
    }
    // Rewrite the file so stale entries don't linger on disk across restarts.
    if (dropped) this.save();
  }

  private save(): void {
    const file: RegistryFile = { version: 1, entries: this.list() };
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(
        this.filePath,
        `${JSON.stringify(file, null, 2)}\n`,
        "utf8",
      );
    } catch {
      // Best-effort: a read-only cwd shouldn't break in-session registration.
    }
  }
}
