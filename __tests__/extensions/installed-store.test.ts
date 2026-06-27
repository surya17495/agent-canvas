import { afterEach, describe, expect, it } from "vitest";
import {
  useInstalledExtensionsStore,
  type InstalledExtension,
} from "#/extensions/installed-store";

function makeExtension(
  overrides: Partial<InstalledExtension> = {},
): InstalledExtension {
  return {
    id: "acme.hello",
    name: "Hello",
    version: "1.0.0",
    capabilities: ["conversation:read"],
    sourceUrl: "/__extensions/hello",
    origin: "user",
    ...overrides,
  };
}

describe("useInstalledExtensionsStore", () => {
  afterEach(() => useInstalledExtensionsStore.getState().clear());

  it("adds an extension", () => {
    useInstalledExtensionsStore.getState().add(makeExtension());
    expect(useInstalledExtensionsStore.getState().installed).toHaveLength(1);
  });

  it("replaces by id rather than duplicating", () => {
    const { add } = useInstalledExtensionsStore.getState();
    add(makeExtension({ version: "1.0.0" }));
    add(makeExtension({ version: "2.0.0" }));
    const { installed } = useInstalledExtensionsStore.getState();
    expect(installed).toHaveLength(1);
    expect(installed[0].version).toBe("2.0.0");
  });

  it("removes by id", () => {
    const { add, remove } = useInstalledExtensionsStore.getState();
    add(makeExtension({ id: "a.one" }));
    add(makeExtension({ id: "b.two" }));
    remove("a.one");
    const { installed } = useInstalledExtensionsStore.getState();
    expect(installed.map((e) => e.id)).toEqual(["b.two"]);
  });

  it("clears all", () => {
    useInstalledExtensionsStore.getState().add(makeExtension());
    useInstalledExtensionsStore.getState().clear();
    expect(useInstalledExtensionsStore.getState().installed).toHaveLength(0);
  });
});
