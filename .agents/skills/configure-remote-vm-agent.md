---
name: configure-remote-vm-agent
description: Configure a remote VM to run Agent Canvas, openhands-agent-server, and the automation backend using the user's existing SSH access.
triggers:
  - Configure Remote VM with Agent
  - Add Remote Machine
  - remote agent-server
  - remote VM
---

# Configure Remote VM With Agent

Help the user configure a remote machine as an Agent Canvas backend. Work interactively and use the user's existing SSH setup from the local machine; do not ask them to paste private keys or passwords into chat.

## Default Workflow

1. Ask for the SSH target if the user did not provide one.
2. Confirm whether they want a temporary dev stack or a long-running setup.
3. Verify SSH connectivity, OS, architecture, shell, package manager, and relevant ports before installing anything.
4. Check for `git`, `curl`, Node.js `>=22.12`, `npm`, and `uvx`.
5. Ask before using `sudo` or changing firewall, service, or reverse-proxy configuration.
6. Clone or update `https://github.com/OpenHands/agent-canvas.git` on the remote VM.
7. Configure `.env` with stable, strong API keys for the remote stack. Keep secrets out of git.
8. Start with `npm run dev` unless the user asks for a production process manager. For long-running operation, propose `tmux`, `systemd`, or another explicit supervisor before applying it.
9. Verify `/server_info`, `/api/automation/docs`, and the frontend URL.
10. Give the user the backend URL and session API key needed by Agent Canvas Manage Backends, or set up an SSH tunnel when direct exposure is inappropriate.

## Target Layout

Unless the user requests a different location, keep all target-machine files under `~/.openhands/agent-canvas`:

- `repo/` - git checkout of `https://github.com/OpenHands/agent-canvas.git`.
- `env/.env` - stable runtime environment and generated API keys. Use `chmod 600` and never commit it.
- `bin/agent-canvas-stack` - fixed idempotent maintenance script with `setup`, `start`, `stop`, `status`, `logs`, `update`, and `print-connection` commands.
- `metadata/backend.json` - non-secret machine/backend metadata such as hostname, OS, architecture, install path, repo ref/sha, ports, endpoint notes, agent-server version, and timestamps.
- `metadata/connection.md` - human-readable connection instructions for adding the backend to this UI.
- `metadata/setup-log.md` - setup/update log and decisions made.

Keep metadata files non-secret. Do not store private keys, raw passwords, or unnecessary API key values in metadata.

## Security Rules

- Never expose an unauthenticated agent-server to the public internet.
- Prefer SSH tunnels or TLS behind a reverse proxy for untrusted networks.
- Summarize risky commands before running them.
- Do not print generated secrets unless the user needs them for a specific local configuration step.

## Final Response

End with a compact status table covering prerequisites, repository location, running processes, exposed URLs, auth state, and remaining manual steps.
