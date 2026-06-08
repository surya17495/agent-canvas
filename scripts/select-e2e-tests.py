#!/usr/bin/env python3
"""Select which mock-LLM E2E test specs to run based on changed files.

Uses the OpenHands SDK's LLM class to map PR file changes to the most
relevant test specs.  Returns the full suite when the LLM decides the
changes are too broad to narrow.

Usage:
    # Pipe changed files (one per line):
    git diff --name-only origin/main | python scripts/select-e2e-tests.py

    # Or pass as arguments:
    python scripts/select-e2e-tests.py src/routes/automations.tsx src/api/automation-service/...

Environment variables:
    LLM_API_KEY   – required
    LLM_BASE_URL  – optional, defaults to https://llm-proxy.app.all-hands.dev
    LLM_MODEL     – optional, defaults to openhands/gpt-5.1

Output (stdout): JSON object with keys:
    specs   – list of spec filenames to run (empty ⇒ full suite)
    reason  – human-readable explanation
    mode    – "llm" | "full"
"""

from __future__ import annotations

import json
import os
import sys

from openhands.sdk import LLM

# ---------------------------------------------------------------------------
# Spec catalog – each entry maps a spec filename to a brief description
# of what source areas it exercises.  The LLM receives this catalog so it
# can reason about coverage.
# ---------------------------------------------------------------------------
SPEC_CATALOG: dict[str, str] = {
    "mock-llm-acp-agent.spec.ts": (
        "ACP (Agent Client Protocol) agent configuration via Settings UI, "
        "ACP conversation lifecycle, agent_kind=acp payload."
    ),
    "mock-llm-auth-modes.spec.ts": (
        "Session API key injection, key rotation recovery, public-mode "
        "auth gate (ApiKeyEntryScreen), localStorage key sync."
    ),
    "mock-llm-automation.spec.ts": (
        "Full automation lifecycle: create cron automation via terminal "
        "curl, dispatch a run, verify automation list/detail pages, "
        "automation backend integration."
    ),
    "mock-llm-conversation.spec.ts": (
        "Core conversation flow: LLM profile creation, settings API, "
        "terminal tool call, bash execution, agent reply, sidebar resume."
    ),
    "mock-llm-cross-connect.spec.ts": (
        "Frontend-only ↔ backend-only cross-connect, multi-backend "
        "switching, manage-backends modal, backend registry."
    ),
    "mock-llm-image-upload.spec.ts": (
        "Image attachment via file input, base64 encoding in LLM "
        "completion payload, image_urls in user message event."
    ),
    "mock-llm-model-switch.spec.ts": (
        "/model slash command mid-conversation, LLM profile switching, "
        "switchLLM API, chat header profile display."
    ),
    "mock-llm-onboarding-happy-path.spec.ts": (
        "Full onboarding wizard: agent selection, backend check, LLM "
        "setup, hello message. OnboardingModal flow."
    ),
    "mock-llm-onboarding-regressions.spec.ts": (
        "Onboarding edge cases: modal dismiss behavior, default model "
        "selection, backdrop/Escape handling."
    ),
    "mock-llm-partial-stack.spec.ts": (
        "Partial stack modes: --frontend-only (503 for backend), "
        "--backend-only (503 for frontend), port conflict detection. "
        "bin/agent-canvas.mjs, static-server, ingress."
    ),
    "mock-llm-preset-automation.spec.ts": (
        "Preset automation cards, slash commands from home page, "
        "skill activation via slash command."
    ),
    "mock-llm-profile-management.spec.ts": (
        "Active profile deletion + reconciliation, same-model profile "
        "identity, litellm_proxy base_url preservation."
    ),
    "mock-llm-skills.spec.ts": (
        "Project skills (.agents/skills/), user skills (~/.openhands/skills/), "
        "skill deletion, keyword-triggered activation."
    ),
    "mock-llm-ui-regressions.spec.ts": (
        "CSS isolation scoping, critic results rendering, event "
        "pagination on scroll-up, workspace selection persistence."
    ),
}


def select(changed_files: list[str]) -> tuple[list[str], str]:
    """Use the OpenHands SDK LLM to pick the relevant specs."""
    api_key = os.environ.get("LLM_API_KEY", "")
    if not api_key:
        raise RuntimeError("LLM_API_KEY is required but not set.")

    base_url = os.environ.get("LLM_BASE_URL", "https://llm-proxy.app.all-hands.dev")
    model = os.environ.get("LLM_MODEL", "openhands/gpt-5.1")

    catalog_text = "\n".join(
        f"  - {name}: {desc}" for name, desc in sorted(SPEC_CATALOG.items())
    )
    files_text = "\n".join(f"  - {f}" for f in changed_files[:200])

    prompt = f"""\
You are a CI test-selection assistant for the agent-canvas frontend project.

Given the list of files modified in a pull request, decide which E2E test
specs are RELEVANT and should be run.  Return ONLY a JSON object with two
keys: "specs" (list of spec filenames) and "reason" (one-sentence explanation).

If the changes are broad (e.g. package.json, vite.config.ts, tsconfig,
root layout, core API layer) or you are unsure, return an empty "specs"
list to trigger the full suite.

Available test specs and what they cover:
{catalog_text}

Changed files in this PR:
{files_text}

Respond with ONLY the JSON object, no markdown fences."""

    llm = LLM(model=model, api_key=api_key, base_url=base_url)
    response = llm.completion(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
    )
    content = response.choices[0].message.content.strip()
    # Strip markdown fences if the model adds them anyway.
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    result = json.loads(content)
    specs = [s for s in result.get("specs", []) if s in SPEC_CATALOG]
    reason = result.get("reason", "LLM selection")
    return specs, reason


def main() -> None:
    # Read changed files from args or stdin.
    if len(sys.argv) > 1:
        changed_files = sys.argv[1:]
    else:
        changed_files = [line.strip() for line in sys.stdin if line.strip()]

    if not changed_files:
        print(json.dumps({"specs": [], "reason": "No changed files provided.", "mode": "full"}))
        return

    specs, reason = select(changed_files)
    mode = "llm" if specs else "full"
    print(json.dumps({"specs": specs, "reason": reason, "mode": mode}, indent=2))


if __name__ == "__main__":
    main()
