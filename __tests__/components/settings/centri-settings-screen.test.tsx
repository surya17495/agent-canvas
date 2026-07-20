import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../../test-utils";
import { CentriSettingsScreen } from "#/components/features/settings/centri-settings/centri-settings-screen";
import CentriService, {
  CentriUnreachableError,
} from "#/api/centri/centri-service.api";
import type { CentriSettings } from "#/api/centri/centri.types";

const hasTokenMock = vi.hoisted(() => vi.fn<() => boolean>());
vi.mock("#/api/centri/centri-config", () => ({
  hasCentriPanelToken: hasTokenMock,
}));

const successToast = vi.hoisted(() => vi.fn());
const errorToast = vi.hoisted(() => vi.fn());
vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: successToast,
  displayErrorToast: errorToast,
}));

function makeSettings(overrides: Partial<CentriSettings> = {}): CentriSettings {
  return {
    user: "alice",
    engine: {
      base_url: "http://127.0.0.1:9000",
      reachable: true,
      status: "up",
      version_pin: "v1.2.3",
    },
    product_ready: true,
    key: { llm_key_present: true, engine_key_present: false },
    sync: {
      sessions_total: 3,
      sessions_pending_pump: 1,
      roles: ["writer"],
      pending: [{ session_id: "sess-1" }],
    },
    deploy: { lock_valid: true, error: null, components: [] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  successToast.mockReset();
  errorToast.mockReset();
  hasTokenMock.mockReset();
  hasTokenMock.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CentriSettingsScreen", () => {
  it("shows a loading state while settings are pending", () => {
    vi.spyOn(CentriService, "getSettings").mockReturnValue(
      new Promise(() => {}),
    );
    renderWithProviders(<CentriSettingsScreen />);
    expect(screen.getByTestId("centri-loading")).toBeInTheDocument();
  });

  it("renders an unreachable error state with a retry action", async () => {
    vi.spyOn(CentriService, "getSettings").mockRejectedValue(
      new CentriUnreachableError("down"),
    );
    renderWithProviders(<CentriSettingsScreen />);

    expect(await screen.findByTestId("centri-error")).toBeInTheDocument();
    expect(screen.getByText("CENTRI$ERROR_UNREACHABLE")).toBeInTheDocument();
    expect(screen.getByTestId("centri-retry")).toBeInTheDocument();
  });

  it("renders engine, keys and sync sections on success", async () => {
    vi.spyOn(CentriService, "getSettings").mockResolvedValue(makeSettings());
    renderWithProviders(<CentriSettingsScreen />);

    expect(
      await screen.findByTestId("centri-settings-screen"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("centri-engine-section")).toBeInTheDocument();
    expect(screen.getByTestId("centri-keys-section")).toBeInTheDocument();
    expect(screen.getByTestId("centri-sync-section")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    // The raw base_url is shown, but no key material is ever rendered.
    expect(screen.getByText("http://127.0.0.1:9000")).toBeInTheDocument();
  });

  it("shows the degraded banner when the engine is not reachable", async () => {
    vi.spyOn(CentriService, "getSettings").mockResolvedValue(
      makeSettings({
        engine: {
          base_url: "http://127.0.0.1:9000",
          reachable: false,
          status: "unavailable",
          version_pin: "v1.2.3",
        },
      }),
    );
    renderWithProviders(<CentriSettingsScreen />);

    expect(
      await screen.findByTestId("centri-degraded-banner"),
    ).toBeInTheDocument();
  });

  it("disables sync and explains why when no panel token is configured", async () => {
    hasTokenMock.mockReturnValue(false);
    vi.spyOn(CentriService, "getSettings").mockResolvedValue(makeSettings());
    renderWithProviders(<CentriSettingsScreen />);

    const syncButton = await screen.findByTestId("centri-sync-now");
    expect(syncButton).toBeDisabled();
    expect(screen.getByTestId("centri-token-missing")).toBeInTheDocument();
  });

  it("pumps all sessions and toasts the summary on success", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "getSettings").mockResolvedValue(makeSettings());
    const pumpSpy = vi.spyOn(CentriService, "pump").mockResolvedValue({
      results: [{ session_id: "sess-1", status: "pumped" }],
      summary: { pumped: 1, no_op: 0, failed: 0, ok: true },
    });

    renderWithProviders(<CentriSettingsScreen />);

    const syncButton = await screen.findByTestId("centri-sync-now");
    await user.click(syncButton);

    // Confirmation is required before the mutation fires.
    const confirmButton = await screen.findByTestId("centri-sync-confirm-yes");
    expect(pumpSpy).not.toHaveBeenCalled();
    await user.click(confirmButton);

    await waitFor(() => expect(pumpSpy).toHaveBeenCalledWith(undefined));
    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("cancels the pump when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "getSettings").mockResolvedValue(makeSettings());
    const pumpSpy = vi.spyOn(CentriService, "pump");

    renderWithProviders(<CentriSettingsScreen />);

    const syncButton = await screen.findByTestId("centri-sync-now");
    await user.click(syncButton);
    await user.click(await screen.findByTestId("centri-sync-confirm-no"));

    expect(
      screen.queryByTestId("centri-sync-confirm"),
    ).not.toBeInTheDocument();
    expect(pumpSpy).not.toHaveBeenCalled();
  });

  it("pumps a single pending session by id", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "getSettings").mockResolvedValue(makeSettings());
    const pumpSpy = vi.spyOn(CentriService, "pump").mockResolvedValue({
      results: [{ session_id: "sess-1", status: "pumped" }],
      summary: { pumped: 1, no_op: 0, failed: 0, ok: true },
    });

    renderWithProviders(<CentriSettingsScreen />);

    const rowButton = await screen.findByTestId("centri-sync-session-sess-1");
    await user.click(rowButton);
    await user.click(await screen.findByTestId("centri-sync-confirm-yes"));

    await waitFor(() => expect(pumpSpy).toHaveBeenCalledWith("sess-1"));
  });

  it("toasts an error message when pump fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "getSettings").mockResolvedValue(makeSettings());
    vi.spyOn(CentriService, "pump").mockRejectedValue(
      new CentriUnreachableError("down"),
    );

    renderWithProviders(<CentriSettingsScreen />);

    const syncButton = await screen.findByTestId("centri-sync-now");
    await user.click(syncButton);
    await user.click(await screen.findByTestId("centri-sync-confirm-yes"));

    await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1));
    expect(errorToast).toHaveBeenCalledWith("CENTRI$ERROR_UNREACHABLE");
  });
});
