import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ManageBackendsMenuItem } from "#/components/features/backends/manage-backends-menu-item";

describe("ManageBackendsMenuItem", () => {
  it("renders the menu item with correct text", () => {
    render(<ManageBackendsMenuItem onOpen={vi.fn()} />);

    expect(screen.getByTestId("manage-backends-menu-item")).toBeInTheDocument();
    // In test environment, either translated text or i18n key will be present
    expect(
      screen.getByText(/manage backends|BACKEND\$MANAGE/i),
    ).toBeInTheDocument();
  });

  it("calls onOpen when clicked", async () => {
    const onOpen = vi.fn();
    render(<ManageBackendsMenuItem onOpen={onOpen} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("manage-backends-menu-item"));

    expect(onOpen).toHaveBeenCalled();
  });

  it("has the settings icon", () => {
    render(<ManageBackendsMenuItem onOpen={vi.fn()} />);

    const button = screen.getByTestId("manage-backends-menu-item");
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
