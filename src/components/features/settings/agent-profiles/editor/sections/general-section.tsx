import { useTranslation } from "react-i18next";
import { ProfileNameInput } from "#/components/features/settings/llm-profiles/profile-name-input";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import type { AgentProfileForm } from "../use-agent-profile-form";
import { SectionShell } from "./section-shell";

interface GeneralSectionProps {
  form: AgentProfileForm;
}

export function GeneralSection({ form }: GeneralSectionProps) {
  const { t } = useTranslation("openhands");
  const kindLabel = form.isAcp
    ? t(I18nKey.SETTINGS$AGENT_TYPE_ACP)
    : t(I18nKey.SETTINGS$AGENT_TYPE_OPENHANDS);

  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_GENERAL)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_GENERAL_DESC)}
    >
      <ProfileNameInput
        testId="agent-profile-name-input"
        value={form.name}
        onChange={form.setName}
        isRequired
      />

      <div className="flex flex-col gap-1">
        <Typography.Text className="text-sm font-medium text-white">
          {t(I18nKey.SETTINGS$AGENT_PROFILE_KIND_LABEL)}
        </Typography.Text>
        <Typography.Text
          className="text-sm text-[#A3A3A3]"
          testId="agent-profile-kind-display"
        >
          {kindLabel}
        </Typography.Text>
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$AGENT_PROFILE_KIND_FIXED_HINT)}
        </Typography.Text>
      </div>
    </SectionShell>
  );
}
