import React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Check, Loader2 } from "lucide-react";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { formControlMultilineFieldClassName } from "#/utils/form-control-classes";
import { useCreateSecret } from "#/hooks/mutation/use-create-secret";
import { useSearchSecrets } from "#/hooks/query/use-get-secrets";
import { useAcpAuthStatus } from "#/hooks/query/use-acp-auth-status";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  getAcpProviderDisplayName,
  getAcpProviderSecrets,
  type ACPProviderSecretField,
} from "#/constants/acp-providers";
import { type OnboardingAgentId } from "./choose-agent-step";
import {
  displayErrorToast,
  displaySuccessToast,
  displayWarningToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

interface SetupAcpSecretsStepProps {
  /** ACP provider whose credentials we're collecting (e.g. ``"claude-code"``).
   * Typed as {@link OnboardingAgentId} — the same type the onboarding modal
   * tracks — so a mistyped key is a compile error rather than a silently empty
   * form. Providers without a credentials entry (``"openhands"``) simply yield
   * no fields. */
  providerKey: OnboardingAgentId;
  /**
   * Whether this is the currently visible onboarding slide. The modal mounts
   * every slide at once, so we only run the (subprocess-spinning) login probe
   * once the user has actually reached this step — by which point the backend
   * is confirmed connected.
   */
  isActive: boolean;
  onBack: () => void;
  onNext: () => void;
}

/**
 * Onboarding credentials step for ACP providers (Claude Code, Codex, Gemini
 * CLI). The fields are derived from {@link getAcpProviderSecrets}: the API key
 * + optional base URL (from the SDK registry) plus the per-provider reserved
 * credentials a *containerized* agent-server needs (Codex ``auth.json``, the
 * Claude OAuth token, the Gemini Vertex service-account JSON + project/location).
 * Each field maps 1:1 to a **global secret** whose name equals the env var the
 * agent-server exports into the provider subprocess, so saving here is the same
 * as adding the secret under Settings → Secrets.
 *
 * The step is **optional on a backend that can fall back to a host login** (a
 * native agent-server where the user has already run ``claude``/``codex``/
 * ``gcloud`` login) and **required otherwise** — a fresh Docker container or a
 * cloud backend has no host login, so the agent can't authenticate without
 * credentials. Required-ness is capability-driven (see {@link backendRequiresAcpCredentials}):
 * we never block "Next" when the login probe detects an existing session, and
 * we never block a native dev whose host login we just can't classify.
 *
 * Empty fields are never written (a deliberate skip), and a field whose secret
 * already exists shows an "already saved" placeholder and is left untouched
 * unless the user types a replacement.
 */
export function SetupAcpSecretsStep({
  providerKey,
  isActive,
  onBack,
  onNext,
}: SetupAcpSecretsStepProps) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { mutateAsync: createSecret } = useCreateSecret();
  const { data: existingSecrets } = useSearchSecrets();
  const activeBackend = useActiveBackend();
  // Login detection via AcpService (provider status commands run through the
  // agent-server bash endpoint) — see issue #964.
  const { status: authStatus, isChecking: isCheckingAuth } = useAcpAuthStatus(
    providerKey,
    { enabled: isActive },
  );

  const fields = React.useMemo(
    () => getAcpProviderSecrets(providerKey),
    [providerKey],
  );
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);

  const providerName = getAcpProviderDisplayName(providerKey) ?? providerKey;

  const secretExists = React.useCallback(
    (name: string) =>
      (existingSecrets ?? []).some((secret) => secret.name === name),
    [existingSecrets],
  );

  const hasValueFor = React.useCallback(
    (field: ACPProviderSecretField) =>
      Boolean(values[field.name]?.trim()) || secretExists(field.name),
    [values, secretExists],
  );

  const isAuthenticated = authStatus === "authenticated";
  // Required when the backend can't fall back to a host login (see component
  // docstring). Cloud never has one; a local backend that probes as logged-out
  // is a fresh container — require credentials there, but stay permissive when
  // the probe is unknown/in-flight so a native dev is never blocked.
  const required = backendRequiresAcpCredentials(
    activeBackend.backend.kind,
    authStatus,
  );
  // Considered satisfied once the user has any credential for the provider —
  // typed now or previously saved — since the providers offer alternative auth
  // paths (API key vs. subscription/Vertex) and we can't know which one the
  // user intends. An existing login also satisfies it.
  const satisfied = isAuthenticated || fields.some(hasValueFor);
  const blockNext = required && !satisfied;

  // Whether the active backend can actually consume the reserved file-content
  // credentials we collect. Local agent-servers materialise them to disk via
  // the SDK's acp_file_secrets defaults; cloud doesn't yet (OpenHands#1016), so
  // saving one there would orphan it — we warn instead of claiming success.
  const consumesFileCredentials = activeBackend.backend.kind === "local";

  const handleNext = async () => {
    // Only persist fields the user actually filled in — empty inputs are a
    // deliberate skip, not a request to clear an existing secret.
    const toSave = fields
      .map((field) => ({ field, value: values[field.name]?.trim() }))
      .filter(
        (entry): entry is { field: ACPProviderSecretField; value: string } =>
          Boolean(entry.value),
      );

    if (toSave.length === 0) {
      onNext();
      return;
    }

    setIsSaving(true);
    try {
      // Sequential so a mid-list failure leaves the earlier secrets saved and
      // surfaces a single, specific error rather than a race of toasts.
      for (const { field, value } of toSave) {
        await createSecret({ name: field.name, value });
      }
      await queryClient.invalidateQueries({ queryKey: ["secrets-search"] });
      await queryClient.invalidateQueries({ queryKey: ["secrets"] });

      // #1013: don't claim success for a credential the active backend can't
      // consume. A cloud backend can't yet read the materialised file-content
      // credentials, so saving one there orphans it — say so rather than
      // toasting "Saved".
      const savedOrphanedFileCredential =
        !consumesFileCredentials &&
        toSave.some(({ field }) => field.reserved && field.multiline);
      if (savedOrphanedFileCredential) {
        displayWarningToast(t(I18nKey.ONBOARDING$ACP_SECRETS_ORPHANED_WARNING));
      } else {
        displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
      }
      onNext();
    } catch (error) {
      const message = retrieveAxiosErrorMessage(error as AxiosError);
      displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      data-testid="onboarding-step-setup-acp-secrets"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-medium text-white">
          {t(I18nKey.ONBOARDING$ACP_SECRETS_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.ONBOARDING$ACP_SECRETS_SUBTITLE, {
            provider: providerName,
          })}
        </p>
        {required && !isAuthenticated ? (
          <p
            data-testid="onboarding-acp-secrets-required-note"
            className="text-sm text-[var(--oh-muted)]"
          >
            {t(I18nKey.ONBOARDING$ACP_SECRETS_REQUIRED_NOTE, {
              provider: providerName,
            })}
          </p>
        ) : (
          authStatus !== "authenticated" && (
            // When already signed in, the success banner below already says to
            // leave the fields blank, so this general reminder would be redundant.
            <p className="text-sm text-[var(--oh-muted)]">
              {t(I18nKey.ONBOARDING$ACP_SECRETS_SUBSCRIPTION_NOTE)}
            </p>
          )
        )}
      </header>

      {authStatus === "authenticated" ? (
        <div
          data-testid="onboarding-acp-auth-detected"
          // Matches the onboarding "backend connected" success banner
          // (check-backend-step.tsx) for a consistent look.
          className="flex items-start gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200"
        >
          <Check
            className="mt-0.5 size-4 shrink-0 text-green-400"
            aria-hidden
          />
          <span>
            {t(I18nKey.ONBOARDING$ACP_AUTH_DETECTED, {
              provider: providerName,
            })}
          </span>
        </div>
      ) : isCheckingAuth ? (
        <div
          data-testid="onboarding-acp-auth-checking"
          className="flex items-center gap-2 text-sm text-[var(--oh-muted)]"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          <span>
            {t(I18nKey.ONBOARDING$ACP_AUTH_CHECKING, {
              provider: providerName,
            })}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        {fields.map((field) => {
          const alreadySet = secretExists(field.name);
          const placeholder = alreadySet
            ? t(I18nKey.ONBOARDING$ACP_SECRET_ALREADY_SET)
            : "";
          return (
            <div key={field.name} className="flex flex-col gap-1.5">
              {field.multiline ? (
                <label className="flex flex-col gap-2.5">
                  <span className="text-sm font-mono text-white">
                    {field.name}
                  </span>
                  <textarea
                    data-testid={`onboarding-acp-secret-${field.name}`}
                    name={field.name}
                    rows={4}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={values[field.name] ?? ""}
                    placeholder={placeholder}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    className={cn(
                      formControlMultilineFieldClassName,
                      "font-mono text-xs",
                    )}
                  />
                </label>
              ) : (
                <SettingsInput
                  testId={`onboarding-acp-secret-${field.name}`}
                  name={field.name}
                  // The env-var name is the canonical label here; rendering it
                  // monospace makes clear it's a literal key, not prose.
                  label={field.name}
                  labelClassName="font-mono"
                  type={field.secret ? "password" : "text"}
                  value={values[field.name] ?? ""}
                  onChange={(value) =>
                    setValues((prev) => ({ ...prev, [field.name]: value }))
                  }
                  // Every field is optional at the input level — the step's
                  // required-ness is enforced on "Next", not per field.
                  showOptionalTag
                  placeholder={placeholder}
                />
              )}
              <span className="text-xs text-[var(--oh-muted)]">
                {t(field.hint_key, field.hint_values)}
              </span>
            </div>
          );
        })}
      </div>

      {blockNext ? (
        <p
          data-testid="onboarding-acp-secrets-blocked"
          className="text-sm text-amber-300"
        >
          {t(I18nKey.ONBOARDING$ACP_SECRETS_REQUIRED_BLOCKED)}
        </p>
      ) : null}

      <div className="sticky bottom-0 flex items-center justify-between gap-2 bg-base-secondary pt-4 pb-7">
        <BrandButton
          testId="onboarding-acp-secrets-back"
          type="button"
          variant="secondary"
          onClick={onBack}
          isDisabled={isSaving}
        >
          {t(I18nKey.ONBOARDING$BACK)}
        </BrandButton>
        <BrandButton
          testId="onboarding-acp-secrets-next"
          type="button"
          variant="primary"
          isDisabled={isSaving || blockNext}
          onClick={handleNext}
        >
          {isSaving ? t(I18nKey.SETTINGS$SAVING) : t(I18nKey.ONBOARDING$NEXT)}
        </BrandButton>
      </div>
    </div>
  );
}

/**
 * Whether the credential step must be satisfied before advancing, given the
 * active backend kind and the ACP login-probe result.
 *
 * - **cloud** → always required: a remote backend has no host CLI login to fall
 *   back on.
 * - **local + ``"unauthenticated"``** → required: the probe ran and found no
 *   login, i.e. a fresh containerized agent-server.
 * - **local + ``"authenticated"`` / ``"unknown"``** → optional: either a login
 *   exists, or the probe couldn't classify it (CLI missing, odd output) — in
 *   which case we stay permissive rather than block a working native dev.
 *
 * Exported for unit testing the matrix without rendering the modal.
 */
export function backendRequiresAcpCredentials(
  backendKind: "local" | "cloud",
  authStatus: "authenticated" | "unauthenticated" | "unknown",
): boolean {
  if (authStatus === "authenticated") return false;
  if (backendKind === "cloud") return true;
  return authStatus === "unauthenticated";
}
