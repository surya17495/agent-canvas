import type {
  ActiveAgentBundleContext,
  AgentModelBundle,
  BundleActionResult,
} from "#/types/agent-model-bundle";

/**
 * The transition matrix — the contract at the heart of the unified picker.
 *
 * Pure function: given a selectable {@link AgentModelBundle} and the running
 * {@link ActiveAgentBundleContext}, decide what selecting it does. The
 * asymmetry between native (swappable API config) and ACP (a subprocess
 * bound to one provider) is encoded here rather than spread across the UI.
 *
 * | Context                         | Target                         | Result |
 * | ------------------------------- | ------------------------------ | ------ |
 * | any                             | the running/selected bundle    | `current` |
 * | cloud                           | anything else                  | `disabled` (cloud) |
 * | home (no conversation)          | any bundle                     | `set-default` |
 * | native conversation             | native profile                 | `switch-live` |
 * | native conversation             | any ACP bundle                 | `start-new-only` (different-agent) |
 * | ACP conversation (provider P)   | P, other model, runtime-switch | `switch-live` if session initialized; else `start-new-only` (uninitialized) |
 * | ACP conversation (provider P)   | P, other model, no runtime sw. | `start-new-only` (unsupported) |
 * | ACP conversation                | other provider / native        | `start-new-only` (different-agent) |
 *
 * Capability has two inputs: the *static* per-provider
 * ``supportsRuntimeSwitch`` (from the SDK registry) and the *dynamic*
 * ``sessionInitialized`` (the ACP subprocess only spawns on the first
 * ``run()`` — see ``ACPAgent._start_acp_server``; ``switch_acp_model`` 409s
 * with ``RuntimeError("ACP session is not initialized…")`` until then).
 * Both inputs are required to tell "switch now" from "fork instead — the
 * subprocess hasn't started so the change is lossless" from "this agent
 * can't switch live at all". The uninitialized fork is the canvas-only
 * answer until the SDK exposes a pre-spawn ``acp_model`` patch.
 */
export function getBundleAction(
  bundle: AgentModelBundle,
  ctx: ActiveAgentBundleContext,
): BundleActionResult {
  // The running / saved-default selection is always "current", on every
  // surface (home included, so the active default reads as selected).
  if (bundle.id === ctx.currentBundleId) {
    return { action: "current" };
  }

  // Cloud is display-only — neither profiles nor ACP switching apply
  // (both are local-backend-only, matching the existing guards).
  if (ctx.backendKind === "cloud") {
    return { action: "disabled", reason: "cloud" };
  }

  // Home / no session: every bundle is selectable and persists the default
  // the next conversation inherits.
  if (!ctx.hasConversation) {
    return { action: "set-default" };
  }

  if (bundle.kind === "openhands") {
    // Native profiles swap live within a native conversation; from an ACP
    // conversation they need a fresh (non-subprocess) agent — a new
    // conversation.
    return ctx.conversationAgentKind === "openhands"
      ? { action: "switch-live" }
      : { action: "start-new-only", reason: "different-agent" };
  }

  // ACP bundle. Only a same-provider model can switch in place — a different
  // provider (or switching from a native conversation) requires a fresh
  // subprocess, i.e. a new conversation.
  const sameProvider =
    ctx.conversationAgentKind === "acp" &&
    ctx.conversationAcpProvider === bundle.provider;
  if (!sameProvider) {
    return { action: "start-new-only", reason: "different-agent" };
  }

  if (!bundle.supportsRuntimeSwitch) {
    // Provider can't ``session/set_model`` mid-conversation at all.
    return { action: "start-new-only", reason: "unsupported" };
  }

  if (!ctx.sessionInitialized) {
    // Runtime-capable, but the ACP subprocess hasn't been spawned yet —
    // ``_start_acp_server`` only runs on the conversation's first ``run()``,
    // so ``switch_acp_model`` would 409 until the first message. The source
    // conversation is by definition empty (zero events), so a fork carries
    // no work loss; ``useStartNewWithBundle`` deletes the empty source on
    // success so the user sees a single conversation on the new model
    // rather than a leftover empty one.
    return { action: "start-new-only", reason: "uninitialized" };
  }

  return { action: "switch-live" };
}
