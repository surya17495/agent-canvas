import { useMutation, useQueryClient } from "@tanstack/react-query";
import CentriService from "#/api/centri/centri-service.api";
import type { CentriEngineMemoryUpdateResponse } from "#/api/centri/centri.types";
import { CENTRI_QUERY_KEYS } from "../query/query-keys";

export interface CentriEngineMemoryUpdateVariables {
  role: string;
  memoryId: string;
  newContent: string;
}

/**
 * `PATCH /api/memory/engine/{role}/{memory_id}` — revise one engine memory.
 * The engine appends a NEW version (the old one stays with `isLatest:false`),
 * so on settle every graph read is invalidated to pick up the new chain.
 */
export const useCentriEngineMemoryUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation<
    CentriEngineMemoryUpdateResponse,
    Error,
    CentriEngineMemoryUpdateVariables
  >({
    mutationFn: ({ role, memoryId, newContent }) =>
      CentriService.updateEngineMemory(role, memoryId, newContent),
    meta: { disableToast: true },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: CENTRI_QUERY_KEYS.memoryGraphAll,
      });
    },
  });
};
