import { useQuery } from "@tanstack/react-query";

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { getGitPath, toAbsoluteRuntimePath } from "#/utils/get-git-path";

// Cap the number of files we render so a giant repo doesn't freeze the UI.
const MAX_FILES = 2000;

// Directory names that we never want to descend into when listing files.
const EXCLUDED_DIRS = [
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  ".next",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  ".turbo",
  ".parcel-cache",
  "target",
];

// Build a `find` invocation that lists files relative to the workspace root.
function buildListCommand(): string {
  const pruneExpr = EXCLUDED_DIRS.map((dir) => `-name '${dir}' -prune`).join(
    " -o ",
  );
  return `find . \\( ${pruneExpr} \\) -o -type f -print 2>/dev/null | sort | head -n ${MAX_FILES}`;
}

function normalizePath(path: string): string {
  // Strip a leading "./" so paths render cleanly in the UI.
  return path.startsWith("./") ? path.slice(2) : path;
}

/**
 * Lists every regular file beneath the active conversation's working
 * directory, excluding common heavy/build directories. Returns paths relative
 * to the working dir (e.g. `src/index.html`).
 */
export function useWorkspaceFiles() {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const selectedRepository = conversation?.selected_repository;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  // Resolve the directory to list files in exactly like the diff view does:
  // fall back to `getGitPath` when `working_dir` is missing, then absolutize.
  // The agent-server resolves a relative `cwd` against its own process
  // directory (not the workspace root), so passing a relative
  // `working_dir` — or gating the whole query off a missing one — leaves
  // the file list empty even though the diff view (which absolutizes its
  // path) still works. See use-unified-get-git-changes.ts for the mirror.
  const listDir = toAbsoluteRuntimePath(
    getGitPath(selectedRepository, workingDir),
  );

  return useQuery<string[]>({
    queryKey: [
      "workspace-files",
      conversationId,
      conversationUrl,
      sessionApiKey,
      listDir,
    ],
    queryFn: async () => {
      const result = await AgentServerRuntimeService.executeCommand(
        conversationUrl,
        sessionApiKey,
        buildListCommand(),
        listDir,
        30,
      );

      if (result.exit_code !== 0) {
        throw new Error(
          result.stderr?.trim() || "Failed to list workspace files",
        );
      }

      const lines = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(normalizePath);

      // Defensive: keep results unique and bounded.
      return Array.from(new Set(lines)).slice(0, MAX_FILES);
    },
    // `listDir` is always resolved (getGitPath has a default), so we no
    // longer gate on a present `working_dir` — a conversation whose
    // workspace omits it must still list files, matching the diff view.
    enabled: runtimeIsReady && !!conversationId,
    retry: false,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
}
