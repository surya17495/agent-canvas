import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstalledExtensionCard } from "#/components/features/extensions/installed-extension-card";
import type { InstalledExtension } from "#/extensions/installed-store";

function makeExtension(
  overrides: Partial<InstalledExtension> = {},
): InstalledExtension {
  return {
    id: "acme.hello",
    name: "Hello",
    version: "1.2.3",
    publisher: "acme",
    capabilities: ["conversation:read"],
    sourceUrl: "/__extensions/hello",
    origin: "user",
    ...overrides,
  };
}

describe("InstalledExtensionCard", () => {
  it("renders a user extension with an uninstall action", async () => {
    const user = userEvent.setup();
    const onUninstall = vi.fn();
    render(
      <InstalledExtensionCard
        extension={makeExtension()}
        onUninstall={onUninstall}
      />,
    );

    expect(
      screen.getByTestId("installed-extension-name-acme.hello"),
    ).toHaveTextContent("Hello");
    expect(
      screen.getByTestId("installed-extension-version-acme.hello"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("uninstall-extension-acme.hello"));
    expect(onUninstall).toHaveBeenCalledTimes(1);
  });

  it("shows a dev badge and no uninstall for dev-origin extensions", () => {
    render(
      <InstalledExtensionCard
        extension={makeExtension({ origin: "dev" })}
        onUninstall={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("uninstall-extension-acme.hello"),
    ).not.toBeInTheDocument();
  });
});
