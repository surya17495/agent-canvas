import OpenHandsLogo from "#/assets/branding/openhands-logo.svg?react";
import TerminalIcon from "#/icons/terminal.svg?react";
import {
  CLAUDE_CODE_MARK_PATH,
  CLAUDE_CODE_VIEWBOX,
  CODEX_MARK_PATH,
  CODEX_VIEWBOX,
  GEMINI_MARK_PATH,
  GEMINI_VIEWBOX,
} from "#/constants/acp-brand-marks";
import {
  resolveAcpProviderIcon,
  type ACPProviderIcon,
} from "#/constants/acp-providers";
import { cn } from "#/utils/utils";

/**
 * Discriminator for which agent harness the chip represents.
 *  - ``"openhands"`` — native conversation; renders the OpenHands logo.
 *  - any ``ACPProviderIcon`` — Claude Code, Codex, Gemini, etc.
 *
 * Callers don't usually pass this directly; use ``agentBrandFromConversation``
 * below to derive it from an ``AppConversation``.
 */
export type AgentBrandKind = "openhands" | ACPProviderIcon;

interface AgentBrandIconProps {
  kind: AgentBrandKind;
  /** Pixel size for the icon (height; OpenHands logo keeps native aspect). */
  size?: number;
  className?: string;
  "data-testid"?: string;
}

/**
 * Small, monochromatic brand mark for a conversation's agent harness.
 *
 * Mirrors the chip iconography in OpenHands' main web UI (PR #14510): icon
 * encodes the harness, accompanying text encodes the LLM model. Generic
 * fallback for custom or unknown ACP servers is a terminal glyph, same as
 * the onboarding tile.
 */
export function AgentBrandIcon({
  kind,
  size = 12,
  className,
  "data-testid": testId,
}: AgentBrandIconProps) {
  if (kind === "openhands") {
    // Logo is wider than tall (~3:2); use a proportional width so it doesn't
    // squash. ``shrink-0`` keeps it from collapsing inside flex rows.
    return (
      <OpenHandsLogo
        width={Math.round((size * 47) / 30)}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-openhands"}
        aria-hidden
      />
    );
  }
  if (kind === "claude-code") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={CLAUDE_CODE_VIEWBOX}
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-claude-code"}
        aria-hidden
      >
        <path fill="currentColor" d={CLAUDE_CODE_MARK_PATH} />
      </svg>
    );
  }
  if (kind === "codex") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={CODEX_VIEWBOX}
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-codex"}
        aria-hidden
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d={CODEX_MARK_PATH}
          fill="currentColor"
        />
      </svg>
    );
  }
  if (kind === "gemini") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={GEMINI_VIEWBOX}
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-gemini"}
        aria-hidden
      >
        <path fill="currentColor" d={GEMINI_MARK_PATH} />
      </svg>
    );
  }
  // ``cli-generic`` and anything else → neutral terminal glyph.
  return (
    <TerminalIcon
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      data-testid={testId ?? "agent-brand-icon-generic"}
      aria-hidden
    />
  );
}

/**
 * Resolve the chip's icon kind from a conversation's agent metadata.
 * Returns ``null`` when there's nothing meaningful to show (e.g. an OpenHands
 * conversation with no model — caller hides the chip entirely).
 */
export function agentBrandFromConversation(args: {
  agentKind: "openhands" | "acp" | null | undefined;
  acpServer: string | null | undefined;
  llmModel: string | null | undefined;
}): AgentBrandKind | null {
  if (args.agentKind === "acp") {
    return resolveAcpProviderIcon(args.acpServer ?? null);
  }
  // Native OpenHands conversations only show the chip when there's a model
  // to display next to the logo.
  return args.llmModel ? "openhands" : null;
}
