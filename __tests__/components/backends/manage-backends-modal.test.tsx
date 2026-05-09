import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { ManageBackendsModal } from "#/components/features/backends/manage-backends-modal";
import type { Backend } from "#/api/backend-registry/types";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>{ui}</ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

function createMockBackends(): Backend[] {
  return [
    {
      id: "backend-1",
      name: "Production",
      host: "https://prod.example.com",
      apiKey: "prod-key",
      kind: "cloud",
    },
    {
      id: "backend-2",
      name: "Local Dev",
      host: "http://localhost:18000",
      apiKey: "",
      kind: "local",
    },
  ];
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("ManageBackendsModal", () => {
  it("shows empty message when no backends exist", () => {
    renderWithProviders(
      <ManageBackendsModal onClose={vi.fn()} onEditBackend={vi.fn()} />,
    );

    expect(screen.getByTestId("no-backends-message")).toBeInTheDocument();
  });

  it("renders list of backends when they exist", () => {
    const backends = createMockBackends();
    window.localStorage.setItem("openhands-backends", JSON.stringify(backends));
    __resetActiveStoreForTests();

    renderWithProviders(
      <ManageBackendsModal onClose={vi.fn()} onEditBackend={vi.fn()} />,
    );

    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Local Dev")).toBeInTheDocument();
    expect(screen.getByText("https://prod.example.com")).toBeInTheDocument();
    expect(screen.getByText("http://localhost:18000")).toBeInTheDocument();
  });

  it("calls onEditBackend when edit button is clicked", async () => {
    const backends = createMockBackends();
    window.localStorage.setItem("openhands-backends", JSON.stringify(backends));
    __resetActiveStoreForTests();

    const onEditBackend = vi.fn();
    renderWithProviders(
      <ManageBackendsModal onClose={vi.fn()} onEditBackend={onEditBackend} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("edit-backend-backend-1"));

    expect(onEditBackend).toHaveBeenCalledWith(
      expect.objectContaining({ id: "backend-1", name: "Production" }),
    );
  });

  it("shows confirmation when remove button is clicked", async () => {
    const backends = createMockBackends();
    window.localStorage.setItem("openhands-backends", JSON.stringify(backends));
    __resetActiveStoreForTests();

    renderWithProviders(
      <ManageBackendsModal onClose={vi.fn()} onEditBackend={vi.fn()} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("remove-backend-backend-1"));

    // Should show confirm and cancel buttons
    expect(screen.getByTestId("confirm-remove-backend-1")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-remove-backend-1")).toBeInTheDocument();
  });

  it("removes backend when confirmation is clicked", async () => {
    const backends = createMockBackends();
    window.localStorage.setItem("openhands-backends", JSON.stringify(backends));
    __resetActiveStoreForTests();

    renderWithProviders(
      <ManageBackendsModal onClose={vi.fn()} onEditBackend={vi.fn()} />,
    );

    const user = userEvent.setup();
    // Click remove
    await user.click(screen.getByTestId("remove-backend-backend-1"));
    // Click confirm
    await user.click(screen.getByTestId("confirm-remove-backend-1"));

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("backend-2");
  });

  it("cancels removal when cancel is clicked", async () => {
    const backends = createMockBackends();
    window.localStorage.setItem("openhands-backends", JSON.stringify(backends));
    __resetActiveStoreForTests();

    renderWithProviders(
      <ManageBackendsModal onClose={vi.fn()} onEditBackend={vi.fn()} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("remove-backend-backend-1"));
    await user.click(screen.getByTestId("cancel-remove-backend-1"));

    // Should go back to showing edit/remove buttons
    expect(screen.getByTestId("edit-backend-backend-1")).toBeInTheDocument();
    expect(screen.getByTestId("remove-backend-backend-1")).toBeInTheDocument();

    // Backend should still exist
    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    expect(stored).toHaveLength(2);
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ManageBackendsModal onClose={onClose} onEditBackend={vi.fn()} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("manage-backends-close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("shows API key indicator for backends with keys", () => {
    const backends = createMockBackends();
    window.localStorage.setItem("openhands-backends", JSON.stringify(backends));
    __resetActiveStoreForTests();

    renderWithProviders(
      <ManageBackendsModal onClose={vi.fn()} onEditBackend={vi.fn()} />,
    );

    // Find the Production backend item (has API key)
    const prodItem = screen.getByTestId("backend-item-backend-1");
    expect(prodItem).toHaveTextContent("API key set");

    // Find the Local Dev backend item (no API key)
    const localItem = screen.getByTestId("backend-item-backend-2");
    expect(localItem).not.toHaveTextContent("API key set");
  });

  it("shows correct kind label for each backend", () => {
    const backends = createMockBackends();
    window.localStorage.setItem("openhands-backends", JSON.stringify(backends));
    __resetActiveStoreForTests();

    renderWithProviders(
      <ManageBackendsModal onClose={vi.fn()} onEditBackend={vi.fn()} />,
    );

    // Check that kind labels are present (either translated or i18n key)
    const prodItem = screen.getByTestId("backend-item-backend-1");
    expect(prodItem).toHaveTextContent(/Cloud|BACKEND\$KIND_CLOUD/i);

    const localItem = screen.getByTestId("backend-item-backend-2");
    expect(localItem).toHaveTextContent(/Local|BACKEND\$KIND_LOCAL/i);
  });
});
