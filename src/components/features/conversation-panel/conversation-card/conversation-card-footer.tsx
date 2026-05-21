import { useTranslation } from "react-i18next";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { RepositorySelection } from "#/api/open-hands.types";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { isExecutionPaused } from "#/utils/status";
import {
  getAcpProviderDisplayName,
  resolveAcpProviderIcon,
} from "#/constants/acp-providers";
import {
  AgentBrandIcon,
  type AgentBrandKind,
} from "#/components/shared/agent-brand-icon";
import { ConversationRepoLink } from "./conversation-repo-link";
import { NoRepository } from "./no-repository";

interface ConversationCardFooterProps {
  selectedRepository: RepositorySelection | null;
  lastUpdatedAt: string;
  createdAt?: string;
  executionStatus?: ExecutionStatus | null;
  workspaceWorkingDir?: string | null;
  showRepositoryMetadata?: boolean;
  showTimestamp?: boolean;
  llmModel?: string | null;
  showLlmModel?: boolean;
  /**
   * High-level kind of the conversation's agent. The ACP-agent chip is
   * only rendered when this is ``"acp"``. The OpenHands rendering path
   * is intentionally untouched — for OpenHands conversations the chip is
   * suppressed regardless of any ``acpServer`` value (defensive against
   * stray wire tags on non-ACP conversations).
   */
  agentKind?: "openhands" | "acp" | null;
  /**
   * Registry key of the ACP CLI server (``"claude-code"`` / ``"codex"`` /
   * ``"gemini-cli"`` / unknown / null). Resolved to a human display name
   * via {@link getAcpProviderDisplayName}; unknown / null falls back to
   * a generic "ACP" label so a Custom-command preset still produces a
   * useful chip. Always shown for ACP conversations — this is identity
   * info, not gated by the ``showLlmModel`` preference (which is about
   * LLM model strings, an orthogonal concern).
   */
  acpServer?: string | null;
}

export function ConversationCardFooter({
  selectedRepository,
  lastUpdatedAt,
  createdAt,
  executionStatus,
  workspaceWorkingDir,
  showRepositoryMetadata = true,
  showTimestamp = true,
  llmModel,
  showLlmModel = false,
  agentKind = null,
  acpServer = null,
}: ConversationCardFooterProps) {
  const { t } = useTranslation("openhands");

  const isPaused = isExecutionPaused(executionStatus);

  // Pick the chip's icon + text. For ACP we always show the chip (identity
  // info): icon = provider brand mark, text = model the agent is running
  // (lifted from ConversationInfo.current_model_name via the adapter), with
  // the provider display name as a fallback when no model surfaced. For
  // OpenHands we gate behind the existing ``showLlmModel`` preference and
  // render the OpenHands logo + raw model id.
  let chip: { kind: AgentBrandKind; text: string; tooltip: string } | null =
    null;
  if (agentKind === "acp") {
    const providerName =
      getAcpProviderDisplayName(acpServer) ??
      t(I18nKey.CONVERSATION$ACP_AGENT_GENERIC);
    const text = llmModel ?? providerName;
    chip = {
      kind: resolveAcpProviderIcon(acpServer),
      text,
      // Hover always reveals the harness + model so the chip is
      // unambiguous even when the text is just the model name.
      tooltip: llmModel ? `${providerName} · ${llmModel}` : providerName,
    };
  } else if (showLlmModel && llmModel) {
    chip = { kind: "openhands", text: llmModel, tooltip: llmModel };
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 mt-0.5 w-full min-w-0",
        isPaused && "opacity-60",
      )}
    >
      {chip ? (
        <div className="pl-[18px]">
          <span
            data-testid="conversation-card-agent-chip"
            className="inline-flex items-center gap-1 text-xs text-[var(--oh-muted)] max-w-full min-w-0"
            title={chip.tooltip}
          >
            <AgentBrandIcon kind={chip.kind} />
            <span className="truncate">{chip.text}</span>
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          // Align repo/workspace row with the title (status dot + gap).
          "flex flex-row items-center gap-2 w-full min-w-0",
          showRepositoryMetadata && "pl-[18px]",
        )}
      >
        {showRepositoryMetadata &&
          (selectedRepository?.selected_repository ? (
            <ConversationRepoLink selectedRepository={selectedRepository} />
          ) : (
            <NoRepository workspaceWorkingDir={workspaceWorkingDir} />
          ))}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {showTimestamp && (createdAt ?? lastUpdatedAt) && (
            <p className="text-xs text-[var(--oh-muted)] text-right">
              <time>
                {`${formatTimeDelta(lastUpdatedAt ?? createdAt)} ${t(I18nKey.CONVERSATION$AGO)}`}
              </time>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
