import { useQuery } from "@tanstack/react-query";
import CentriService, {
  CentriError,
  CentriUnreachableError,
} from "#/api/centri/centri-service.api";
import { CENTRI_QUERY_KEYS } from "./query-keys";

/**
 * Reads `GET /api/memory/graph` — raw `DocumentWithMemories` passthrough for
 * the memory graph and the engine-memory blocks (C8). `role` filters to one
 * role's container; empty string merges every known role. Toasts suppressed —
 * the Memory page renders its own inline states. Doesn't retry an unreachable
 * daemon, a 401, or a 502 (engine down is a stable state, not a blip).
 */
export const useCentriMemoryGraph = (role = "") =>
  useQuery({
    queryKey: CENTRI_QUERY_KEYS.memoryGraph(role),
    queryFn: () => CentriService.getMemoryGraph(role || undefined),
    retry: (failureCount, error) =>
      !(error instanceof CentriUnreachableError) &&
      !(
        error instanceof CentriError &&
        (error.status === 401 || error.status === 502)
      ) &&
      failureCount < 2,
    meta: { disableToast: true },
  });
