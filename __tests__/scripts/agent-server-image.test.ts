// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { resolveAgentServerImage } from "../../scripts/agent-server-image.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const config = JSON.parse(
  readFileSync(path.join(repoRoot, "config/defaults.json"), "utf-8"),
) as {
  images: { agentServer: string; agentServerVariant: string };
  versions: { agentServer: string };
};

describe("resolveAgentServerImage", () => {
  it("uses the configured image variant", () => {
    expect(resolveAgentServerImage(config)).toBe(
      `${config.images.agentServer}:${config.versions.agentServer}-python-lite`,
    );
  });
});
