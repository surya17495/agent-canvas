/**
 * Host-compatibility checking for an extension's `engines.agentCanvas` range.
 *
 * `AGENT_CANVAS_HOST_VERSION` is the **extension host API** version — the contract
 * extensions target — deliberately independent of the app's `package.json` version, so
 * the host API can be versioned on its own cadence. Bump its major when a breaking
 * change to the manifest/host API ships.
 *
 * A small hand-rolled semver-range satisfier keeps the extension subsystem
 * dependency-free (matching the hand-rolled manifest validator). It supports the
 * operators that realistically appear in an `engines` range: `*`/`x`, exact, `^`, `~`,
 * the comparators `>= > <= <`, and whitespace-joined `AND` ranges (e.g. `>=1.2 <2`).
 */

export const AGENT_CANVAS_HOST_VERSION = "1.0.0";

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(value: string): SemverParts | null {
  // Drop a leading `v` and any prerelease/build metadata; we compare release numbers.
  const core = value.trim().replace(/^v/i, "").split(/[-+]/, 1)[0];
  const segments = core.split(".");
  if (segments.length === 0 || segments.length > 3) return null;
  const nums = segments.map((s) => Number(s));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return { major: nums[0], minor: nums[1] ?? 0, patch: nums[2] ?? 0 };
}

function compare(a: SemverParts, b: SemverParts): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** `[from, to)` half-open range used to express `^`, `~`, and x-ranges. */
function inRange(v: SemverParts, from: SemverParts, to: SemverParts): boolean {
  return compare(v, from) >= 0 && compare(v, to) < 0;
}

function caretUpper(p: SemverParts): SemverParts {
  if (p.major > 0) return { major: p.major + 1, minor: 0, patch: 0 };
  if (p.minor > 0) return { major: 0, minor: p.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: p.patch + 1 };
}

function tildeUpper(p: SemverParts): SemverParts {
  return { major: p.major, minor: p.minor + 1, patch: 0 };
}

/** Resolve an x-range token (`*`, `1.x`, `1.2.x`) to a `[from, to)` window. */
function xRangeWindow(
  token: string,
): { from: SemverParts; to: SemverParts } | null {
  const segments = token.split(".");
  const wildcardAt = segments.findIndex(
    (s) => s === "x" || s === "X" || s === "*",
  );
  if (wildcardAt === -1) return null;
  const nums = segments
    .slice(0, wildcardAt)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n));
  if (nums.length !== wildcardAt) return null;
  if (wildcardAt === 0) {
    return {
      from: { major: 0, minor: 0, patch: 0 },
      to: { major: Infinity, minor: 0, patch: 0 },
    };
  }
  const from: SemverParts = {
    major: nums[0],
    minor: nums[1] ?? 0,
    patch: 0,
  };
  const to =
    wildcardAt === 1
      ? { major: nums[0] + 1, minor: 0, patch: 0 }
      : { major: nums[0], minor: nums[1] + 1, patch: 0 };
  return { from, to };
}

function satisfiesToken(version: SemverParts, token: string): boolean {
  const t = token.trim();
  if (t === "" || t === "*" || t === "x" || t === "X") return true;

  const xr = xRangeWindow(t);
  if (xr) return inRange(version, xr.from, xr.to);

  if (t.startsWith("^")) {
    const base = parseVersion(t.slice(1));
    return base ? inRange(version, base, caretUpper(base)) : false;
  }
  if (t.startsWith("~")) {
    const base = parseVersion(t.slice(1));
    return base ? inRange(version, base, tildeUpper(base)) : false;
  }

  const m = t.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  if (!m) return false;
  const op = m[1] ?? "=";
  const base = parseVersion(m[2]);
  if (!base) return false;
  const cmp = compare(version, base);
  switch (op) {
    case ">=":
      return cmp >= 0;
    case ">":
      return cmp > 0;
    case "<=":
      return cmp <= 0;
    case "<":
      return cmp < 0;
    default:
      return cmp === 0;
  }
}

/**
 * Returns true if `hostVersion` satisfies the semver `range`. Unparseable ranges return
 * false (fail closed — an incompatible/garbage `engines` value must not silently pass).
 */
export function satisfiesHostRange(
  range: string,
  hostVersion: string = AGENT_CANVAS_HOST_VERSION,
): boolean {
  const version = parseVersion(hostVersion);
  if (!version) return false;
  const tokens = range.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => satisfiesToken(version, token));
}

/**
 * Throw a descriptive error if the extension's `engines.agentCanvas` range is not
 * satisfied by the current host. Used at the install/consent boundary.
 */
export function assertHostCompatible(
  engineRange: string,
  hostVersion: string = AGENT_CANVAS_HOST_VERSION,
): void {
  if (!satisfiesHostRange(engineRange, hostVersion)) {
    throw new Error(
      `extension requires Agent Canvas "${engineRange}", but this host is ${hostVersion}`,
    );
  }
}
