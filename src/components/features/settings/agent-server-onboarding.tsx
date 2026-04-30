import React from "react";
import {
  Globe,
  RefreshCw,
  Server,
  Upload,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getAgentServerFormDefaults,
  saveAgentServerConfig,
} from "#/api/agent-server-config";
import { MINIMUM_SUPPORTED_AGENT_SERVER_VERSION } from "#/api/agent-server-compatibility";
import { cn } from "#/utils/utils";
import { BrandButton } from "./brand-button";
import { SettingsInput } from "./settings-input";

type AgentServerChecklistVariant = "connect" | "upgrade";

interface AgentServerConnectionFormProps {
  className?: string;
  formClassName?: string;
}

interface AgentServerChecklistProps {
  className?: string;
  variant?: AgentServerChecklistVariant;
}

export function AgentServerConnectionForm({
  className,
  formClassName,
}: AgentServerConnectionFormProps) {
  const { t } = useTranslation();
  const defaults = React.useMemo(() => getAgentServerFormDefaults(), []);
  const [baseUrl, setBaseUrl] = React.useState(defaults.baseUrl);
  const [sessionApiKey, setSessionApiKey] = React.useState(
    defaults.sessionApiKey,
  );

  const formIsClean =
    baseUrl === defaults.baseUrl && sessionApiKey === defaults.sessionApiKey;

  const reconnect = () => {
    window.location.assign("/");
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    saveAgentServerConfig({
      baseUrl,
      sessionApiKey,
    });

    reconnect();
  };

  return (
    <form
      data-testid="agent-server-connection-form"
      onSubmit={onSubmit}
      className={cn("flex h-full flex-col", className)}
    >
      <div
        className={cn(
          "rounded-3xl border border-white/10 bg-neutral-950/80 p-6 shadow-2xl",
          formClassName,
        )}
      >
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
          {t("SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE")}
        </p>
        <p className="mt-3 max-w-[680px] text-sm leading-7 text-gray-400">
          {t("SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_DESCRIPTION")}
        </p>

        <div className="mt-6 flex flex-col gap-5">
          <SettingsInput
            testId="agent-server-url-input"
            name="agent-server-url-input"
            type="text"
            label={t("SETTINGS$AGENT_SERVER_URL")}
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder={t("SETTINGS$AGENT_SERVER_URL_PLACEHOLDER")}
            className="w-full max-w-[680px]"
          />

          <SettingsInput
            testId="agent-server-api-key-input"
            name="agent-server-api-key-input"
            type="password"
            label={t("SETTINGS$AGENT_SERVER_API_KEY")}
            value={sessionApiKey}
            onChange={setSessionApiKey}
            placeholder={t("SETTINGS$AGENT_SERVER_API_KEY_PLACEHOLDER")}
            showOptionalTag
            className="w-full max-w-[680px]"
          />
        </div>

        <p className="mt-4 max-w-[680px] text-xs leading-6 text-gray-500">
          {t("SETTINGS$AGENT_SERVER_BROWSER_ONLY_NOTE")}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <BrandButton
          testId="retry-connection-button"
          variant="secondary"
          type="button"
          onClick={reconnect}
          startContent={<RefreshCw className="size-4" />}
        >
          {t("SETTINGS$AGENT_SERVER_RETRY_CONNECTION")}
        </BrandButton>
        <BrandButton
          testId="submit-button"
          variant="primary"
          type="submit"
          isDisabled={formIsClean}
        >
          {t("SETTINGS$SAVE_AND_RECONNECT")}
        </BrandButton>
      </div>
    </form>
  );
}

export function AgentServerChecklist({
  className,
  variant = "connect",
}: AgentServerChecklistProps) {
  const { t } = useTranslation();

  const steps =
    variant === "upgrade"
      ? [
          {
            icon: Wrench,
            title: t("SETTINGS$AGENT_SERVER_STEP_UPGRADE_TITLE", {
              minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
            }),
            description: t("SETTINGS$AGENT_SERVER_STEP_UPGRADE_DESCRIPTION", {
              minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
            }),
          },
          {
            icon: Globe,
            title: t("SETTINGS$AGENT_SERVER_STEP_URL_TITLE"),
            description: t("SETTINGS$AGENT_SERVER_STEP_URL_DESCRIPTION"),
          },
          {
            icon: RefreshCw,
            title: t("SETTINGS$AGENT_SERVER_STEP_RECONNECT_TITLE"),
            description: t("SETTINGS$AGENT_SERVER_STEP_RECONNECT_DESCRIPTION"),
          },
        ]
      : [
          {
            icon: Server,
            title: t("SETTINGS$AGENT_SERVER_STEP_START_TITLE", {
              minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
            }),
            description: t("SETTINGS$AGENT_SERVER_STEP_START_DESCRIPTION", {
              minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
            }),
          },
          {
            icon: Globe,
            title: t("SETTINGS$AGENT_SERVER_STEP_URL_TITLE"),
            description: t("SETTINGS$AGENT_SERVER_STEP_URL_DESCRIPTION"),
          },
          {
            icon: Upload,
            title: t("SETTINGS$AGENT_SERVER_STEP_SAVE_TITLE"),
            description: t("SETTINGS$AGENT_SERVER_STEP_SAVE_DESCRIPTION"),
          },
        ];

  return (
    <div className={cn("grid gap-4 md:grid-cols-3", className)}>
      {steps.map(({ icon: Icon, title, description }, index) => (
        <div
          key={title}
          className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/15 p-2 text-primary">
              <Icon className="size-4" />
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-gray-400">
              {t("SETTINGS$AGENT_SERVER_STEP_LABEL", { step: index + 1 })}
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-white">{title}</p>
          <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
        </div>
      ))}
    </div>
  );
}
