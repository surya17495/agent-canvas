import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExtensionsScreen from "#/routes/extensions";
import { useInstalledExtensionsStore } from "#/extensions/installed-store";

const ctx = vi.hoisted(() => ({
  value: null as null | Record<string, unknown>,
}));

vi.mock("#/components/providers/extension-manager-provider", () => ({
  useExtensionContext: () => ctx.value,
}));

vi.mock("#/components/features/skills/extensions-navigation", () => ({
  ExtensionsNavigation: () => <nav data-testid="extensions-nav" />,
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
}));

function makeContext() {
  return {
    manager: {},
    deps: {},
    previewManifest: vi.fn(),
    installFromUrl: vi.fn(),
    uninstall: vi.fn(),
  };
}

describe("ExtensionsScreen", () => {
  beforeEach(() => {
    ctx.value = null;
    useInstalledExtensionsStore.getState().clear();
  });
  afterEach(() => {
    vi.clearAllMocks();
    useInstalledExtensionsStore.getState().clear();
  });

  it("shows a disabled notice and no add button when the feature is off", () => {
    ctx.value = null;
    render(<ExtensionsScreen />);
    expect(screen.getByTestId("extensions-disabled")).toBeInTheDocument();
    expect(
      screen.queryByTestId("extensions-add-button"),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when enabled with nothing installed", () => {
    ctx.value = makeContext();
    render(<ExtensionsScreen />);
    expect(screen.getByTestId("extensions-empty")).toBeInTheDocument();
    expect(screen.getByTestId("extensions-add-button")).toBeInTheDocument();
  });

  it("lists installed extensions and opens the add modal", async () => {
    const user = userEvent.setup();
    ctx.value = makeContext();
    useInstalledExtensionsStore.getState().add({
      id: "acme.hello",
      name: "Hello",
      version: "1.0.0",
      capabilities: ["conversation:read"],
      sourceUrl: "/__extensions/hello",
      origin: "user",
    });

    render(<ExtensionsScreen />);
    expect(
      screen.getByTestId("installed-extension-card-acme.hello"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("extensions-add-button"));
    expect(screen.getByTestId("add-extension-modal")).toBeInTheDocument();
  });
});
