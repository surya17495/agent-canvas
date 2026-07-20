import { useQuery } from "@tanstack/react-query";
import CentriService, {
  CentriError,
  CentriUnreachableError,
} from "#/api/centri/centri-service.api";
import { CENTRI_QUERY_KEYS } from "./query-keys";

interface UseCentriSettingsOptions {
  enabled?: boolean;
}

/**
 * Reads `GET /api/settings` from the Centri panel daemon. Toasts are
 * suppressed — the Centri settings page renders its own inline error states
 * (unreachable / degraded) instead of a global toast. Retries a couple of
 * times for transient issues but not when the daemon is plainly unreachable.
 */
export const useCentriSettings = (options?: UseCentriSettingsOptions) =>
  useQuery({
    queryKey: CENTRI_QUERY_KEYS.settings,
    queryFn: CentriService.getSettings,
    retry: (failureCount, error) =>
      !(error instanceof CentriUnreachableError) &&
      !(error instanceof CentriError && error.status === 401) &&
      failureCount < 2,
    meta: { disableToast: true },
    enabled: options?.enabled,
  });
