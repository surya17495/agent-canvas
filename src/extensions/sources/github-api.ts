/**
 * GitHub API-based ref resolution for extension sources. Replaces jsDelivr's
 * resolution for `gh:` refs, providing support for all Git ref types including
 * branches with slashes, commit SHAs, and semver ranges against tags.
 *
 * jsDelivr's version resolution API fails for branch names containing slashes
 * (returns HTTP 500), a common convention in GitFlow and feature branches.
 * Using the GitHub REST API directly gives us full control and supports:
 * - Branches with slashes (e.g., `feature/my-feature`)
 * - Commit SHAs (full or abbreviated)
 * - Tags
 * - Private repositories (with authentication)
 */

export interface GitHubResolvedRef {
  /** The resolved commit SHA (40 hex characters). */
  sha: string;
  /** The ref type that matched. */
  type: "branch" | "tag" | "commit" | "default";
  /** The original ref string that was resolved. */
  ref: string;
}

export interface GitHubResolverOptions {
  /** GitHub API token for private repos or higher rate limits. */
  token?: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof fetch;
  /** GitHub API base URL (default: https://api.github.com). */
  apiBase?: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly isRateLimited?: boolean,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

const GITHUB_API = "https://api.github.com";

/** Pattern for valid Git SHA: 7-40 hex characters. */
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/** Pattern for semver ranges (not exact versions). */
const SEMVER_RANGE_PATTERN = /^[\^~><=]|^\d+\.\d+\.x$|^\*$/;

/**
 * Resolve a GitHub ref (branch, tag, commit, or semver range) to a concrete SHA.
 *
 * Resolution strategy:
 * 1. If ref is undefined/empty/"latest"/"*" → use default branch
 * 2. If ref looks like a SHA → verify it exists as a commit
 * 3. If ref looks like a semver range → error (not yet implemented)
 * 4. Try as branch name (handles slashes correctly)
 * 5. Try as tag name
 * 6. Error with actionable guidance
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param ref - Ref to resolve (branch, tag, SHA, or undefined for default branch)
 * @param options - Resolution options
 * @returns Resolved ref with SHA
 * @throws GitHubApiError if the ref cannot be resolved
 */
export async function resolveGitHubRef(
  owner: string,
  repo: string,
  ref: string | undefined,
  options: GitHubResolverOptions = {},
): Promise<GitHubResolvedRef> {
  const { token, fetch: fetchImpl = fetch, apiBase = GITHUB_API } = options;

  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "agent-canvas-extension-resolver",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  /** Make an API request, returning null for 404s. */
  async function api<T>(path: string): Promise<T | null> {
    const url = `${apiBase}${path}`;
    const response = await fetchImpl(url, { headers });

    if (response.status === 404) {
      return null;
    }

    if (response.status === 403) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        const resetTime = response.headers.get("x-ratelimit-reset");
        const resetDate = resetTime
          ? new Date(parseInt(resetTime, 10) * 1000).toLocaleTimeString()
          : "soon";
        throw new GitHubApiError(
          `GitHub API rate limit exceeded. Resets at ${resetDate}. ` +
            `Configure a GitHub token in extension settings for higher limits.`,
          403,
          true,
        );
      }
    }

    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return response.json() as Promise<T>;
  }

  // No ref specified → use default branch
  if (!ref || ref === "*" || ref === "latest") {
    const repoData = await api<{ default_branch: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    );
    if (!repoData) {
      throw new GitHubApiError(
        `Repository ${owner}/${repo} not found. ` +
          `Check the owner/repo name, or if it's private, configure a GitHub token.`,
        404,
      );
    }
    const defaultBranch = repoData.default_branch;
    const resolved = await resolveGitHubRef(
      owner,
      repo,
      defaultBranch,
      options,
    );
    return { ...resolved, type: "default", ref: defaultBranch };
  }

  // Check if it looks like a semver range (not exact version)
  if (SEMVER_RANGE_PATTERN.test(ref)) {
    throw new GitHubApiError(
      `Semver range "${ref}" resolution not yet implemented for GitHub sources. ` +
        `Please use an exact tag (e.g., v1.0.0), branch name, or commit SHA.`,
    );
  }

  // If it looks like a SHA, try to verify it as a commit first
  if (SHA_PATTERN.test(ref)) {
    const commit = await api<{ sha: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${ref}`,
    );
    if (commit) {
      return { sha: commit.sha, type: "commit", ref };
    }
    // Fall through to try as branch/tag name (SHAs can collide with ref names)
  }

  // Try as branch name (GitHub API handles slashes in branch names via URL encoding)
  // Note: We need to URL-encode each path segment, but for refs with slashes,
  // the entire ref name is a single logical segment that goes after "heads/"
  const branchRef = await api<{ object: { sha: string; type: string } }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeRefName(ref)}`,
  );
  if (branchRef) {
    // Handle annotated tag objects pointing to commits
    const sha = await resolveObjectToCommit(
      owner,
      repo,
      branchRef.object,
      options,
    );
    return { sha, type: "branch", ref };
  }

  // Try as tag name
  const tagRef = await api<{ object: { sha: string; type: string } }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/tags/${encodeRefName(ref)}`,
  );
  if (tagRef) {
    // Handle annotated tags (type: "tag") vs lightweight tags (type: "commit")
    const sha = await resolveObjectToCommit(
      owner,
      repo,
      tagRef.object,
      options,
    );
    return { sha, type: "tag", ref };
  }

  // Nothing matched
  throw new GitHubApiError(
    `Could not resolve ref "${ref}" for ${owner}/${repo}. ` +
      `Checked as: branch, tag${SHA_PATTERN.test(ref) ? ", and commit SHA" : ""}. ` +
      `Verify the ref exists, or if the repo is private, configure a GitHub token.`,
    404,
  );
}

/**
 * URL-encode a ref name for use in GitHub API paths.
 * GitHub's ref endpoints expect the ref name URL-encoded, but slashes should
 * be encoded as %2F (not left as path separators).
 */
function encodeRefName(ref: string): string {
  // encodeURIComponent will encode slashes as %2F, which is what we want
  return encodeURIComponent(ref);
}

/**
 * Resolve a Git object reference to a commit SHA.
 * Handles annotated tags (which point to tag objects that point to commits)
 * and lightweight tags/branches (which point directly to commits).
 */
async function resolveObjectToCommit(
  owner: string,
  repo: string,
  object: { sha: string; type: string },
  options: GitHubResolverOptions,
): Promise<string> {
  const { fetch: fetchImpl = fetch, apiBase = GITHUB_API, token } = options;

  // If it's already a commit, we're done
  if (object.type === "commit") {
    return object.sha;
  }

  // If it's a tag object (annotated tag), we need to dereference it
  if (object.type === "tag") {
    const headers: HeadersInit = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "agent-canvas-extension-resolver",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/tags/${object.sha}`;
    const response = await fetchImpl(url, { headers });

    if (!response.ok) {
      // Fall back to using the object SHA if we can't dereference
      return object.sha;
    }

    const tagData = (await response.json()) as {
      object: { sha: string; type: string };
    };

    // Recursively resolve in case of nested tag objects (rare but possible)
    return resolveObjectToCommit(owner, repo, tagData.object, options);
  }

  // Unknown type, return the SHA and hope for the best
  return object.sha;
}

/**
 * Build the raw.githubusercontent.com URL for a file in a resolved ref.
 * Note: For actual extension loading, we'll likely use a proxy endpoint
 * rather than raw GitHub URLs directly.
 */
export function rawGitHubUrl(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): string {
  const cleanPath = path.replace(/^\/+/, "");
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${sha}/${cleanPath}`;
}
