import { describe, expect, it } from "vitest";

import { renderApplicationPrompt } from "#/prompts/registry";

describe("application prompts", () => {
  it("renders the backend-agent setup prompt with SSH, network, and first-response guidance", () => {
    const prompt = renderApplicationPrompt("configure-remote-vm-agent");

    expect(prompt).toContain("Use the currently configured LLM profile/model");
    expect(prompt).toContain("a working SSH connection");
    expect(prompt).toContain("same LAN/private network");
    expect(prompt).toContain("Tailscale");
    expect(prompt).toContain(
      "Your first response must NOT start running setup commands",
    );
    expect(prompt).toContain("do I authorize you to connect via SSH");
    expect(prompt).toContain("~/.openhands/agent-canvas");
    expect(prompt).toContain("metadata/backend.json");
    expect(prompt).toContain("bin/agent-canvas-stack");
    expect(prompt).toContain("setup");
    expect(prompt).toContain("print-connection");
    expect(prompt).toContain("SESSION_API_KEY / OH_SESSION_API_KEYS_0");
    expect(prompt).toContain("/api/automation/docs");
  });
});
