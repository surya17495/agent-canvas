import { DEFAULT_WORKING_DIR } from "#/api/agent-server-config";

export function getGitPath(
  selectedRepository: string | null | undefined,
  workingDir?: string | null,
): string {
  const normalizedWorkingDir = workingDir?.trim();
  if (normalizedWorkingDir) {
    return normalizedWorkingDir;
  }

  if (!selectedRepository) {
    return DEFAULT_WORKING_DIR;
  }

  const parts = selectedRepository.split("/");
  const repoName = parts[parts.length - 1];

  return `${DEFAULT_WORKING_DIR}/${repoName}`;
}

/**
 * Normalize a working-dir / git path to an absolute runtime path.
 *
 * The agent-server resolves a relative `cwd` (or git `path`) against its
 * own process working directory, not the workspace root, so a relative
 * value like `workspace/project` — the shape `getGitPath` /
 * `DEFAULT_WORKING_DIR` return by default — points at the wrong place and
 * the command fails / returns nothing. Prefixing a leading slash pins it
 * to the runtime's absolute workspace layout (`/workspace/project`).
 */
export function toAbsoluteRuntimePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}
