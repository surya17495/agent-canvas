/**
 * Centri fork: single source of truth for the runtime state root.
 *
 * Upstream @openhands/agent-canvas keeps ALL runtime state under
 * `~/.openhands` — the SAME directory vanilla OpenHands uses. For the
 * Centri-branded shell that is a live bug, not a theoretical one: on the U1
 * dev VM the deployed fork and a pre-existing vanilla OpenHands install
 * collided in `~/.openhands` (shared settings.json/secrets.json, shared
 * secret-key.txt encryption key, interleaved conversation state) — the
 * state-dir collision recorded in the centri repo (SPEC §10 cutover).
 *
 * The fork therefore namespaces all of its runtime state under a
 * Centri-owned root (default `~/.centri/canvas`, single source of truth in
 * `config/defaults.json` → `paths.stateRoot`). The directory shape BELOW the
 * root is IDENTICAL to upstream's shape below `~/.openhands` (stateSubdir,
 * conversations, bash_events, automation db, storage, workspaces …), so
 * `docker/entrypoint.sh` and every relative-path relationship are unchanged.
 *
 * Existing env overrides keep working and keep precedence
 * (`OH_CANVAS_SAFE_STATE_DIR`, `OH_PERSISTENCE_DIR`, `OH_SECRET_KEY_PATH`,
 * `OH_SESSION_API_KEY_PATH`, …) — this module only changes the DEFAULTS.
 *
 * Kept in one fork-owned module so an upstream sync only ever touches the
 * import sites (minimal, isolated diff — centri SPEC §10).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Fallback mirrors config/defaults.json `paths.stateRoot`; kept inline so
// this module stays usable even if defaults.json is unreadable (e.g. a
// packaging error) — the logger imports it very early.
const FALLBACK_STATE_ROOT = ".centri/canvas";

/**
 * The HOME-relative state root (POSIX-style, e.g. ".centri/canvas") from
 * config/defaults.json, falling back to the inline default.
 *
 * The defaults.json path is resolved lazily (inside the try) because jsdom
 * test environments give `import.meta.url` an http:// base, which makes
 * `fileURLToPath` throw — those environments simply get the fallback.
 * @returns {string}
 */
function stateRootRelative() {
  try {
    const defaultsJson = fileURLToPath(
      new URL("../config/defaults.json", import.meta.url),
    );
    const defaults = JSON.parse(readFileSync(defaultsJson, "utf-8"));
    return defaults?.paths?.stateRoot || FALLBACK_STATE_ROOT;
  } catch {
    return FALLBACK_STATE_ROOT;
  }
}

/**
 * Absolute Centri-owned state root (default `~/.centri/canvas`). This is the
 * analogue of upstream's `~/.openhands` — the agent-server persistence dir
 * (settings/secrets) and the automation db live directly under it.
 * @returns {string}
 */
export function stateRootDir() {
  return path.join(homedir(), ...stateRootRelative().split("/"));
}

/**
 * Default launcher state dir (`<stateRoot>/agent-canvas`) — the analogue of
 * upstream's `~/.openhands/agent-canvas`. Overridable at the call sites via
 * `OH_CANVAS_SAFE_STATE_DIR`, exactly as before.
 * @returns {string}
 */
export function defaultStateDir() {
  return path.join(stateRootDir(), "agent-canvas");
}

/**
 * Upstream's default state dir (`~/.openhands/agent-canvas`) — referenced
 * only to detect un-migrated legacy state and print a migration hint. The
 * fork never reads or writes it.
 * @returns {string}
 */
export function legacyStateDir() {
  return path.join(homedir(), ".openhands", "agent-canvas");
}

/**
 * One-line migration hint when legacy (upstream-located) state exists but the
 * Centri root has none yet; `null` otherwise. Callers print it at startup.
 * Deliberately NOT an auto-migration: `~/.openhands` may belong to a live
 * vanilla OpenHands install (that is exactly the collision this fixes), so
 * moving data out of it is a human decision.
 * @returns {string | null}
 */
export function legacyStateNotice() {
  if (existsSync(legacyStateDir()) && !existsSync(defaultStateDir())) {
    return (
      `note: found legacy agent-canvas state at ${legacyStateDir()} — ` +
      `Centri Canvas now keeps its state under ${defaultStateDir()} and ` +
      `will start fresh. To keep existing conversations/keys, stop the ` +
      `stack and move it: mv "${legacyStateDir()}" "${defaultStateDir()}" ` +
      `(only if that state belongs to this fork, not to a vanilla ` +
      `OpenHands install).`
    );
  }
  return null;
}
