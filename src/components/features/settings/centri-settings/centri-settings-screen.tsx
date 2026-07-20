import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useCentriSettings } from "#/hooks/query/use-centri-settings";
import { useCentriPump } from "#/hooks/mutation/use-centri-pump";
import { hasCentriPanelToken } from "#/api/centri/centri-config";
import type {
  CentriPendingSession,
  CentriPumpResponse,
  CentriSettings,
} from "#/api/centri/centri.types";
import { BrandButton } from "#/components/features/settings/brand-button";
import { KeyStatusIcon } from "#/components/features/settings/key-status-icon";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { Typography } from "#/ui/typography";
import { cn } from "#/utils/utils";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { centriErrorMessageKey } from "./centri-error-message";

function FieldRow({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-4 py-1 text-sm"
    >
      <span className="text-tertiary-light">{label}</span>
      <span className="font-medium text-right break-all">{children}</span>
    </div>
  );
}

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className="border-t border-[var(--oh-border)] pt-6"
    >
      <Typography.H3 className="mb-3">{title}</Typography.H3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function BooleanBadge({ value }: { value: boolean }) {
  const { t } = useTranslation("openhands");
  return (
    <span className={cn(value ? "text-success" : "text-tertiary-light")}>
      {value ? t(I18nKey.CENTRI$YES) : t(I18nKey.CENTRI$NO)}
    </span>
  );
}

function pumpSummaryToast(
  t: ReturnType<typeof useTranslation>["t"],
  response: CentriPumpResponse,
) {
  const { pumped, no_op: noOp, failed, ok } = response.summary;
  const summary = t(I18nKey.CENTRI$SYNC_SUMMARY, {
    pumped,
    noop: noOp,
    failed,
  });
  if (ok) {
    displaySuccessToast(`${t(I18nKey.CENTRI$SYNC_SUCCESS)} ${summary}`);
  } else {
    displayErrorToast(`${t(I18nKey.CENTRI$SYNC_PARTIAL)} ${summary}`);
  }
}

function EngineSection({ settings }: { settings: CentriSettings }) {
  const { t } = useTranslation("openhands");
  const { engine } = settings;
  return (
    <Section
      title={t(I18nKey.CENTRI$SECTION_ENGINE)}
      testId="centri-engine-section"
    >
      <FieldRow label={t(I18nKey.CENTRI$ENGINE_BASE_URL)}>
        {engine.base_url}
      </FieldRow>
      <FieldRow label={t(I18nKey.CENTRI$ENGINE_STATUS)}>
        {engine.status === "up"
          ? t(I18nKey.CENTRI$ENGINE_STATUS_UP)
          : t(I18nKey.CENTRI$ENGINE_STATUS_UNAVAILABLE)}
      </FieldRow>
      <FieldRow label={t(I18nKey.CENTRI$ENGINE_REACHABLE)}>
        <BooleanBadge value={engine.reachable} />
      </FieldRow>
      <FieldRow label={t(I18nKey.CENTRI$ENGINE_VERSION_PIN)}>
        {engine.version_pin}
      </FieldRow>
      <FieldRow label={t(I18nKey.CENTRI$PRODUCT_READY)}>
        <BooleanBadge value={settings.product_ready} />
      </FieldRow>
    </Section>
  );
}

function KeysSection({ settings }: { settings: CentriSettings }) {
  const { t } = useTranslation("openhands");
  const { key } = settings;
  return (
    <Section
      title={t(I18nKey.CENTRI$SECTION_KEYS)}
      testId="centri-keys-section"
    >
      <FieldRow label={t(I18nKey.CENTRI$KEY_LLM_PRESENT)}>
        <span className="inline-flex items-center gap-2">
          <KeyStatusIcon
            testId="centri-llm-key-status"
            isSet={key.llm_key_present}
          />
          {key.llm_key_present
            ? t(I18nKey.CENTRI$KEY_PRESENT)
            : t(I18nKey.CENTRI$KEY_ABSENT)}
        </span>
      </FieldRow>
      <FieldRow label={t(I18nKey.CENTRI$KEY_ENGINE_PRESENT)}>
        <span className="inline-flex items-center gap-2">
          <KeyStatusIcon
            testId="centri-engine-key-status"
            isSet={key.engine_key_present}
          />
          {key.engine_key_present
            ? t(I18nKey.CENTRI$KEY_PRESENT)
            : t(I18nKey.CENTRI$KEY_ABSENT)}
        </span>
      </FieldRow>
    </Section>
  );
}

function DeploySection({ settings }: { settings: CentriSettings }) {
  const { t } = useTranslation("openhands");
  const { deploy } = settings;
  return (
    <Section
      title={t(I18nKey.CENTRI$SECTION_DEPLOY)}
      testId="centri-deploy-section"
    >
      <FieldRow label={t(I18nKey.CENTRI$SECTION_DEPLOY)}>
        <BooleanBadge value={deploy.lock_valid} />
      </FieldRow>
      {deploy.error ? (
        <p
          data-testid="centri-deploy-error"
          className="text-sm text-danger break-all"
        >
          {t(I18nKey.CENTRI$DEPLOY_ERROR)}: {deploy.error}
        </p>
      ) : null}
      <div className="pt-2">
        <span className="text-tertiary-light text-sm">
          {t(I18nKey.CENTRI$DEPLOY_COMPONENTS)}
        </span>
        {deploy.components.length === 0 ? (
          <p className="text-sm text-tertiary-light">
            {t(I18nKey.CENTRI$DEPLOY_NO_COMPONENTS)}
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {deploy.components.map((component) => (
              <li
                key={component.name}
                className="text-sm flex justify-between gap-4"
              >
                <span className="font-medium">{component.name}</span>
                <span className="text-tertiary-light break-all">
                  {component.fork_pinned_commit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function SyncSection({
  settings,
  onPump,
  isPumping,
  pumpingSessionId,
}: {
  settings: CentriSettings;
  onPump: (sessionId?: string) => void;
  isPumping: boolean;
  pumpingSessionId: string | null;
}) {
  const { t } = useTranslation("openhands");
  const { sync } = settings;
  const tokenPresent = hasCentriPanelToken();

  return (
    <Section
      title={t(I18nKey.CENTRI$SECTION_SYNC)}
      testId="centri-sync-section"
    >
      <FieldRow label={t(I18nKey.CENTRI$SYNC_SESSIONS_TOTAL)}>
        {sync.sessions_total}
      </FieldRow>
      <FieldRow label={t(I18nKey.CENTRI$SYNC_SESSIONS_PENDING)}>
        {sync.sessions_pending_pump}
      </FieldRow>
      <FieldRow label={t(I18nKey.CENTRI$SYNC_ROLES)}>
        {sync.roles.length > 0 ? sync.roles.join(", ") : t(I18nKey.CENTRI$NO)}
      </FieldRow>

      {!tokenPresent ? (
        <p
          data-testid="centri-token-missing"
          className="mt-2 text-sm text-warning"
        >
          {t(I18nKey.CENTRI$SYNC_TOKEN_MISSING)}
        </p>
      ) : null}

      <div className="flex justify-start pt-3">
        <BrandButton
          testId="centri-sync-now"
          variant="primary"
          type="button"
          isDisabled={!tokenPresent || isPumping}
          aria-busy={isPumping && pumpingSessionId === null}
          onClick={() => onPump(undefined)}
        >
          {isPumping && pumpingSessionId === null
            ? t(I18nKey.CENTRI$SYNC_RUNNING)
            : t(I18nKey.CENTRI$SYNC_NOW)}
        </BrandButton>
      </div>

      <div className="pt-3">
        <span className="text-tertiary-light text-sm">
          {t(I18nKey.CENTRI$SYNC_PENDING_TITLE)}
        </span>
        {sync.pending.length === 0 ? (
          <p
            data-testid="centri-pending-empty"
            className="text-sm text-tertiary-light"
          >
            {t(I18nKey.CENTRI$SYNC_PENDING_NONE)}
          </p>
        ) : (
          <ul
            data-testid="centri-pending-list"
            className="mt-1 flex flex-col gap-2"
          >
            {sync.pending.map((session: CentriPendingSession) => (
              <li
                key={session.session_id}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="font-mono break-all">
                  {session.session_id}
                </span>
                <BrandButton
                  testId={`centri-sync-session-${session.session_id}`}
                  variant="secondary"
                  type="button"
                  isDisabled={!tokenPresent || isPumping}
                  aria-busy={
                    isPumping && pumpingSessionId === session.session_id
                  }
                  onClick={() => onPump(session.session_id)}
                >
                  {isPumping && pumpingSessionId === session.session_id
                    ? t(I18nKey.CENTRI$SYNC_RUNNING)
                    : t(I18nKey.CENTRI$SYNC_SESSION)}
                </BrandButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

export function CentriSettingsScreen() {
  const { t } = useTranslation("openhands");
  const {
    data: settings,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCentriSettings();
  const { mutate: pump, isPending: isPumping, variables } = useCentriPump();
  const pumpingSessionId = isPumping ? (variables?.sessionId ?? null) : null;

  const onPump = (sessionId?: string) => {
    pump(
      { sessionId },
      {
        onSuccess: (response) => pumpSummaryToast(t, response),
        onError: (err) => displayErrorToast(t(centriErrorMessageKey(err))),
      },
    );
  };

  if (isLoading) {
    return (
      <div
        data-testid="centri-loading"
        className="flex items-center gap-3 py-6"
        role="status"
        aria-live="polite"
      >
        <LoadingSpinner size="small" />
        <span className="text-sm text-tertiary-light">
          {t(I18nKey.CENTRI$LOADING)}
        </span>
      </div>
    );
  }

  if (isError || !settings) {
    return (
      <div
        data-testid="centri-error"
        className="flex flex-col items-start gap-3 py-6"
        role="alert"
      >
        <p className="text-sm text-danger">{t(centriErrorMessageKey(error))}</p>
        <BrandButton
          testId="centri-retry"
          variant="secondary"
          type="button"
          isDisabled={isFetching}
          onClick={() => refetch()}
        >
          {t(I18nKey.CENTRI$RETRY)}
        </BrandButton>
      </div>
    );
  }

  return (
    <div data-testid="centri-settings-screen" className="flex flex-col gap-6">
      {!settings.engine.reachable ? (
        <div
          data-testid="centri-degraded-banner"
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          {t(I18nKey.CENTRI$ENGINE_DEGRADED_BANNER)}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <FieldRow label={t(I18nKey.CENTRI$SECTION_USER)} testId="centri-user">
          {settings.user}
        </FieldRow>
        <BrandButton
          testId="centri-refresh"
          variant="secondary"
          type="button"
          isDisabled={isFetching}
          aria-busy={isFetching}
          onClick={() => refetch()}
        >
          {t(I18nKey.CENTRI$REFRESH)}
        </BrandButton>
      </div>

      <EngineSection settings={settings} />
      <KeysSection settings={settings} />
      <SyncSection
        settings={settings}
        onPump={onPump}
        isPumping={isPumping}
        pumpingSessionId={pumpingSessionId}
      />
      <DeploySection settings={settings} />
    </div>
  );
}

export default CentriSettingsScreen;
