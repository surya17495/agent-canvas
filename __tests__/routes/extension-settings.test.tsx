import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoutesStub } from "react-router";
import ExtensionSettingsScreen from "#/routes/extension-settings";
import { contributionRegistry } from "#/extensions/contribution-registry";

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

function registerSettingsPage(overrides = {}) {
  contributionRegistry.register("acme.hello", {
    settingsPages: [
      {
        extensionId: "acme.hello",
        id: "general",
        title: "Hello Settings",
        pageUrl: "/__extensions/hello/settings.html",
        capabilities: ["storage"],
        ...overrides,
      },
    ],
  });
}

function renderAt(path: string) {
  const Stub = createRoutesStub([
    { path: "/settings/x/:extensionId", Component: ExtensionSettingsScreen },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

describe("ExtensionSettingsScreen", () => {
  afterEach(() => {
    contributionRegistry.clear();
  });

  it("mounts the contributed page's webview for the route extension", () => {
    registerSettingsPage();
    renderAt("/settings/x/acme.hello");

    expect(screen.getByTestId("extension-settings")).toBeInTheDocument();
    const frame = screen.getByTestId(
      "extension-webview-acme.hello",
    ) as HTMLIFrameElement;
    expect(frame).toHaveAttribute(
      "src",
      "/__extensions/hello/settings.html",
    );
    expect(frame).toHaveAttribute("title", "Hello Settings");
  });

  it("renders a fallback for an unknown extension", () => {
    registerSettingsPage();
    renderAt("/settings/x/does.not-exist");

    expect(
      screen.getByTestId("extension-settings-unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("extension-settings")).not.toBeInTheDocument();
  });

  it("renders a fallback when the contributed page has no page URL", () => {
    registerSettingsPage({ pageUrl: undefined });
    renderAt("/settings/x/acme.hello");

    expect(
      screen.getByTestId("extension-settings-unavailable"),
    ).toBeInTheDocument();
  });
});
