import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveGitHubRef,
  rawGitHubUrl,
  GitHubApiError,
} from "#/extensions/sources/github-api";

/**
 * Create a mock fetch that returns predefined responses based on URL patterns.
 */
function createMockFetch(
  responses: Map<
    string | RegExp,
    { status: number; body?: unknown; headers?: Record<string, string> }
  >,
) {
  return vi.fn(async (url: string | URL) => {
    const urlStr = String(url);
    for (const [pattern, response] of responses) {
      const matches =
        typeof pattern === "string"
          ? urlStr.includes(pattern)
          : pattern.test(urlStr);
      if (matches) {
        return new Response(
          response.body !== undefined ? JSON.stringify(response.body) : null,
          {
            status: response.status,
            headers: {
              "content-type": "application/json",
              ...response.headers,
            },
          },
        );
      }
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

describe("resolveGitHubRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("default branch resolution", () => {
    it("resolves to the default branch when ref is undefined", async () => {
      // Use a more specific URL pattern to avoid conflicts
      const mockFetch = vi.fn(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/repos/owner/repo")) {
          return new Response(JSON.stringify({ default_branch: "main" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (urlStr.includes("/git/ref/heads/main")) {
          return new Response(
            JSON.stringify({ object: { sha: "abc123def456", type: "commit" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(null, { status: 404 });
      }) as unknown as typeof fetch;

      const result = await resolveGitHubRef("owner", "repo", undefined, {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: "abc123def456",
        type: "default",
        ref: "main",
      });
    });

    it("resolves to the default branch when ref is '*'", async () => {
      const mockFetch = vi.fn(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/repos/owner/repo")) {
          return new Response(JSON.stringify({ default_branch: "develop" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (urlStr.includes("/git/ref/heads/develop")) {
          return new Response(
            JSON.stringify({ object: { sha: "def456abc789", type: "commit" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(null, { status: 404 });
      }) as unknown as typeof fetch;

      const result = await resolveGitHubRef("owner", "repo", "*", {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: "def456abc789",
        type: "default",
        ref: "develop",
      });
    });

    it("resolves to the default branch when ref is 'latest'", async () => {
      const mockFetch = vi.fn(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/repos/owner/repo")) {
          return new Response(JSON.stringify({ default_branch: "master" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (urlStr.includes("/git/ref/heads/master")) {
          return new Response(
            JSON.stringify({ object: { sha: "789abc123def", type: "commit" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(null, { status: 404 });
      }) as unknown as typeof fetch;

      const result = await resolveGitHubRef("owner", "repo", "latest", {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: "789abc123def",
        type: "default",
        ref: "master",
      });
    });
  });

  describe("branch resolution", () => {
    it("resolves a simple branch name", async () => {
      const mockFetch = createMockFetch(
        new Map([
          [
            "/git/ref/heads/main",
            { status: 200, body: { object: { sha: "1234567890abcdef", type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", "main", {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: "1234567890abcdef",
        type: "branch",
        ref: "main",
      });
    });

    it("resolves a branch with a single slash", async () => {
      const mockFetch = createMockFetch(
        new Map([
          [
            "/git/ref/heads/feature%2Fmy-feature",
            { status: 200, body: { object: { sha: "featuresha123", type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", "feature/my-feature", {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: "featuresha123",
        type: "branch",
        ref: "feature/my-feature",
      });
    });

    it("resolves a branch with multiple slashes", async () => {
      const mockFetch = createMockFetch(
        new Map([
          [
            "/git/ref/heads/feature%2Fui%2Fextensions",
            { status: 200, body: { object: { sha: "multiplesha456", type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef(
        "owner",
        "repo",
        "feature/ui/extensions",
        { fetch: mockFetch },
      );

      expect(result).toEqual({
        sha: "multiplesha456",
        type: "branch",
        ref: "feature/ui/extensions",
      });
    });

    it("resolves a branch with special characters", async () => {
      const mockFetch = createMockFetch(
        new Map([
          [
            "/git/ref/heads/fix%2Fbug-123%40urgent",
            { status: 200, body: { object: { sha: "specialsha789", type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef(
        "owner",
        "repo",
        "fix/bug-123@urgent",
        { fetch: mockFetch },
      );

      expect(result).toEqual({
        sha: "specialsha789",
        type: "branch",
        ref: "fix/bug-123@urgent",
      });
    });
  });

  describe("tag resolution", () => {
    it("resolves a simple tag", async () => {
      const mockFetch = createMockFetch(
        new Map([
          ["/git/ref/heads/v1.0.0", { status: 404 }],
          [
            "/git/ref/tags/v1.0.0",
            { status: 200, body: { object: { sha: "tagsha123abc", type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", "v1.0.0", {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: "tagsha123abc",
        type: "tag",
        ref: "v1.0.0",
      });
    });

    it("resolves an annotated tag (dereferences tag object)", async () => {
      const tagObjectSha = "annotatedtagsha123";
      const commitSha = "actualcommitsha456";

      const mockFetch = createMockFetch(
        new Map([
          ["/git/ref/heads/v2.0.0", { status: 404 }],
          [
            "/git/ref/tags/v2.0.0",
            { status: 200, body: { object: { sha: tagObjectSha, type: "tag" } } },
          ],
          [
            `/git/tags/${tagObjectSha}`,
            { status: 200, body: { object: { sha: commitSha, type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", "v2.0.0", {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: commitSha,
        type: "tag",
        ref: "v2.0.0",
      });
    });
  });

  describe("commit SHA resolution", () => {
    it("resolves a full commit SHA (40 characters)", async () => {
      const fullSha = "1234567890abcdef1234567890abcdef12345678";

      const mockFetch = createMockFetch(
        new Map([
          [
            `/git/commits/${fullSha}`,
            { status: 200, body: { sha: fullSha } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", fullSha, {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: fullSha,
        type: "commit",
        ref: fullSha,
      });
    });

    it("resolves an abbreviated commit SHA (7 characters)", async () => {
      const shortSha = "abc123f";
      const fullSha = "abc123fabcdef1234567890abcdef1234567890";

      const mockFetch = createMockFetch(
        new Map([
          [
            `/git/commits/${shortSha}`,
            { status: 200, body: { sha: fullSha } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", shortSha, {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: fullSha,
        type: "commit",
        ref: shortSha,
      });
    });

    it("falls back to branch/tag when SHA doesn't exist", async () => {
      const shaLikeRef = "abcdef1"; // Looks like a SHA but is actually a branch

      const mockFetch = createMockFetch(
        new Map([
          [`/git/commits/${shaLikeRef}`, { status: 404 }],
          [
            `/git/ref/heads/${shaLikeRef}`,
            { status: 200, body: { object: { sha: "realbranchsha", type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", shaLikeRef, {
        fetch: mockFetch,
      });

      expect(result).toEqual({
        sha: "realbranchsha",
        type: "branch",
        ref: shaLikeRef,
      });
    });
  });

  describe("error handling", () => {
    it("throws for a non-existent repository", async () => {
      const mockFetch = createMockFetch(
        new Map([["/repos/owner/nonexistent", { status: 404 }]]),
      );

      await expect(
        resolveGitHubRef("owner", "nonexistent", undefined, { fetch: mockFetch }),
      ).rejects.toThrow(GitHubApiError);

      await expect(
        resolveGitHubRef("owner", "nonexistent", undefined, { fetch: mockFetch }),
      ).rejects.toThrow(/not found/i);
    });

    it("throws for a non-existent ref with actionable message", async () => {
      const mockFetch = createMockFetch(
        new Map([
          ["/git/ref/heads/nonexistent", { status: 404 }],
          ["/git/ref/tags/nonexistent", { status: 404 }],
        ]),
      );

      await expect(
        resolveGitHubRef("owner", "repo", "nonexistent", { fetch: mockFetch }),
      ).rejects.toThrow(/Could not resolve ref "nonexistent"/);

      await expect(
        resolveGitHubRef("owner", "repo", "nonexistent", { fetch: mockFetch }),
      ).rejects.toThrow(/branch, tag/);
    });

    it("throws a clear error for rate limiting", async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;

      const mockFetch = createMockFetch(
        new Map([
          [
            "/repos/",
            {
              status: 403,
              headers: {
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": String(resetTime),
              },
            },
          ],
        ]),
      );

      const error = await resolveGitHubRef("owner", "repo", undefined, {
        fetch: mockFetch,
      }).catch((e) => e);

      expect(error).toBeInstanceOf(GitHubApiError);
      expect(error.isRateLimited).toBe(true);
      expect(error.message).toMatch(/rate limit exceeded/i);
      expect(error.message).toMatch(/configure a GitHub token/i);
    });

    it("throws for semver ranges (not yet implemented)", async () => {
      const mockFetch = createMockFetch(new Map());

      await expect(
        resolveGitHubRef("owner", "repo", "^1.0.0", { fetch: mockFetch }),
      ).rejects.toThrow(/semver range.*not yet implemented/i);

      await expect(
        resolveGitHubRef("owner", "repo", "~2.0", { fetch: mockFetch }),
      ).rejects.toThrow(/semver range/i);

      await expect(
        resolveGitHubRef("owner", "repo", ">=1.0.0", { fetch: mockFetch }),
      ).rejects.toThrow(/semver range/i);
    });

    it("throws for generic API errors", async () => {
      const mockFetch = createMockFetch(
        new Map([
          ["/repos/", { status: 500 }],
        ]),
      );

      await expect(
        resolveGitHubRef("owner", "repo", undefined, { fetch: mockFetch }),
      ).rejects.toThrow(GitHubApiError);

      await expect(
        resolveGitHubRef("owner", "repo", undefined, { fetch: mockFetch }),
      ).rejects.toThrow(/GitHub API error: 500/);
    });
  });

  describe("authentication", () => {
    it("sends Authorization header when token is provided", async () => {
      const mockFetch = createMockFetch(
        new Map([
          [
            "/git/ref/heads/main",
            { status: 200, body: { object: { sha: "authsha123", type: "commit" } } },
          ],
        ]),
      );

      await resolveGitHubRef("owner", "repo", "main", {
        fetch: mockFetch,
        token: "ghp_testtoken123",
      });

      const call = mockFetch.mock.calls[0] as [string, { headers: HeadersInit }];
      const headers = call[1].headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer ghp_testtoken123");
    });

    it("does not send Authorization header when token is not provided", async () => {
      const mockFetch = createMockFetch(
        new Map([
          [
            "/git/ref/heads/main",
            { status: 200, body: { object: { sha: "noauthsha123", type: "commit" } } },
          ],
        ]),
      );

      await resolveGitHubRef("owner", "repo", "main", {
        fetch: mockFetch,
      });

      const call = mockFetch.mock.calls[0] as [string, { headers: HeadersInit }];
      const headers = call[1].headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe("custom API base URL", () => {
    it("uses the custom API base URL when provided", async () => {
      const customApiBase = "https://github.example.com/api/v3";

      const mockFetch = createMockFetch(
        new Map([
          [
            customApiBase,
            { status: 200, body: { object: { sha: "enterprisesha", type: "commit" } } },
          ],
        ]),
      );

      await resolveGitHubRef("owner", "repo", "main", {
        fetch: mockFetch,
        apiBase: customApiBase,
      });

      const call = mockFetch.mock.calls[0] as [string, unknown];
      expect(call[0]).toContain(customApiBase);
    });
  });

  describe("resolution priority", () => {
    it("prefers commit SHA over branch/tag with same name", async () => {
      const shaRef = "abcdef1234567890abcdef1234567890abcdef12";

      const mockFetch = createMockFetch(
        new Map([
          [
            `/git/commits/${shaRef}`,
            { status: 200, body: { sha: shaRef } },
          ],
          // These should not be called because SHA matches first
          [
            `/git/ref/heads/${shaRef}`,
            { status: 200, body: { object: { sha: "branchsha", type: "commit" } } },
          ],
          [
            `/git/ref/tags/${shaRef}`,
            { status: 200, body: { object: { sha: "tagsha", type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", shaRef, {
        fetch: mockFetch,
      });

      expect(result.type).toBe("commit");
      expect(result.sha).toBe(shaRef);
    });

    it("prefers branch over tag with same name", async () => {
      const mockFetch = createMockFetch(
        new Map([
          [
            "/git/ref/heads/release",
            { status: 200, body: { object: { sha: "branchsha", type: "commit" } } },
          ],
          // Tag should not be checked because branch matches
          [
            "/git/ref/tags/release",
            { status: 200, body: { object: { sha: "tagsha", type: "commit" } } },
          ],
        ]),
      );

      const result = await resolveGitHubRef("owner", "repo", "release", {
        fetch: mockFetch,
      });

      expect(result.type).toBe("branch");
      expect(result.sha).toBe("branchsha");
    });
  });
});

describe("rawGitHubUrl", () => {
  it("builds a raw URL for a file at the root", () => {
    const url = rawGitHubUrl("owner", "repo", "abc123", "extension.json");
    expect(url).toBe(
      "https://raw.githubusercontent.com/owner/repo/abc123/extension.json",
    );
  });

  it("builds a raw URL for a file in a subdirectory", () => {
    const url = rawGitHubUrl("owner", "repo", "def456", "packages/hello/main.js");
    expect(url).toBe(
      "https://raw.githubusercontent.com/owner/repo/def456/packages/hello/main.js",
    );
  });

  it("strips leading slashes from the path", () => {
    const url = rawGitHubUrl("owner", "repo", "ghi789", "///extension.json");
    expect(url).toBe(
      "https://raw.githubusercontent.com/owner/repo/ghi789/extension.json",
    );
  });

  it("handles owner/repo with special characters", () => {
    const url = rawGitHubUrl("my-org", "my-repo", "sha123", "file.txt");
    expect(url).toBe(
      "https://raw.githubusercontent.com/my-org/my-repo/sha123/file.txt",
    );
  });
});
