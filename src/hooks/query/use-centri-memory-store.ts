import { useQuery } from "@tanstack/react-query";
import CentriService, {
  CentriError,
  CentriUnreachableError,
} from "#/api/centri/centri-service.api";
import type { CentriMemoryKind } from "#/api/centri/centri.types";
import { CENTRI_QUERY_KEYS } from "./query-keys";

interface UseCentriMemoryStoreOptions {
  enabled?: boolean;
}

/**
 * Reads one authored store (`GET /api/memory/stores/{role}/{kind}`) for the
 * editor. A not-yet-authored store is a valid empty state (`present:false`,
 * `content:""`), not an error. Disabled until a store is selected.
 */
export const useCentriMemoryStore = (
  role: string | null,
  kind: CentriMemoryKind | null,
  options?: UseCentriMemoryStoreOptions,
) =>
  useQuery({
    queryKey: CENTRI_QUERY_KEYS.memoryStore(role ?? "", kind ?? ""),
    queryFn: () =>
      CentriService.readMemoryStore(role as string, kind as CentriMemoryKind),
    enabled: (options?.enabled ?? true) && role !== null && kind !== null,
    retry: (failureCount, error) =>
      !(error instanceof CentriUnreachableError) &&
      !(error instanceof CentriError && error.status === 401) &&
      failureCount < 2,
    meta: { disableToast: true },
  });
