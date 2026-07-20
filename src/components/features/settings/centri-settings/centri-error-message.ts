import { I18nKey } from "#/i18n/declaration";
import {
  CentriEngineUnavailableError,
  CentriInvalidRequestError,
  CentriNotFoundError,
  CentriUnauthorizedError,
  CentriUnreachableError,
} from "#/api/centri/centri-service.api";

/**
 * Maps a `centrid` error to the i18n key for its inline message. Each typed
 * error class renders a distinct state (§3.15) rather than a generic failure;
 * anything unrecognized falls back to the generic key.
 */
export function centriErrorMessageKey(error: unknown): I18nKey {
  if (error instanceof CentriUnreachableError) {
    return I18nKey.CENTRI$ERROR_UNREACHABLE;
  }
  if (error instanceof CentriUnauthorizedError) {
    return I18nKey.CENTRI$ERROR_UNAUTHORIZED;
  }
  if (error instanceof CentriEngineUnavailableError) {
    return I18nKey.CENTRI$ERROR_ENGINE_UNAVAILABLE;
  }
  if (error instanceof CentriNotFoundError) {
    return I18nKey.CENTRI$ERROR_NOT_FOUND;
  }
  if (error instanceof CentriInvalidRequestError) {
    return I18nKey.CENTRI$ERROR_INVALID;
  }
  return I18nKey.CENTRI$ERROR_GENERIC;
}
