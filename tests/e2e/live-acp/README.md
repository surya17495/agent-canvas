# Live ACP-in-Docker e2e

Proves the containerized ACP credential path **through Canvas's own request
builder** (`buildStartConversationRequest`) against a real agent-server
container, with real provider API calls. It's the "it actually works" companion
to the unit tests in `__tests__/api/agent-server-adapter.test.ts` — those assert
the request shape; this asserts a real agent reply.

It is **not** part of `npm test` (it lives under `tests/`, which Vitest excludes,
and needs a running container + real host credentials).

## Run it

```bash
# 1. Agent-server container with the canvas_ui tool mounted (as the dev stack does).
SHA=$(gh api repos/OpenHands/software-agent-sdk/commits/main --jq '.sha[0:7]')
docker run -d --name oh-acp -p 8010:8000 \
  -v oh-acp-data:/workspace \
  -v "$(pwd)/tools:/canvas-tools:ro" -e OH_EXTRA_PYTHON_PATH=/canvas-tools \
  ghcr.io/openhands/agent-server:${SHA}-python

# 2. Run the e2e (all providers, or a subset).
npx vite-node -c tests/e2e/live-acp/vite-node.config.mts \
  tests/e2e/live-acp/acp-docker-e2e.mts -- codex claude gemini

# 3. Tear down (holds real creds).
docker rm -f oh-acp
```

Credentials are read from the host and **never printed**: Codex `~/.codex/auth.json`,
the Claude Code OAuth token from the macOS keychain, and the gcloud ADC for Gemini
Vertex (`gcloud auth application-default login` first). A provider whose creds
aren't present is skipped.

## Last validated result (agent-server `c950fdb-python`)

| Provider | Result | Evidence (agent-server logs) |
|---|---|---|
| **Codex** | ✅ real reply `ACPOK-CODEX` | `Materialised ACP file-secret 'CODEX_AUTH_JSON' -> …/acp/codex/auth.json`; codex-acp 0.15.0; `Authenticating with ACP method: chatgpt` |
| **Claude Code** | ✅ real reply `ACPOK-CLAUDE` | claude-agent-acp 0.40.0; `CLAUDE_CODE_OAUTH_TOKEN` env path (no `ANTHROPIC_BASE_URL`) |
| **Gemini CLI** | ✅ real reply `ACPOK-GEMINI`¹ | `Materialised ACP file-secret 'GOOGLE_APPLICATION_CREDENTIALS_JSON' -> …/acp/gemini-cli/gcloud-credentials.json`; gemini-cli 0.45.0; `Authenticating with ACP method: vertex-ai` |

¹ **Gemini caveat.** The credential path (materialise ADC → `vertex-ai` auth →
real reply) is fully proven, but only after working around an SDK/gemini-cli
blocker: gemini-cli ≥0.43 rejects the registry default session mode (`yolo`) with
`set_session_mode … RequestError` during headless init. Run with
`ACP_E2E_GEMINI_SESSION_MODE=default` to confirm the full turn (that's how the ✅
above was obtained). This is an SDK-side issue (the ACP provider registry's
`default_session_mode`), not a Canvas credential problem and not addressed by this
PR — see `docs/ACP_AGENTS.md`.

## Knobs

- `ACP_E2E_BASE_URL` (default `http://localhost:8010`)
- `ACP_E2E_CODEX_MODEL` / `ACP_E2E_CLAUDE_MODEL` / `ACP_E2E_GEMINI_MODEL`
- `ACP_E2E_GEMINI_SESSION_MODE` (set `default` to bypass the SDK `yolo` blocker)
- `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` (else read from gcloud / `us-central1`)
