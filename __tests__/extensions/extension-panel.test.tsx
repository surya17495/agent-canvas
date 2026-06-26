import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionPanel } from "#/components/features/extensions/extension-panel";
import { contributionRegistry } from "#/extensions/contribution-registry";
import { useExtensionPanelStore } from "#/extensions/panel-store";

vi.mock("#/components/providers/extension-manager-provider", () => ({
  useExtensionContext: () => ({
    manager: {},
    deps: {
      getActiveConversation: () => null,
      showInformationMessage: vi.fn(),
      executeCommand: vi.fn(),
      storageGet: vi.fn(),
      storageSet: vi.fn(),
    },
  }),
}));

function registerHelloView() {
  contributionRegistry.register("acme.hello", {
    views: [
      {
        extensionId: "acme.hello",
        id: "hello.panel",
        containerId: "hello.container",
        name: "Hello",
        type: "webview",
        pageUrl: "/__extensions/hello-sidebar/panel.html",
        capabilities: ["conversation:read"],
      },
    ],
  });
}

describe("ExtensionPanel", () => {
  afterEach(() => {
    contributionRegistry.clear();
    useExtensionPanelStore.getState().close();
  });

  it("renders nothing when no view is open", () => {
    registerHelloView();
    const { container } = render(<ExtensionPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the active view's webview", () => {
    registerHelloView();
    useExtensionPanelStore.getState().openView("acme.hello", "hello.panel");

    render(<ExtensionPanel />);

    expect(screen.getByTestId("extension-panel")).toBeInTheDocument();
    const frame = screen.getByTestId(
      "extension-webview-acme.hello",
    ) as HTMLIFrameElement;
    expect(frame).toHaveAttribute(
      "src",
      "/__extensions/hello-sidebar/panel.html",
    );
  });
});
