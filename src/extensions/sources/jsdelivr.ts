/**
 * jsDelivr is the acquisition CDN for `npm:` and `gh:` sources. It serves both npm
 * packages and GitHub repos *at a pinned version* with `Access-Control-Allow-Origin: *`,
 * correct MIME types, and immutable caching — exactly what the browser needs to fetch a
 * manifest, dynamically `import()` the worker module, and frame the webview HTML, with
 * no per-author hosting.
 *
 * - Version resolution: `data.jsdelivr.com/v1/packages/{npm,gh}/<name>/resolved`.
 * - File serving:       `cdn.jsdelivr.net/{npm,gh}/<name>@<version>[/<subpath>]`.
 *
 * Keeping these URL conventions in one place means a future swap (another CDN, or a
 * first-party registry) only touches this module.
 */

export const JSDELIVR_CDN = "https://cdn.jsdelivr.net";
export const JSDELIVR_DATA = "https://data.jsdelivr.com/v1";

type FetchLike = typeof fetch;

async function resolveVersion(
  type: "npm" | "gh",
  name: string,
  range: string | undefined,
  fetchImpl: FetchLike,
): Promise<string> {
  // `*` means "latest" for both npm and gh on the resolved endpoint.
  const specifier = range?.trim() || "*";
  const url = `${JSDELIVR_DATA}/packages/${type}/${name}/resolved?specifier=${encodeURIComponent(
    specifier,
  )}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `failed to resolve ${type}:${name}@${specifier}: HTTP ${response.status}`,
    );
  }
  const data = (await response.json()) as { version?: string | null };
  if (typeof data?.version !== "string" || !data.version) {
    throw new Error(`no version of ${type}:${name} satisfies "${specifier}"`);
  }
  return data.version;
}

export function resolveNpmVersion(
  name: string,
  range: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  return resolveVersion("npm", name, range, fetchImpl);
}

export function resolveGithubVersion(
  owner: string,
  repo: string,
  range: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  return resolveVersion("gh", `${owner}/${repo}`, range, fetchImpl);
}

export function npmBaseUrl(name: string, version: string): string {
  return `${JSDELIVR_CDN}/npm/${name}@${version}`;
}

export function githubBaseUrl(
  owner: string,
  repo: string,
  version: string,
  subpath?: string,
): string {
  const base = `${JSDELIVR_CDN}/gh/${owner}/${repo}@${version}`;
  const clean = subpath?.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? `${base}/${clean}` : base;
}
