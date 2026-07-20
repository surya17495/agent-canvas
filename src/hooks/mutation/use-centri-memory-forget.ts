import { useMutation, useQueryClient } from "@tanstack/react-query";
import CentriService from "#/api/centri/centri-service.api";
import type {
  CentriMemoryForgetResponse,
  CentriMemoryKind,
} from "#/api/centri/centri.types";
import { CENTRI_QUERY_KEYS } from "../query/query-keys";

export interface CentriMemoryForgetVariables {
  role: string;
  kind: CentriMemoryKind;
}

/**
 * `DELETE /api/memory/stores/{role}/{kind}` — forget an authored store. The UI
 * confirms before calling this (destructive). On settle the store list and the
 * store's read are invalidated so the forgotten store shows as absent. Errors
 * propagate for per-state rendering (401 / 404 / unreachable).
 */
export const useCentriMemoryForget = () => {
  const queryClient = useQueryClient();

  return useMutation<
    CentriMemoryForgetResponse,
    Error,
    CentriMemoryForgetVariables
  >({
    mutationFn: ({ role, kind }: CentriMemoryForgetVariables) =>
      CentriService.forgetMemoryStore(role, kind),
    meta: { disableToast: true },
    onSettled: (_data, _error, { role, kind }) => {
      queryClient.invalidateQueries({
        queryKey: CENTRI_QUERY_KEYS.memoryStores,
      });
      queryClient.invalidateQueries({
        queryKey: CENTRI_QUERY_KEYS.memoryStore(role, kind),
      });
    },
  });
};
