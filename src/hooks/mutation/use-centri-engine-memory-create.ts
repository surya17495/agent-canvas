import { useMutation, useQueryClient } from "@tanstack/react-query";
import CentriService from "#/api/centri/centri-service.api";
import type {
  CentriEngineMemoryCreateResponse,
  CentriEngineMemorySpec,
} from "#/api/centri/centri.types";
import { CENTRI_QUERY_KEYS } from "../query/query-keys";

export interface CentriEngineMemoryCreateVariables {
  role: string;
  memories: CentriEngineMemorySpec[];
}

/**
 * `POST /api/memory/engine/{role}` — add engine memories (spine-first,
 * SPEC §3.10). On settle every graph read is invalidated so the new memory
 * shows up in the graph and the blocks list. Errors propagate for inline
 * rendering (401 / 502 engine-down / unreachable).
 */
export const useCentriEngineMemoryCreate = () => {
  const queryClient = useQueryClient();

  return useMutation<
    CentriEngineMemoryCreateResponse,
    Error,
    CentriEngineMemoryCreateVariables
  >({
    mutationFn: ({ role, memories }: CentriEngineMemoryCreateVariables) =>
      CentriService.createEngineMemories(role, memories),
    meta: { disableToast: true },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: CENTRI_QUERY_KEYS.memoryGraphAll,
      });
    },
  });
};
