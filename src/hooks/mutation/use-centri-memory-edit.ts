import { useMutation, useQueryClient } from "@tanstack/react-query";
import CentriService from "#/api/centri/centri-service.api";
import type {
  CentriMemoryKind,
  CentriMemoryStoreContent,
} from "#/api/centri/centri.types";
import { CENTRI_QUERY_KEYS } from "../query/query-keys";

export interface CentriMemoryEditVariables {
  role: string;
  kind: CentriMemoryKind;
  content: string;
}

/**
 * `PUT /api/memory/stores/{role}/{kind}` — save an authored store. On settle
 * the store list and the edited store's read are invalidated so the UI reflects
 * new presence/size and the saved content. Errors propagate for per-state
 * rendering (401 unauthorized / 422 invalid / unreachable).
 */
export const useCentriMemoryEdit = () => {
  const queryClient = useQueryClient();

  return useMutation<
    CentriMemoryStoreContent,
    Error,
    CentriMemoryEditVariables
  >({
    mutationFn: ({ role, kind, content }: CentriMemoryEditVariables) =>
      CentriService.editMemoryStore(role, kind, content),
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
