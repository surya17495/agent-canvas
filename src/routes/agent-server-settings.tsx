import React from "react";
import { useTranslation } from "react-i18next";
import {
  AgentServerChecklist,
  AgentServerConnectionForm,
} from "#/components/features/settings/agent-server-onboarding";
import { Typography } from "#/ui/typography";

export const clientLoader = async () => null;
export const handle = { hideTitle: true };

export function AgentServerSettingsScreen() {
  const { t } = useTranslation();

  return (
    <div
      data-testid="agent-server-settings-screen"
      className="flex h-full flex-col gap-8"
    >
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
          {t("SETTINGS$AGENT_SERVER_ONBOARDING_EYEBROW")}
        </p>
        <Typography.H2 className="mt-4 text-3xl font-semibold leading-tight text-white">
          {t("SETTINGS$AGENT_SERVER_SETTINGS_TITLE")}
        </Typography.H2>
        <p className="mt-4 text-sm leading-7 text-gray-400">
          {t("SETTINGS$AGENT_SERVER_DESCRIPTION")}
        </p>
      </div>

      <AgentServerChecklist />

      <div className="max-w-2xl">
        <AgentServerConnectionForm />
      </div>
    </div>
  );
}

export default AgentServerSettingsScreen;
