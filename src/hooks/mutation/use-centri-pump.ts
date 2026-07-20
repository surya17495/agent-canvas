import { useMutation, useQueryClient } from "@tanstack/react-query";
import CentriService from "#/api/centri/centri-service.api";
import type { CentriPumpResponse } from "#/api/centri/centri.types";
import { CENTRI_QUERY_KEYS } from "../query/query-keys";

export interface CentriPumpVariables {
  /** Omit to pump all pending sessions; set to pump a single session. */
  sessionId?: string;
}

/**
 * `POST /api/pump` — "sync now". On settle (success or failure) the settings
 * query is invalidated so the panel reflects advanced cursors / new pending
 * counts. Errors propagate to the caller for per-state rendering.
 */
export const useCentriPump = () => {
  const queryClient = useQueryClient();

  return useMutation<CentriPumpResponse, Error, CentriPumpVariables>({
    mutationFn: ({ sessionId }: CentriPumpVariables) =>
      CentriService.pump(sessionId),
    meta: { disableToast: true },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CENTRI_QUERY_KEYS.settings });
    },
  });
};
