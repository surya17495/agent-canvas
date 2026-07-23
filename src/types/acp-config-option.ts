/**
 * Normalized ACP session configuration options.
 *
 * The agent-server (fork `surya17495/software-agent-sdk`, G8 relay) lifts each
 * ACP session's advertised `configOptions` (reasoning effort, build/plan mode,
 * any server-defined select/boolean) onto `ConversationInfo.config_options` as
 * stable DTOs, insulated from upstream ACP protocol churn. This file mirrors
 * those DTOs (`ACPConfigOption` / `ACPConfigOptionChoice` in
 * `openhands/sdk/agent/acp_models.py`) so the shell can render dynamic
 * pickers and change options live via the `set_acp_config_option` route.
 */

/** One selectable value of a `select` {@link ACPConfigOption}. */
export interface ACPConfigOptionChoice {
  /**
   * Stable identifier for this choice — the value passed back to
   * `set_acp_config_option` to select it.
   */
  value: string;
  /** Human-readable label; fall back to `value` when absent. */
  name?: string | null;
  description?: string | null;
  /**
   * Label of the group this choice belonged to when the ACP server returned
   * grouped options; `null` for ungrouped choices. Display-only.
   */
  group?: string | null;
}

/** One session configuration option an ACP server advertises. */
export interface ACPConfigOption {
  /**
   * Stable identifier for the option — the `config_id` passed to
   * `set_acp_config_option`.
   */
  id: string;
  /** Human-readable label; fall back to `id` when absent. */
  name?: string | null;
  /** Renderer hint: a `select` dropdown or a `boolean` toggle. */
  type: "select" | "boolean";
  description?: string | null;
  /** Optional semantic category for grouping in the UI (UX only). */
  category?: string | null;
  /**
   * Currently selected value: a `choices[].value` for `select` options,
   * `true`/`false` for `boolean` options. `null`/absent when the ACP server
   * didn't report one.
   */
  current_value?: string | boolean | null;
  /** Selectable values for a `select` option (empty for `boolean`). */
  choices?: ACPConfigOptionChoice[] | null;
}
