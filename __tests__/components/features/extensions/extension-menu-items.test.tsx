import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionMenuItems } from "#/components/features/extensions/extension-menu-items";
import { contributionRegistry } from "#/extensions/contribution-registry";
import { MENU_SLOTS } from "#/extensions/menu-slots";
import type { MenuItem } from "#/extensions/types";

const SLOT = MENU_SLOTS.conversationTabsContext;

function registerMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  const item: MenuItem = {
    extensionId: "acme.hello",
    menu: SLOT,
    command: "hello.say",
    title: "Hello: Say hi",
    run: vi.fn(),
    ...overrides,
  };
  contributionRegistry.register(item.extensionId, { menus: [item] });
  return item;
}

describe("ExtensionMenuItems", () => {
  afterEach(() => contributionRegistry.clear());

  it("renders nothing when the slot has no contributions", () => {
    const { container } = render(<ExtensionMenuItems slot={SLOT} />);
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByTestId("extension-menu-separator"),
    ).not.toBeInTheDocument();
  });

  it("renders a contributed item with its command-derived title", () => {
    registerMenuItem();
    render(<ExtensionMenuItems slot={SLOT} />);

    const button = screen.getByTestId(
      "extension-menu-item-acme.hello-hello.say",
    );
    expect(button).toHaveTextContent("Hello: Say hi");
    // A separator precedes the contributed section so it reads as distinct.
    expect(screen.getByTestId("extension-menu-separator")).toBeInTheDocument();
  });

  it("runs the bound command and calls onAfterSelect when clicked", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const onAfterSelect = vi.fn();
    registerMenuItem({ run });
    render(<ExtensionMenuItems slot={SLOT} onAfterSelect={onAfterSelect} />);

    await user.click(
      screen.getByTestId("extension-menu-item-acme.hello-hello.say"),
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(onAfterSelect).toHaveBeenCalledTimes(1);
  });

  it("only renders items targeting the requested slot", () => {
    registerMenuItem();
    contributionRegistry.register("acme.other", {
      menus: [
        {
          extensionId: "acme.other",
          menu: "some/other-slot",
          command: "other.run",
          title: "Other",
          run: vi.fn(),
        },
      ],
    });

    render(<ExtensionMenuItems slot={SLOT} />);

    expect(
      screen.getByTestId("extension-menu-item-acme.hello-hello.say"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("extension-menu-item-acme.other-other.run"),
    ).not.toBeInTheDocument();
  });
});
