import { useMutation, useQueryClient } from "@tanstack/react-query";
import CentriService from "#/api/centri/centri-service.api";
import type { CentriEngineMemoryForgetResponse } from "#/api/centri/centri.types";
import { CENTRI_QUERY_KEYS } from "../query/query-keys";

export interface CentriEngineMemoryForgetVariables {
  role: string;
  memoryId: string;
}

/**
 * `DELETE /api/memory/engine/{role}/{memory_id}` — soft-forget one engine
 * memory (`isForgotten:true`; it stays in the version history but is excluded
 * from recall, SPEC §3.14). Graph reads are invalidated on settle.
 */
export const useCentriEngineMemoryForget = () => {
  const queryClient = useQueryClient();

  return useMutation<
    CentriEngineMemoryForgetResponse,
    Error,
    CentriEngineMemoryForgetVariables
  >({
    mutationFn: ({ role, memoryId }) =>
      CentriService.forgetEngineMemory(role, memoryId),
    meta: { disableToast: true },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: CENTRI_QUERY_KEYS.memoryGraphAll,
      });
    },
  });
};
