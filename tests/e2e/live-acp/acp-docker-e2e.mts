/**
 * Live e2e for the containerized ACP path (agent-canvas#1013/#1014).
 *
 * Exercises CANVAS'S OWN code path — it imports {@link buildStartConversationRequest}
 * and builds each provider's start request exactly as the app does, then POSTs it
 * to a real agent-server container and asserts a real agent reply. This is the
 * "it actually works" check the unit tests can't give: it proves the secrets
 * Canvas emits, plus the SDK's acp_file_secrets materialisation, authenticate the
 * CLI end-to-end.
 *
 * Excluded from `npm test` (lives under tests/). Run it by hand against a running
 * container:
 *
 *   docker run -d --name oh-acp -p 8010:8000 -v oh-acp-data:/workspace \
 *     -v "$(pwd)/tools:/canvas-tools:ro" -e OH_EXTRA_PYTHON_PATH=/canvas-tools \
 *     ghcr.io/openhands/agent-server:<sha>-python
 *   npx vite-node tests/e2e/live-acp/acp-docker-e2e.mts -- codex claude gemini
 *
 * Credentials are read from the host (never printed): Codex ~/.codex/auth.json,
 * the Claude Code OAuth token from the macOS keychain, and the gcloud ADC for
 * Gemini Vertex. A provider whose credentials aren't present is skipped.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { buildStartConversationRequest } from "#/api/agent-server-adapter";
import { DEFAULT_SETTINGS } from "#/services/settings";

const BASE = process.env.ACP_E2E_BASE_URL ?? "http://localhost:8010";
// Canvas gives every conversation its OWN working_dir (<base>/<id_hex>) so the
// agent-server can init a fresh git repo + worktree per conversation. Mirror
// that here with a unique dir per run/provider — sharing one dir makes the
// second `git worktree add` collide on the same repo.
const WORKING_DIR_BASE =
  process.env.ACP_E2E_WORKING_DIR_BASE ?? "/workspace/acp-e2e";
const POLL_TIMEOUT_MS = Number(process.env.ACP_E2E_TIMEOUT_MS ?? 180_000);

type ProviderId = "codex" | "claude" | "gemini";

interface ProviderPlan {
  id: ProviderId;
  /** ACP registry key sent as acp_server. */
  acpServer: string;
  /** acp_model to send (a model the account/Vertex project supports). */
  model: string;
  expectedToken: string;
  /** Reserved-credential map (name -> value) or null when creds are missing. */
  collectSecrets: () => Record<string, string> | null;
  /**
   * Optional ``acp_session_mode`` override (env-driven). Canvas itself sends
   * none — the SDK then uses the provider's registry default. For Gemini that
   * default (``bypassPermissions``) makes gemini-cli ≥0.43 error on
   * ``set_session_mode`` during headless init (an SDK/gemini-cli issue, not a
   * credential one); set ``ACP_E2E_GEMINI_SESSION_MODE=default`` to confirm the
   * credential path end-to-end past that blocker.
   */
  sessionMode?: string;
}

function readFileTrimmed(file: string): string | null {
  try {
    const value = readFileSync(file, "utf-8");
    return value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

function claudeOAuthToken(): string | null {
  // macOS keychain entry written by Claude Code on login.
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf-8" },
    );
    const token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function gcloudProject(): string | null {
  try {
    return (
      execFileSync("gcloud", ["config", "get-value", "project"], {
        encoding: "utf-8",
      }).trim() || null
    );
  } catch {
    return null;
  }
}

const PLANS: ProviderPlan[] = [
  {
    id: "codex",
    acpServer: "codex",
    model: process.env.ACP_E2E_CODEX_MODEL ?? "gpt-5.5/medium",
    expectedToken: "ACPOK-CODEX",
    collectSecrets: () => {
      const auth = readFileTrimmed(path.join(homedir(), ".codex", "auth.json"));
      return auth ? { CODEX_AUTH_JSON: auth } : null;
    },
  },
  {
    id: "claude",
    acpServer: "claude-code",
    model: process.env.ACP_E2E_CLAUDE_MODEL ?? "claude-opus-4-7",
    expectedToken: "ACPOK-CLAUDE",
    collectSecrets: () => {
      const token = claudeOAuthToken();
      // NB: deliberately NOT setting ANTHROPIC_BASE_URL — an inherited base URL
      // breaks the OAuth token's bearer auth.
      return token ? { CLAUDE_CODE_OAUTH_TOKEN: token } : null;
    },
  },
  {
    id: "gemini",
    acpServer: "gemini-cli",
    model: process.env.ACP_E2E_GEMINI_MODEL ?? "gemini-2.5-flash",
    expectedToken: "ACPOK-GEMINI",
    collectSecrets: () => {
      const adc = readFileTrimmed(
        path.join(
          homedir(),
          ".config",
          "gcloud",
          "application_default_credentials.json",
        ),
      );
      const project = process.env.GOOGLE_CLOUD_PROJECT ?? gcloudProject();
      if (!adc || !project) return null;
      return {
        GOOGLE_APPLICATION_CREDENTIALS_JSON: adc,
        GOOGLE_CLOUD_PROJECT: project,
        GOOGLE_CLOUD_LOCATION:
          process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
        GOOGLE_GENAI_USE_VERTEXAI: "true",
      };
    },
    sessionMode: process.env.ACP_E2E_GEMINI_SESSION_MODE,
  },
];

function buildRequest(
  plan: ProviderPlan,
  secrets: Record<string, string>,
  workingDir: string,
) {
  // Build via the same function the app uses — this is the whole point of the
  // exercise. We pass acpStaticSecrets directly (the app reads these back from
  // the saved global secrets in buildStartConversationRequestWithEncryptedSettings).
  return buildStartConversationRequest({
    settings: {
      ...DEFAULT_SETTINGS,
      agent_settings: {
        ...DEFAULT_SETTINGS.agent_settings,
        agent_kind: "acp",
        acp_server: plan.acpServer,
        acp_model: plan.model,
        ...(plan.sessionMode ? { acp_session_mode: plan.sessionMode } : {}),
      },
      conversation_settings: {
        ...DEFAULT_SETTINGS.conversation_settings,
        max_iterations: 8,
      },
    },
    query: `Reply with exactly: ${plan.expectedToken}`,
    workingDir,
    acpStaticSecrets: secrets,
  });
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${url} -> ${res.status}: ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

const TERMINAL = new Set([
  "finished",
  "idle",
  "error",
  "stuck",
  "completed",
  "stopped",
]);

async function runProvider(plan: ProviderPlan): Promise<boolean> {
  const secrets = plan.collectSecrets();
  if (!secrets) {
    console.log(`\n⏭️  ${plan.id}: SKIP — credentials not present on host`);
    return true; // skip is not a failure
  }
  console.log(
    `\n▶️  ${plan.id}: building request via buildStartConversationRequest ` +
      `(acp_server=${plan.acpServer}, acp_model=${plan.model}, ` +
      `secrets=[${Object.keys(secrets).join(", ")}])`,
  );

  const workingDir = `${WORKING_DIR_BASE}/${plan.id}-${Date.now()}`;
  const payload = buildRequest(plan, secrets, workingDir);
  // Sanity-check the request the app would send, without leaking values.
  const emitted = payload.secrets as Record<string, { kind: string }>;
  console.log(
    `   emitted secret kinds: ${Object.entries(emitted ?? {})
      .map(([k, v]) => `${k}=${v.kind}`)
      .join(", ")}`,
  );

  const created = await postJson(`${BASE}/api/conversations`, payload);
  const id = created.id;
  console.log(`   conversation ${id} created; polling…`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let status = "";
  while (Date.now() < deadline) {
    const info = await getJson(`${BASE}/api/conversations/${id}`);
    status = String(info.execution_status ?? "").toLowerCase();
    if (TERMINAL.has(status)) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  console.log(`   execution_status=${status}`);

  const final = await getJson(
    `${BASE}/api/conversations/${id}/agent_final_response`,
  );
  const reply =
    typeof final === "string"
      ? final
      : (final?.response ?? final?.content ?? JSON.stringify(final));
  const ok = String(reply).includes(plan.expectedToken);
  console.log(
    `   reply: ${JSON.stringify(String(reply).slice(0, 200))}\n   ${
      ok ? "✅ PASS" : "❌ FAIL"
    } (expected to contain "${plan.expectedToken}")`,
  );
  if (!ok && plan.id === "gemini" && !plan.sessionMode && status === "error") {
    // The credential path (materialise ADC → vertex-ai auth) is what this PR
    // proves; gemini-cli ≥0.43 rejects the registry default session mode
    // ("yolo") during headless init — an SDK/gemini-cli issue, not a credential
    // one. Re-run with the override to confirm the full turn.
    console.log(
      "   ℹ️  Likely the SDK/gemini-cli set_session_mode('yolo') blocker, not a " +
        "credential problem. Re-run with ACP_E2E_GEMINI_SESSION_MODE=default to " +
        "confirm the credential path end-to-end.",
    );
  }
  return ok;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const selected =
    args.length > 0 ? PLANS.filter((p) => args.includes(p.id)) : PLANS;

  console.log(`ACP Docker e2e against ${BASE} — providers: ${selected
    .map((p) => p.id)
    .join(", ")}`);

  const results: Array<{ id: ProviderId; ok: boolean }> = [];
  for (const plan of selected) {
    try {
      results.push({ id: plan.id, ok: await runProvider(plan) });
    } catch (error) {
      console.log(`   ❌ ${plan.id} errored: ${(error as Error).message}`);
      results.push({ id: plan.id, ok: false });
    }
  }

  console.log("\n=== summary ===");
  for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"} ${r.id}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} provider(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll selected providers passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
