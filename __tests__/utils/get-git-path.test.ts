import { describe, it, expect } from "vitest";
import { DEFAULT_WORKING_DIR } from "#/api/agent-server-config";
import { getGitPath, toAbsoluteRuntimePath } from "#/utils/get-git-path";

describe("getGitPath", () => {
  it("should return the default working dir when no repository is selected", () => {
    expect(getGitPath(null)).toBe(DEFAULT_WORKING_DIR);
    expect(getGitPath(undefined)).toBe(DEFAULT_WORKING_DIR);
  });

  it("should handle standard owner/repo format (GitHub)", () => {
    expect(getGitPath("OpenHands/OpenHands")).toBe(
      `${DEFAULT_WORKING_DIR}/OpenHands`,
    );
    expect(getGitPath("facebook/react")).toBe(`${DEFAULT_WORKING_DIR}/react`);
  });

  it("should handle nested group paths (GitLab)", () => {
    expect(getGitPath("modernhealth/frontend-guild/pan")).toBe(
      `${DEFAULT_WORKING_DIR}/pan`,
    );
    expect(getGitPath("group/subgroup/repo")).toBe(
      `${DEFAULT_WORKING_DIR}/repo`,
    );
    expect(getGitPath("a/b/c/d/repo")).toBe(`${DEFAULT_WORKING_DIR}/repo`);
  });

  it("should handle single segment paths", () => {
    expect(getGitPath("repo")).toBe(`${DEFAULT_WORKING_DIR}/repo`);
  });

  it("should handle empty string", () => {
    expect(getGitPath("")).toBe(DEFAULT_WORKING_DIR);
  });

  describe("with a backend-provided workspace path", () => {
    it("prefers the explicit workspace path over derived git paths", () => {
      expect(
        getGitPath(
          "OpenHands/software-agent-sdk",
          "/workspace/project/agent-canvas",
        ),
      ).toBe("/workspace/project/agent-canvas");
    });

    it("ignores blank workspace paths and falls back to heuristics", () => {
      expect(getGitPath("OpenHands/software-agent-sdk", "  ")).toBe(
        `${DEFAULT_WORKING_DIR}/software-agent-sdk`,
      );
    });
  });
});

describe("toAbsoluteRuntimePath", () => {
  it("prefixes a leading slash to relative paths", () => {
    // DEFAULT_WORKING_DIR is relative; the agent-server would resolve it
    // against its own process cwd, so it must be absolutized.
    expect(toAbsoluteRuntimePath("workspace/project")).toBe(
      "/workspace/project",
    );
    expect(toAbsoluteRuntimePath(DEFAULT_WORKING_DIR)).toBe(
      `/${DEFAULT_WORKING_DIR}`,
    );
  });

  it("leaves already-absolute paths untouched", () => {
    expect(toAbsoluteRuntimePath("/workspace/project")).toBe(
      "/workspace/project",
    );
    expect(toAbsoluteRuntimePath("/workspace/project/repo")).toBe(
      "/workspace/project/repo",
    );
  });

  it("absolutizes the default getGitPath result", () => {
    // Regression: the files-tab list command runs in this directory. A
    // relative value here makes the `find` fail and the list render empty
    // while the diff view still works (issue: Files → File empty).
    expect(toAbsoluteRuntimePath(getGitPath(null))).toBe(
      `/${DEFAULT_WORKING_DIR}`,
    );
  });
});
