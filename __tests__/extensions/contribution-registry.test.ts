import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contributionRegistry,
  selectActivityBarItems,
  selectCommands,
  selectMenuItems,
  selectMenuItemsForSlot,
  selectViews,
  useContributionRegistry,
} from "#/extensions/contribution-registry";
import type { ExtensionContributions } from "#/extensions/types";

function makeContributions(
  extensionId: string,
  overrides: Partial<ExtensionContributions> = {},
): ExtensionContributions {
  return {
    activityBarItems: [
      {
        extensionId,
        id: `${extensionId}.container`,
        title: `${extensionId} panel`,
        onSelect: vi.fn(),
      },
    ],
    commands: [
      {
        extensionId,
        command: `${extensionId}.run`,
        title: `${extensionId}: Run`,
        run: vi.fn(),
      },
    ],
    views: [
      {
        extensionId,
        id: `${extensionId}.view`,
        containerId: `${extensionId}.container`,
        name: "View",
        type: "webview",
      },
    ],
    menus: [
      {
        extensionId,
        menu: "conversationTabs/context",
        command: `${extensionId}.run`,
        title: `${extensionId}: Run`,
        run: vi.fn(),
      },
    ],
    settingsPages: [
      {
        extensionId,
        id: `${extensionId}.settings`,
        title: `${extensionId} Settings`,
        pageUrl: `blob:${extensionId}-settings`,
      },
    ],
    ...overrides,
  };
}

describe("ContributionRegistry", () => {
  afterEach(() => {
    contributionRegistry.clear();
  });

  it("starts empty", () => {
    expect(contributionRegistry.getActivityBarItems()).toEqual([]);
    expect(contributionRegistry.getCommands()).toEqual([]);
    expect(contributionRegistry.getViews()).toEqual([]);
    expect(contributionRegistry.getMenuItems()).toEqual([]);
    expect(contributionRegistry.getSettingsPages()).toEqual([]);
    expect(
      contributionRegistry.getMenuItemsForSlot("conversationTabs/context"),
    ).toEqual([]);
  });

  it("registers an extension's contributions across all surfaces", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));

    expect(contributionRegistry.getActivityBarItems()).toHaveLength(1);
    expect(contributionRegistry.getActivityBarItems()[0].title).toBe(
      "acme.a panel",
    );
    expect(contributionRegistry.getCommands()[0].command).toBe("acme.a.run");
    expect(contributionRegistry.getViews()[0].id).toBe("acme.a.view");
    expect(contributionRegistry.getSettingsPages()[0].id).toBe(
      "acme.a.settings",
    );
  });

  it("aggregates and unregisters settings pages by owning extension", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register("acme.b", makeContributions("acme.b"));

    expect(
      contributionRegistry.getSettingsPages().map((p) => p.extensionId),
    ).toEqual(["acme.a", "acme.b"]);

    contributionRegistry.unregister("acme.a");

    expect(
      contributionRegistry.getSettingsPages().map((p) => p.extensionId),
    ).toEqual(["acme.b"]);
  });

  it("aggregates contributions from multiple extensions in insertion order", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register("acme.b", makeContributions("acme.b"));

    const items = contributionRegistry.getActivityBarItems();
    expect(items.map((i) => i.extensionId)).toEqual(["acme.a", "acme.b"]);
  });

  it("unregister removes every surface owned by an extension", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register("acme.b", makeContributions("acme.b"));

    contributionRegistry.unregister("acme.a");

    expect(
      contributionRegistry.getActivityBarItems().map((i) => i.extensionId),
    ).toEqual(["acme.b"]);
    expect(
      contributionRegistry.getCommands().map((c) => c.extensionId),
    ).toEqual(["acme.b"]);
    expect(contributionRegistry.getViews().map((v) => v.extensionId)).toEqual([
      "acme.b",
    ]);
  });

  it("unregister is a no-op for an unknown extension", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.unregister("does.not.exist");
    expect(contributionRegistry.getActivityBarItems()).toHaveLength(1);
  });

  it("re-registering an extension replaces its previous contributions", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register("acme.a", {
      activityBarItems: [
        {
          extensionId: "acme.a",
          id: "acme.a.container",
          title: "Replaced",
          onSelect: vi.fn(),
        },
      ],
    });

    const items = contributionRegistry.getActivityBarItems();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Replaced");
    // Commands from the first registration are gone after replacement.
    expect(contributionRegistry.getCommands()).toHaveLength(0);
  });

  it("groups menu items by slot and keeps insertion order across extensions", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register(
      "acme.b",
      makeContributions("acme.b", {
        menus: [
          {
            extensionId: "acme.b",
            menu: "other/slot",
            command: "acme.b.run",
            title: "B: Run",
            run: vi.fn(),
          },
        ],
      }),
    );

    const slot = contributionRegistry.getMenuItemsForSlot(
      "conversationTabs/context",
    );
    expect(slot.map((m) => m.extensionId)).toEqual(["acme.a"]);
    expect(contributionRegistry.getMenuItemsForSlot("other/slot")).toHaveLength(
      1,
    );
    // The flat list includes every slot's items.
    expect(contributionRegistry.getMenuItems()).toHaveLength(2);
  });

  it("unregister removes an extension's menu items from its slot", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register("acme.b", makeContributions("acme.b"));
    expect(
      contributionRegistry.getMenuItemsForSlot("conversationTabs/context"),
    ).toHaveLength(2);

    contributionRegistry.unregister("acme.a");
    expect(
      contributionRegistry
        .getMenuItemsForSlot("conversationTabs/context")
        .map((m) => m.extensionId),
    ).toEqual(["acme.b"]);
  });

  it("selectMenuItemsForSlot returns a stable empty array for empty slots", () => {
    const state = useContributionRegistry.getState();
    const select = selectMenuItemsForSlot("conversationTabs/context");
    expect(select(state)).toEqual([]);
    // Same reference between calls so subscribers don't re-render needlessly.
    expect(select(state)).toBe(select(state));
  });

  it("getView resolves a single view by id", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    expect(contributionRegistry.getView("acme.a.view")?.name).toBe("View");
    expect(contributionRegistry.getView("missing")).toBeUndefined();
  });

  it("selectors derive flat lists from store state", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    const state = useContributionRegistry.getState();
    expect(selectActivityBarItems(state)).toHaveLength(1);
    expect(selectCommands(state)).toHaveLength(1);
    expect(selectViews(state)).toHaveLength(1);
    expect(selectMenuItems(state)).toHaveLength(1);
  });
});
