import type { Capability } from "#/extensions/manifest";
import { I18nKey } from "#/i18n/declaration";

/**
 * Human-readable description key per capability, shown in the install-consent UI.
 * Typed as `Record<Capability, …>` so adding a new capability is a compile error until
 * it gets a user-facing explanation.
 */
const CAPABILITY_LABEL_KEYS: Record<Capability, I18nKey> = {
  "conversation:read": I18nKey.EXTENSIONS$CAP_CONVERSATION_READ,
  storage: I18nKey.EXTENSIONS$CAP_STORAGE,
};

export function capabilityLabelKey(capability: Capability): I18nKey {
  return CAPABILITY_LABEL_KEYS[capability];
}
