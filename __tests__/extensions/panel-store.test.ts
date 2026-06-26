import { afterEach, describe, expect, it } from "vitest";
import { useExtensionPanelStore } from "#/extensions/panel-store";

describe("useExtensionPanelStore", () => {
  afterEach(() => useExtensionPanelStore.getState().close());

  it("starts with no active view", () => {
    const state = useExtensionPanelStore.getState();
    expect(state.activeExtensionId).toBeNull();
    expect(state.activeViewId).toBeNull();
  });

  it("opens a view", () => {
    useExtensionPanelStore.getState().openView("acme.hello", "hello.panel");
    const state = useExtensionPanelStore.getState();
    expect(state.activeExtensionId).toBe("acme.hello");
    expect(state.activeViewId).toBe("hello.panel");
  });

  it("closes a view", () => {
    useExtensionPanelStore.getState().openView("acme.hello", "hello.panel");
    useExtensionPanelStore.getState().close();
    const state = useExtensionPanelStore.getState();
    expect(state.activeExtensionId).toBeNull();
    expect(state.activeViewId).toBeNull();
  });
});
