import { describe, it, expect } from "vitest";
import { getBundleAction } from "#/utils/agent-bundle/get-bundle-action";
import {
  bundleId,
  type ActiveAgentBundleContext,
  type AgentModelBundle,
} from "#/types/agent-model-bundle";

const openhandsBundle = (profileName: string): AgentModelBundle => ({
  kind: "openhands",
  id: bundleId.openhands(profileName),
  label: profileName,
  profileName,
  model: `model-for-${profileName}`,
});

const acpBundle = (
  provider: string,
  model: string,
  supportsRuntimeSwitch = true,
): AgentModelBundle => ({
  kind: "acp",
  id: bundleId.acp(provider, model),
  label: model,
  provider,
  providerLabel: provider,
  model,
  supportsRuntimeSwitch,
});

const ctx = (
  overrides: Partial<ActiveAgentBundleContext> = {},
): ActiveAgentBundleContext => ({
  backendKind: "local",
  hasConversation: true,
  conversationAgentKind: "openhands",
  conversationAcpProvider: null,
  currentBundleId: null,
  sessionInitialized: true,
  ...overrides,
});

describe("getBundleAction", () => {
  it("marks the running/selected bundle current regardless of everything else", () => {
    const bundle = acpBundle("claude-code", "claude-opus-4-7");
    // Even on cloud, even uninitialized — the current selection wins first.
    expect(
      getBundleAction(
        bundle,
        ctx({
          backendKind: "cloud",
          sessionInitialized: false,
          currentBundleId: bundle.id,
        }),
      ),
    ).toEqual({ action: "current" });
  });

  it("marks the saved default current at home too", () => {
    const bundle = openhandsBundle("gpt-5");
    expect(
      getBundleAction(
        bundle,
        ctx({ hasConversation: false, currentBundleId: bundle.id }),
      ),
    ).toEqual({ action: "current" });
  });

  it("cloud: non-current bundles are disabled with reason cloud", () => {
    expect(
      getBundleAction(openhandsBundle("gpt-5"), ctx({ backendKind: "cloud" })),
    ).toEqual({ action: "disabled", reason: "cloud" });
  });

  describe("home (no conversation): everything is set-default", () => {
    it("native profile → set-default", () => {
      expect(
        getBundleAction(
          openhandsBundle("gpt-5"),
          ctx({ hasConversation: false, conversationAgentKind: null }),
        ),
      ).toEqual({ action: "set-default" });
    });

    it("ACP model → set-default", () => {
      expect(
        getBundleAction(
          acpBundle("codex", "gpt-5.5-codex"),
          ctx({ hasConversation: false, conversationAgentKind: null }),
        ),
      ).toEqual({ action: "set-default" });
    });
  });

  describe("native conversation", () => {
    const nativeCtx = ctx({ conversationAgentKind: "openhands" });

    it("native profile → switch-live", () => {
      expect(getBundleAction(openhandsBundle("gpt-5"), nativeCtx)).toEqual({
        action: "switch-live",
      });
    });

    it("ACP bundle → start-new-only (different-agent)", () => {
      expect(
        getBundleAction(acpBundle("claude-code", "claude-opus-4-7"), nativeCtx),
      ).toEqual({ action: "start-new-only", reason: "different-agent" });
    });
  });

  describe("ACP conversation (claude-code, initialized)", () => {
    const acpCtx = ctx({
      conversationAgentKind: "acp",
      conversationAcpProvider: "claude-code",
      sessionInitialized: true,
    });

    it("same provider, other model, runtime-capable → switch-live", () => {
      expect(
        getBundleAction(acpBundle("claude-code", "claude-sonnet-4-6"), acpCtx),
      ).toEqual({ action: "switch-live" });
    });

    it("same provider but provider can't runtime-switch → start-new-only (unsupported)", () => {
      expect(
        getBundleAction(
          acpBundle("claude-code", "claude-sonnet-4-6", false),
          acpCtx,
        ),
      ).toEqual({ action: "start-new-only", reason: "unsupported" });
    });

    it("different ACP provider → start-new-only (different-agent)", () => {
      expect(
        getBundleAction(acpBundle("codex", "gpt-5.5-codex"), acpCtx),
      ).toEqual({ action: "start-new-only", reason: "different-agent" });
    });

    it("native profile → start-new-only (different-agent)", () => {
      expect(getBundleAction(openhandsBundle("gpt-5"), acpCtx)).toEqual({
        action: "start-new-only",
        reason: "different-agent",
      });
    });
  });

  describe("ACP conversation (claude-code, NOT initialized)", () => {
    const uninitCtx = ctx({
      conversationAgentKind: "acp",
      conversationAcpProvider: "claude-code",
      sessionInitialized: false,
    });

    it("same provider, runtime-capable, no session yet → start-new-only (uninitialized) — lossless fork before the ACP subprocess spawns", () => {
      expect(
        getBundleAction(
          acpBundle("claude-code", "claude-sonnet-4-6"),
          uninitCtx,
        ),
      ).toEqual({ action: "start-new-only", reason: "uninitialized" });
    });

    it("session-initialized gate does not affect cross-provider (still start-new-only)", () => {
      expect(
        getBundleAction(acpBundle("codex", "gpt-5.5-codex"), uninitCtx),
      ).toEqual({ action: "start-new-only", reason: "different-agent" });
    });
  });
});
