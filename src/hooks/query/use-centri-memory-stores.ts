import { useQuery } from "@tanstack/react-query";
import CentriService, {
  CentriError,
  CentriUnreachableError,
} from "#/api/centri/centri-service.api";
import { CENTRI_QUERY_KEYS } from "./query-keys";

/**
 * Reads `GET /api/memory/stores` — the authored frame stores per role plus the
 * omitted-never-mocked engine sections (SPEC §3.14). Toasts are suppressed; the
 * Memory page renders its own inline states (unreachable / error / empty).
 * Retries transient failures but not a plainly-unreachable daemon or a 401.
 */
export const useCentriMemoryStores = () =>
  useQuery({
    queryKey: CENTRI_QUERY_KEYS.memoryStores,
    queryFn: CentriService.listMemoryStores,
    retry: (failureCount, error) =>
      !(error instanceof CentriUnreachableError) &&
      !(error instanceof CentriError && error.status === 401) &&
      failureCount < 2,
    meta: { disableToast: true },
  });
