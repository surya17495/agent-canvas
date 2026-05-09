import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { EditBackendModal } from "#/components/features/backends/edit-backend-modal";
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

function createMockBackend(
  overrides?: Partial<Backend>,
): Backend {
  return {
    id: "test-backend-id",
    name: "Test Backend",
    host: "https://test.example.com",
    apiKey: "test-api-key",
    kind: "cloud",
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  // Pre-populate with a backend to edit
  const backends = [createMockBackend()];
  window.localStorage.setItem("openhands-backends", JSON.stringify(backends));
  __resetActiveStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("EditBackendModal", () => {
  it("renders with pre-populated name and host values", () => {
    const backend = createMockBackend();
    renderWithProviders(
      <EditBackendModal backend={backend} onClose={vi.fn()} />,
    );

    const nameInput = screen.getByTestId("edit-backend-name") as HTMLInputElement;
    const hostInput = screen.getByTestId("edit-backend-host") as HTMLInputElement;

    expect(nameInput.value).toBe("Test Backend");
    expect(hostInput.value).toBe("https://test.example.com");
  });

  it("renders API key field as empty with placeholder when key exists", () => {
    const backend = createMockBackend({ apiKey: "existing-key" });
    renderWithProviders(
      <EditBackendModal backend={backend} onClose={vi.fn()} />,
    );

    const apiKeyInput = screen.getByTestId(
      "edit-backend-api-key",
    ) as HTMLInputElement;
    expect(apiKeyInput.value).toBe("");
    // In test environment, i18n key is not resolved - check for key presence
    expect(apiKeyInput.placeholder).toMatch(/Leave empty|BACKEND\$KEY_PLACEHOLDER_EXISTING/);
  });

  it("pre-selects the correct backend kind", () => {
    const backend = createMockBackend({ kind: "local" });
    renderWithProviders(
      <EditBackendModal backend={backend} onClose={vi.fn()} />,
    );

    const localRadio = screen.getByTestId(
      "edit-backend-kind-local",
    ) as HTMLInputElement;
    const cloudRadio = screen.getByTestId(
      "edit-backend-kind-cloud",
    ) as HTMLInputElement;

    expect(localRadio.checked).toBe(true);
    expect(cloudRadio.checked).toBe(false);
  });

  it("allows saving with existing API key (empty input)", async () => {
    const onClose = vi.fn();
    // Setup a backend with existing-key in localStorage
    const backend = createMockBackend({ apiKey: "existing-key" });
    window.localStorage.setItem("openhands-backends", JSON.stringify([backend]));
    __resetActiveStoreForTests();
    
    renderWithProviders(<EditBackendModal backend={backend} onClose={onClose} />);

    const submit = screen.getByTestId(
      "edit-backend-submit",
    ) as HTMLButtonElement;
    // Should be enabled because there's an existing key
    expect(submit).not.toBeDisabled();

    const user = userEvent.setup();
    await user.click(submit);

    expect(onClose).toHaveBeenCalled();

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    expect(stored).toHaveLength(1);
    // API key should remain unchanged when empty input
    expect(stored[0].apiKey).toBe("existing-key");
  });

  it("updates API key when a new one is provided", async () => {
    const onClose = vi.fn();
    const backend = createMockBackend({ apiKey: "old-key" });
    renderWithProviders(<EditBackendModal backend={backend} onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByTestId("edit-backend-api-key"), "new-api-key");
    await user.click(screen.getByTestId("edit-backend-submit"));

    expect(onClose).toHaveBeenCalled();

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].apiKey).toBe("new-api-key");
  });

  it("updates backend name and host", async () => {
    const onClose = vi.fn();
    const backend = createMockBackend();
    renderWithProviders(<EditBackendModal backend={backend} onClose={onClose} />);

    const user = userEvent.setup();

    const nameInput = screen.getByTestId("edit-backend-name");
    const hostInput = screen.getByTestId("edit-backend-host");

    await user.clear(nameInput);
    await user.type(nameInput, "Updated Name");

    await user.clear(hostInput);
    await user.type(hostInput, "https://updated.example.com");

    await user.click(screen.getByTestId("edit-backend-submit"));

    expect(onClose).toHaveBeenCalled();

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Updated Name");
    expect(stored[0].host).toBe("https://updated.example.com");
  });

  it("disables submit when name is empty", async () => {
    const backend = createMockBackend();
    renderWithProviders(<EditBackendModal backend={backend} onClose={vi.fn()} />);

    const user = userEvent.setup();
    const nameInput = screen.getByTestId("edit-backend-name");
    const submit = screen.getByTestId(
      "edit-backend-submit",
    ) as HTMLButtonElement;

    await user.clear(nameInput);
    expect(submit).toBeDisabled();
  });

  it("disables submit when host is empty", async () => {
    const backend = createMockBackend();
    renderWithProviders(<EditBackendModal backend={backend} onClose={vi.fn()} />);

    const user = userEvent.setup();
    const hostInput = screen.getByTestId("edit-backend-host");
    const submit = screen.getByTestId(
      "edit-backend-submit",
    ) as HTMLButtonElement;

    await user.clear(hostInput);
    expect(submit).toBeDisabled();
  });

  it("closes modal without saving when cancel is clicked", async () => {
    const onClose = vi.fn();
    const backend = createMockBackend();
    renderWithProviders(<EditBackendModal backend={backend} onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByTestId("edit-backend-name"), " Modified");
    await user.click(screen.getByTestId("edit-backend-cancel"));

    expect(onClose).toHaveBeenCalled();

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    // Original name should remain unchanged
    expect(stored[0].name).toBe("Test Backend");
  });

  it("requires API key for cloud backends without existing key", async () => {
    const backend = createMockBackend({ kind: "cloud", apiKey: "" });
    renderWithProviders(<EditBackendModal backend={backend} onClose={vi.fn()} />);

    const submit = screen.getByTestId(
      "edit-backend-submit",
    ) as HTMLButtonElement;

    // Should be disabled without an API key for cloud backend
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByTestId("edit-backend-api-key"), "new-key");

    expect(submit).not.toBeDisabled();
  });

  it("allows empty API key for local backends", async () => {
    const onClose = vi.fn();
    const backend = createMockBackend({ kind: "local", apiKey: "" });
    renderWithProviders(<EditBackendModal backend={backend} onClose={onClose} />);

    const submit = screen.getByTestId(
      "edit-backend-submit",
    ) as HTMLButtonElement;

    // Should be enabled even without API key for local backend
    expect(submit).not.toBeDisabled();

    const user = userEvent.setup();
    await user.click(submit);

    expect(onClose).toHaveBeenCalled();
  });

  it("allows changing kind from cloud to local", async () => {
    const onClose = vi.fn();
    const backend = createMockBackend({ kind: "cloud", apiKey: "key" });
    renderWithProviders(<EditBackendModal backend={backend} onClose={onClose} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("edit-backend-kind-local"));
    await user.click(screen.getByTestId("edit-backend-submit"));

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    expect(stored[0].kind).toBe("local");
  });
});
