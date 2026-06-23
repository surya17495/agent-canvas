import { useTranslation } from "react-i18next";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { McpServerRefsSelect } from "../../mcp-server-refs-select";
import { AgentProfileVerificationFields } from "../../agent-profile-verification-fields";
import type { AgentProfileForm } from "../use-agent-profile-form";
import { SectionShell } from "./section-shell";

interface SectionProps {
  form: AgentProfileForm;
}

export function ModelSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_MODEL)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_MODEL_DESC)}
    >
      <SettingsDropdownInput
        testId="agent-profile-llm-ref"
        name="llm-profile-ref"
        label={t(I18nKey.SETTINGS$AGENT_PROFILE_LLM_REF_LABEL)}
        items={form.llmProfiles.map((p) => ({ key: p.name, label: p.name }))}
        selectedKey={form.llmProfileRef || undefined}
        placeholder={t(I18nKey.SETTINGS$AGENT_PROFILE_LLM_REF_REQUIRED)}
        isClearable={false}
        required
        onSelectionChange={(key) => {
          if (key) form.setLlmProfileRef(String(key));
        }}
      />
      <CatalogManageLink i18nKey={I18nKey.SETTINGS$AGENT_MANAGE_LLM_PROFILES} />
    </SectionShell>
  );
}

export function ToolsMcpSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_TOOLS_MCP)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_TOOLS_MCP_DESC)}
    >
      <McpServerRefsSelect
        availableServers={form.mcpServerNames}
        value={form.mcpServerRefs}
        onChange={form.setMcpServerRefs}
      />
      <CatalogManageLink i18nKey={I18nKey.SETTINGS$AGENT_MANAGE_MCP_SERVERS} />
      <div className="rounded-md border border-dashed border-[#3D4046] p-3">
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$AGENT_TOOLS_DEFERRED_NOTE)}
        </Typography.Text>
      </div>
    </SectionShell>
  );
}

export function MemorySection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_MEMORY)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_MEMORY_DESC)}
    >
      {form.hasSummarizingCondenser ? (
        <SettingsInput
          testId="agent-profile-condenser-max-size"
          label={t(I18nKey.SETTINGS$AGENT_MEMORY_TRIGGER_LABEL)}
          type="number"
          min={10}
          step={1}
          className="w-full max-w-xs"
          value={form.condenserMaxSize}
          onChange={form.setCondenserMaxSize}
        />
      ) : (
        <Typography.Text
          className="text-sm text-[#A3A3A3]"
          testId="agent-profile-memory-default"
        >
          {t(I18nKey.SETTINGS$AGENT_MEMORY_NO_CONDENSER)}
        </Typography.Text>
      )}
    </SectionShell>
  );
}

export function VerificationSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SCHEMA$VERIFICATION$SECTION_LABEL)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_VERIFICATION_DESC)}
    >
      <AgentProfileVerificationFields
        value={form.verification}
        onChange={form.setVerification}
      />
    </SectionShell>
  );
}

export function PersonalitySection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_PERSONALITY)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_PERSONALITY_DESC)}
    >
      <SettingsInput
        testId="agent-profile-system-suffix"
        label={t(I18nKey.SETTINGS$AGENT_PROFILE_SYSTEM_SUFFIX_LABEL)}
        type="text"
        className="w-full"
        showOptionalTag
        value={form.systemSuffix}
        onChange={form.setSystemSuffix}
      />
    </SectionShell>
  );
}

export function AdvancedSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_ADVANCED)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_ADVANCED_DESC)}
    >
      <SettingsSwitch
        testId="agent-profile-sub-agents"
        isToggled={form.enableSubAgents}
        onToggle={form.setEnableSubAgents}
      >
        {t(I18nKey.SCHEMA$ENABLE_SUB_AGENTS$LABEL)}
      </SettingsSwitch>

      <SettingsInput
        testId="agent-profile-tool-concurrency"
        label={t(I18nKey.SETTINGS$AGENT_PROFILE_TOOL_CONCURRENCY_LABEL)}
        type="number"
        min={1}
        step={1}
        className="w-full max-w-xs"
        value={form.toolConcurrency}
        onChange={form.setToolConcurrency}
      />
    </SectionShell>
  );
}

/** A "Manage ↗" link to the relevant building-block catalog. The catalogs move
 * under the Agents hub later (#1456 step 3); for now this is a hint that the
 * pool of LLM profiles / MCP servers is configured elsewhere, not inline. */
function CatalogManageLink({ i18nKey }: { i18nKey: I18nKey }) {
  const { t } = useTranslation("openhands");
  return (
    <Typography.Text className="text-xs text-[#717888]">
      {t(i18nKey)}
    </Typography.Text>
  );
}
