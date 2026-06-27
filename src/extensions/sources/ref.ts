/**
 * Extension **source refs**: a compact, distribution-agnostic way to name *which*
 * extension to install and at *what* version, independent of where the bytes live.
 *
 * Supported forms (see `docs/proposals/ui-extensions.md` § distribution):
 * - `npm:<pkg>[@<range>]`         e.g. `npm:@acme/hello@^1` — an npm package (per-package
 *                                 versioning; the natural fit for monorepos)
 * - `gh:<owner>/<repo>[/<subpath>][@<range>]`  e.g. `gh:acme/exts/packages/hello@^1`
 *                                 — a GitHub repo at a tag; the optional `<subpath>`
 *                                 selects one extension inside a monorepo
 * - `https://…` / `http://…`     a raw bundle **directory** URL (dev / self-hosted),
 *                                 served as loose files with correct MIME + CORS
 *
 * A ref with no `<subpath>` resolves to the package/repo root — the zero-config default.
 * The manifest filename is always `extension.json`; the subpath only selects a
 * directory, it is never threaded through the loader.
 *
 * Resolution to a concrete, immutable artifact (and to a `BundleSource`) lives in
 * `resolve.ts`; this module is pure parsing/formatting so it stays trivially testable.
 */

export interface NpmSourceRef {
  kind: "npm";
  /** Package name, including an `@scope/` prefix when scoped. */
  name: string;
  /** Optional semver range/tag; defaults to latest when omitted. */
  range?: string;
}

export interface GithubSourceRef {
  kind: "gh";
  owner: string;
  repo: string;
  /** Optional directory within the repo (for monorepos). */
  subpath?: string;
  /** Optional semver range/tag; defaults to latest when omitted. */
  range?: string;
}

export interface UrlSourceRef {
  kind: "url";
  /** Raw base URL of the bundle directory (no trailing slash). */
  baseUrl: string;
}

export type ExtensionSourceRef = NpmSourceRef | GithubSourceRef | UrlSourceRef;

const NPM_NAME_PATTERN =
  /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseNpmRef(spec: string): NpmSourceRef {
  // Split off an optional `@range`. For scoped packages the leading `@scope` `@` must
  // not be mistaken for the range separator, so search past index 0.
  const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
  const name = at === -1 ? spec : spec.slice(0, at);
  const range = at === -1 ? undefined : spec.slice(at + 1).trim() || undefined;
  if (!NPM_NAME_PATTERN.test(name)) {
    throw new Error(
      `invalid npm extension source "npm:${spec}": expected npm:<package>[@<range>]`,
    );
  }
  return { kind: "npm", name, range };
}

function parseGithubRef(spec: string): GithubSourceRef {
  // `gh:` refs have no leading `@`, so the last `@` (if any, past index 0) is the range.
  const at = spec.lastIndexOf("@");
  const pathPart = at > 0 ? spec.slice(0, at) : spec;
  const range = at > 0 ? spec.slice(at + 1).trim() || undefined : undefined;
  const segments = stripTrailingSlashes(pathPart).split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(
      `invalid GitHub extension source "gh:${spec}": expected gh:<owner>/<repo>[/<subpath>][@<range>]`,
    );
  }
  const [owner, repo, ...rest] = segments;
  return {
    kind: "gh",
    owner,
    repo: repo.replace(/\.git$/, ""),
    subpath: rest.length > 0 ? rest.join("/") : undefined,
    range,
  };
}

/**
 * Parse a source ref string into a structured {@link ExtensionSourceRef}.
 * Throws with actionable guidance on an unrecognized form.
 */
export function parseSourceRef(input: string): ExtensionSourceRef {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("empty extension source");

  if (trimmed.startsWith("npm:")) return parseNpmRef(trimmed.slice(4));
  if (trimmed.startsWith("gh:")) return parseGithubRef(trimmed.slice(3));
  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: "url", baseUrl: stripTrailingSlashes(trimmed) };
  }

  throw new Error(
    `unsupported extension source "${input}": use npm:<package>, ` +
      `gh:<owner>/<repo>[/<subpath>], or an https:// bundle URL`,
  );
}

/** Render a ref back to its canonical string form (for persistence/display). */
export function formatSourceRef(ref: ExtensionSourceRef): string {
  switch (ref.kind) {
    case "npm":
      return `npm:${ref.name}${ref.range ? `@${ref.range}` : ""}`;
    case "gh":
      return `gh:${ref.owner}/${ref.repo}${ref.subpath ? `/${ref.subpath}` : ""}${
        ref.range ? `@${ref.range}` : ""
      }`;
    case "url":
      return ref.baseUrl;
  }
}
