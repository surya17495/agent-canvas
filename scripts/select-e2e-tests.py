#!/usr/bin/env python3
"""Select which mock-LLM E2E test specs to run based on changed files.

Uses the OpenHands SDK's LLM class to intelligently map PR file changes
to the most relevant test specs.  Falls back to running the full suite
when the LLM is unavailable or when the change set is too broad.

Usage:
    # Pipe changed files (one per line):
    git diff --name-only origin/main | python scripts/select-e2e-tests.py

    # Or pass as arguments:
    python scripts/select-e2e-tests.py src/routes/automations.tsx src/api/automation-service/...

Environment variables:
    LLM_API_KEY   – required (unless --fallback-only)
    LLM_BASE_URL  – optional, defaults to https://llm-proxy.app.all-hands.dev
    LLM_MODEL     – optional, defaults to openhands/gpt-5.1

Output (stdout): JSON object with keys:
    specs   – list of spec filenames to run (empty ⇒ full suite)
    reason  – human-readable explanation
    mode    – "llm" | "heuristic" | "full"
"""

from __future__ import annotations

import json
import os
import sys

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

ALL_SPECS = sorted(SPEC_CATALOG.keys())

# ---------------------------------------------------------------------------
# Heuristic path → spec mapping (fast fallback when LLM is unavailable)
# ---------------------------------------------------------------------------
HEURISTIC_MAP: list[tuple[list[str], list[str]]] = [
    # (path prefixes, relevant specs)
    (
        ["src/components/features/onboarding/", "src/hooks/use-onboarding"],
        ["mock-llm-onboarding-happy-path.spec.ts", "mock-llm-onboarding-regressions.spec.ts"],
    ),
    (
        ["src/api/automation-service/", "src/routes/automations", "src/components/features/automations/"],
        ["mock-llm-automation.spec.ts", "mock-llm-preset-automation.spec.ts"],
    ),
    (
        ["src/components/features/backends/", "src/api/backend-registry/"],
        ["mock-llm-auth-modes.spec.ts", "mock-llm-cross-connect.spec.ts"],
    ),
    (
        ["src/components/features/settings/", "src/routes/llm-settings", "src/routes/agent-settings"],
        [
            "mock-llm-profile-management.spec.ts",
            "mock-llm-conversation.spec.ts",
            "mock-llm-model-switch.spec.ts",
            "mock-llm-acp-agent.spec.ts",
        ],
    ),
    (
        ["src/components/conversation-events/", "src/components/features/chat/"],
        ["mock-llm-conversation.spec.ts", "mock-llm-image-upload.spec.ts", "mock-llm-ui-regressions.spec.ts"],
    ),
    (
        ["src/components/features/conversation-panel/"],
        ["mock-llm-conversation.spec.ts", "mock-llm-model-switch.spec.ts"],
    ),
    (
        ["bin/", "scripts/static-server", "scripts/ingress", "docker/entrypoint"],
        ["mock-llm-partial-stack.spec.ts", "mock-llm-auth-modes.spec.ts"],
    ),
    (
        ["src/hooks/query/use-conversation", "src/hooks/use-load-older-events"],
        ["mock-llm-conversation.spec.ts", "mock-llm-ui-regressions.spec.ts"],
    ),
    (
        [".agents/skills/", "src/api/skills-service"],
        ["mock-llm-skills.spec.ts"],
    ),
    (
        ["src/styles/", "src/components/shared/", "src/tailwind.css"],
        ["mock-llm-ui-regressions.spec.ts"],
    ),
    (
        ["src/components/features/workspace/", "src/hooks/use-workspaces"],
        ["mock-llm-ui-regressions.spec.ts", "mock-llm-onboarding-happy-path.spec.ts"],
    ),
    (
        ["tests/e2e/mock-llm/"],
        [],  # Modified test files → run those specific specs (handled separately)
    ),
]

# If changed files touch only these paths, no E2E tests are needed.
SKIP_PATHS = [
    "README", "AGENTS.md", "DEVELOPMENT.md", "LICENSE", "CHANGELOG",
    ".github/workflows/", "docs/", "specs/", ".openhands/",
    "__tests__/", "src/mocks/", ".env.sample",
    "tests/e2e/snapshots/", "tests/e2e/live/",
]


def heuristic_select(changed_files: list[str]) -> tuple[list[str], str]:
    """Return (specs, reason) using the static heuristic map."""
    selected: set[str] = set()
    matched_areas: list[str] = []

    # Direct test-file changes: run the changed spec itself.
    for f in changed_files:
        if f.startswith("tests/e2e/mock-llm/") and f.endswith(".spec.ts"):
            basename = f.rsplit("/", 1)[-1]
            if basename in SPEC_CATALOG:
                selected.add(basename)

    # Check whether all files are skip-only.
    non_skip = [f for f in changed_files if not any(f.startswith(s) or f == s for s in SKIP_PATHS)]
    if not non_skip and not selected:
        return [], "All changed files are docs/CI/tests — no mock-LLM E2E needed."

    for prefixes, specs in HEURISTIC_MAP:
        for f in non_skip:
            if any(f.startswith(p) for p in prefixes):
                selected.update(specs)
                matched_areas.extend(prefixes)
                break

    if not selected and non_skip:
        # Source files changed but no heuristic matched → run full suite.
        return [], f"Heuristic could not narrow: {len(non_skip)} source files changed."

    reason = f"Heuristic matched {len(selected)} spec(s) from {len(set(matched_areas))} area(s)."
    return sorted(selected), reason


def llm_select(changed_files: list[str]) -> tuple[list[str], str]:
    """Use the OpenHands SDK LLM to pick the relevant specs."""
    try:
        from openhands.sdk import LLM
    except ImportError:
        return [], "openhands-sdk not installed; falling back to heuristic."

    api_key = os.environ.get("LLM_API_KEY", "")
    if not api_key:
        return [], "LLM_API_KEY not set; falling back to heuristic."

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

    try:
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
    except Exception as e:
        return [], f"LLM call failed ({e}); falling back to heuristic."


def main() -> None:
    # Read changed files from args or stdin.
    if len(sys.argv) > 1:
        changed_files = sys.argv[1:]
    else:
        changed_files = [line.strip() for line in sys.stdin if line.strip()]

    if not changed_files:
        print(json.dumps({"specs": [], "reason": "No changed files provided.", "mode": "full"}))
        return

    # Try LLM first, fall back to heuristic.
    specs, reason = llm_select(changed_files)
    mode = "llm"

    if reason.startswith(("LLM_API_KEY not set", "openhands-sdk not installed", "LLM call failed")):
        specs, reason = heuristic_select(changed_files)
        mode = "heuristic"

    if not specs:
        mode = "full"

    print(json.dumps({"specs": specs, "reason": reason, "mode": mode}, indent=2))


if __name__ == "__main__":
    main()
