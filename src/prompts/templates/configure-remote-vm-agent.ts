import { I18nKey } from "#/i18n/declaration";
import type {
  ApplicationPrompt,
  ApplicationPromptContextById,
} from "#/prompts/types";

const PROMPT = `You are helping me add a new Agent Canvas backend by configuring a target machine to run Agent Canvas, an OpenHands agent-server, and the automation backend.

Use the currently configured LLM profile/model for this conversation. Do not ask me to choose a model unless the current profile fails because it is missing or invalid.

Context you should know before asking me anything:
- Goal: configure a target machine so this local Agent Canvas UI can connect to it as another backend.
- Required access: a working SSH connection from this local machine to the target machine is mandatory. Without SSH, you cannot directly set up the target machine.
- Preferred credential handling: use my existing local SSH config, SSH agent, keychain, or already configured host aliases. Do not ask me to paste private keys or passwords into chat.
- Agent-server setup path: once SSH works, inspect the target OS and install or verify git, curl, Node.js >= 22.12, npm, and uv/uvx. Then clone or update https://github.com/OpenHands/agent-canvas.git on the target machine, configure stable secrets, and start the stack.
- Local connection path: after the target stack is running, this local UI needs a reachable backend URL and its session API key. Direct LAN access, a VPN-style private IP, an SSH tunnel, or a public TLS endpoint can work.
- Network caveat: if this local machine and the target machine are not on the same LAN or private network, direct connection may fail. In that case, recommend that I configure a Tailscale-like private IP, an SSH tunnel, or a secure public endpoint. Prefer letting me configure the SSH connection details locally instead of pasting secrets into chat.
- Target-machine filesystem convention: unless I explicitly ask for a different location, keep all files under ~/.openhands/agent-canvas on the target machine. Do not scatter files in arbitrary directories.

Use this target-machine layout:
- ~/.openhands/agent-canvas/repo: git checkout of https://github.com/OpenHands/agent-canvas.git.
- ~/.openhands/agent-canvas/env/.env: stable runtime environment and generated API keys. chmod 600. Do not commit this file.
- ~/.openhands/agent-canvas/bin/agent-canvas-stack: the fixed maintenance script for this installation.
- ~/.openhands/agent-canvas/metadata/backend.json: non-secret machine/backend metadata.
- ~/.openhands/agent-canvas/metadata/connection.md: human-readable connection instructions for this local UI.
- ~/.openhands/agent-canvas/metadata/setup-log.md: concise setup/update log and decisions made.

The fixed maintenance script ~/.openhands/agent-canvas/bin/agent-canvas-stack should be idempotent, use set -euo pipefail, and support these commands:
- setup: verify/install prerequisites, clone/update the repo, create missing directories, and create env/.env if absent.
- start: start the stack from the repo using env/.env.
- stop: stop the running stack if it is managed by the script.
- status: show process status and probe /server_info plus /api/automation/docs.
- logs: show or tail the relevant logs.
- update: pull/update the repo and restart only after confirmation.
- print-connection: print the backend URL and instructions for adding the backend to this UI, but avoid printing secrets unless I explicitly need them.

Keep metadata files non-secret. backend.json should include useful maintenance data such as hostname, OS, architecture, install_dir, repo_dir, repo URL, current git ref/sha, chosen ports, LAN/private/public endpoint notes, agent-server version after verification, created_at, updated_at, and script version. Do not store private keys, raw passwords, or unnecessary API key values in metadata.

Your first response must NOT start running setup commands. First ask me these questions clearly:
1. What target machine do I want to connect to, and what connection method should be used? Ask for an SSH target such as a host alias, user@host, or an SSH config entry.
2. Is SSH from this local machine to the target machine already configured and working?
3. Are this local machine and the target machine on the same LAN/private network?
4. If SSH is configured, do I authorize you to connect via SSH and perform the setup on the target machine, including generating and writing the final secret configuration files?
5. Should the target stack be temporary for development, or should it be long-running?

After I answer, follow this setup flow:
1. If SSH is not configured, guide me to configure it locally first. Do not ask for private keys or passwords in chat.
2. If the machines are not on the same LAN/private network, explain the connection risk and recommend Tailscale, another private network overlay, an SSH tunnel, or a secure public endpoint before proceeding.
3. Verify SSH connectivity with the provided target.
4. Identify the target OS, architecture, shell, package manager, and relevant ports.
5. Check for prerequisites: git, curl, Node.js >= 22.12, npm, and uv/uvx.
6. Ask before using sudo, changing firewall rules, changing reverse-proxy config, or installing system packages.
7. Install missing prerequisites in the least invasive way that fits the target OS.
8. Create or reuse the standard ~/.openhands/agent-canvas directory layout.
9. Clone or update https://github.com/OpenHands/agent-canvas.git under ~/.openhands/agent-canvas/repo.
10. Write or update the fixed ~/.openhands/agent-canvas/bin/agent-canvas-stack maintenance script.
11. Configure ~/.openhands/agent-canvas/env/.env with stable, strong values for SESSION_API_KEY / OH_SESSION_API_KEYS_0, VITE_SESSION_API_KEY, and AUTOMATION_LOCAL_API_KEY. Never commit these secrets.
12. Write or update the non-secret metadata files in ~/.openhands/agent-canvas/metadata.
13. Start the full stack through the maintenance script unless I request a different process manager. For a long-running setup, propose tmux, systemd, or another suitable supervisor before changing anything.
14. Verify /server_info, /api/automation/docs, and the Agent Canvas frontend URL on the target.
15. Give me the backend URL and session API key to add through Manage Backends in this UI, or help set up an SSH tunnel if direct exposure is inappropriate.
16. After I confirm the connection details, start a test conversation against the new backend.

Security constraints:
- Do not expose an unauthenticated agent-server to the public internet.
- Prefer SSH tunnels, Tailscale-style private networking, or TLS behind a reverse proxy when the target machine is not on a trusted network.
- Summarize commands before running risky changes.
- Do not print generated secrets unless I need them for a specific local configuration step.

Expected output:
- A concise status table for the remote VM setup.
- The final connection details I need for Agent Canvas.
- Any remaining manual steps or risks.`;

export const configureRemoteVmAgentPrompt = {
  id: "configure-remote-vm-agent",
  labelKey: I18nKey.BACKEND$ADD_WITH_AGENT,
  category: "backend",
  render: () => PROMPT,
} satisfies ApplicationPrompt<
  ApplicationPromptContextById["configure-remote-vm-agent"]
>;
