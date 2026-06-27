import { afterEach, describe, expect, it } from "vitest";
import {
  addPersistedInstall,
  loadPersistedInstalls,
  removePersistedInstall,
  savePersistedInstalls,
} from "#/extensions/installed-persistence";

const STORAGE_KEY = "agent-canvas:extensions:user-installs";

describe("installed-persistence", () => {
  afterEach(() => localStorage.clear());

  it("returns an empty list when nothing is stored", () => {
    expect(loadPersistedInstalls()).toEqual([]);
  });

  it("round-trips saved installs", () => {
    const installs = [
      { id: "a.one", sourceUrl: "/x/a", capabilities: ["storage" as const] },
    ];
    savePersistedInstalls(installs);
    expect(loadPersistedInstalls()).toEqual(installs);
  });

  it("adds replacing by id and removes by id", () => {
    addPersistedInstall({ id: "a.one", sourceUrl: "/x/a", capabilities: [] });
    addPersistedInstall({
      id: "a.one",
      sourceUrl: "/x/a2",
      capabilities: ["storage"],
    });
    expect(loadPersistedInstalls()).toEqual([
      { id: "a.one", sourceUrl: "/x/a2", capabilities: ["storage"] },
    ]);

    removePersistedInstall("a.one");
    expect(loadPersistedInstalls()).toEqual([]);
  });

  it("tolerates corrupt storage", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadPersistedInstalls()).toEqual([]);
  });

  it("filters out malformed entries", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "ok", sourceUrl: "/x", capabilities: [] },
        { id: 1 },
      ]),
    );
    expect(loadPersistedInstalls()).toEqual([
      { id: "ok", sourceUrl: "/x", capabilities: [] },
    ]);
  });
});
