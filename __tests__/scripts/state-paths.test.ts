// @vitest-environment node
// Centri fork: scripts/state-paths.mjs is the single source of truth for the
// Centri-owned runtime state root (~/.centri/canvas). These tests pin the
// default paths — the fork must NEVER default back to upstream's ~/.openhands,
// which can belong to a vanilla OpenHands install on the same host (the live
// state-dir collision on the U1 dev VM; centri SPEC §10).
import { homedir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(p: unknown) => boolean>(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (p: unknown) => existsSyncMock(p),
  };
});

import {
  defaultStateDir,
  legacyStateDir,
  legacyStateNotice,
  stateRootDir,
} from "../../scripts/state-paths.mjs";

describe("state-paths", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
  });

  it("roots all state under the Centri-owned directory", () => {
    expect(stateRootDir()).toBe(path.join(homedir(), ".centri", "canvas"));
  });

  it("keeps upstream's directory shape below the root", () => {
    // <root>/agent-canvas mirrors upstream's ~/.openhands/agent-canvas, so
    // docker/entrypoint.sh and all dirname(stateDir)-based derivations
    // (OH_PERSISTENCE_DIR, automation db) keep working unchanged.
    expect(defaultStateDir()).toBe(path.join(stateRootDir(), "agent-canvas"));
  });

  it("never defaults to upstream's ~/.openhands", () => {
    expect(stateRootDir()).not.toContain(".openhands");
    expect(defaultStateDir()).not.toContain(".openhands");
  });

  it("points the legacy dir at upstream's location (detection only)", () => {
    expect(legacyStateDir()).toBe(
      path.join(homedir(), ".openhands", "agent-canvas"),
    );
  });

  describe("legacyStateNotice", () => {
    it("returns a migration hint when only legacy state exists", () => {
      existsSyncMock.mockImplementation((p) => p === legacyStateDir());

      const notice = legacyStateNotice();

      expect(notice).not.toBeNull();
      expect(notice).toContain(legacyStateDir());
      expect(notice).toContain(defaultStateDir());
      // Must stay a hint — never an auto-migration (the legacy dir may
      // belong to a live vanilla OpenHands install).
      expect(notice).toContain("mv ");
    });

    it("stays quiet when the Centri root is already populated", () => {
      existsSyncMock.mockReturnValue(true);

      expect(legacyStateNotice()).toBeNull();
    });

    it("stays quiet on a fresh machine with no legacy state", () => {
      existsSyncMock.mockReturnValue(false);

      expect(legacyStateNotice()).toBeNull();
    });
  });
});
