import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../../test-utils";
import { CentriMemoryScreen } from "#/components/features/settings/centri-memory/centri-memory-screen";
import CentriService, {
  CentriNotFoundError,
  CentriUnreachableError,
} from "#/api/centri/centri-service.api";
import type {
  CentriMemoryListResponse,
  CentriMemoryStoreContent,
} from "#/api/centri/centri.types";

const hasTokenMock = vi.hoisted(() => vi.fn<() => boolean>());
vi.mock("#/api/centri/centri-config", () => ({
  // The screen gates edit affordances on the combined mutation path
  // (browser token OR server-side proxy auth, SPEC §3.12).
  hasCentriMutationPath: hasTokenMock,
}));

const successToast = vi.hoisted(() => vi.fn());
const errorToast = vi.hoisted(() => vi.fn());
vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: successToast,
  displayErrorToast: errorToast,
}));

function makeList(
  overrides: Partial<CentriMemoryListResponse> = {},
): CentriMemoryListResponse {
  return {
    frames_dir: "/home/alice/.centri/frames",
    roles: [
      {
        role: "writer",
        stores: [
          {
            role: "writer",
            kind: "rules",
            filename: "rules.md",
            section: "Rules",
            present: true,
            bytes: 12,
            chars: 12,
            lines: 2,
          },
          {
            role: "writer",
            kind: "identity",
            filename: "identity.md",
            section: "Role Identity",
            present: false,
            bytes: 0,
            chars: 0,
            lines: 0,
          },
          {
            role: "writer",
            kind: "working_notes",
            filename: "working_notes.md",
            section: "Role Identity",
            present: false,
            bytes: 0,
            chars: 0,
            lines: 0,
          },
        ],
      },
    ],
    engine_sections: [
      { name: "Profile", reason: "POST /v4/profile — §9, unproven" },
    ],
    ...overrides,
  };
}

function makeStore(
  overrides: Partial<CentriMemoryStoreContent> = {},
): CentriMemoryStoreContent {
  return {
    store: {
      role: "writer",
      kind: "rules",
      filename: "rules.md",
      section: "Rules",
      present: true,
      bytes: 12,
      chars: 12,
      lines: 2,
    },
    content: "Be concise.",
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

describe("CentriMemoryScreen", () => {
  it("shows a loading state while the store list is pending", () => {
    vi.spyOn(CentriService, "listMemoryStores").mockReturnValue(
      new Promise(() => {}),
    );
    renderWithProviders(<CentriMemoryScreen />);
    expect(screen.getByTestId("centri-memory-loading")).toBeInTheDocument();
  });

  it("renders an unreachable error state with a retry action", async () => {
    vi.spyOn(CentriService, "listMemoryStores").mockRejectedValue(
      new CentriUnreachableError("down"),
    );
    renderWithProviders(<CentriMemoryScreen />);

    expect(await screen.findByTestId("centri-memory-error")).toBeInTheDocument();
    expect(screen.getByText("CENTRI$ERROR_UNREACHABLE")).toBeInTheDocument();
    expect(screen.getByTestId("centri-memory-retry")).toBeInTheDocument();
  });

  it("renders an empty state when no roles have authored memory", async () => {
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(
      makeList({ roles: [], engine_sections: [] }),
    );
    renderWithProviders(<CentriMemoryScreen />);

    expect(await screen.findByTestId("centri-memory-empty")).toBeInTheDocument();
  });

  it("renders roles, stores and the omitted engine sections", async () => {
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(makeList());
    renderWithProviders(<CentriMemoryScreen />);

    expect(
      await screen.findByTestId("centri-memory-screen"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("centri-memory-role-writer")).toBeInTheDocument();
    expect(
      screen.getByTestId("centri-memory-store-writer-rules"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("centri-memory-engine-sections"),
    ).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("opens the editor and loads store content", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(makeList());
    vi.spyOn(CentriService, "readMemoryStore").mockResolvedValue(makeStore());

    renderWithProviders(<CentriMemoryScreen />);

    await user.click(
      await screen.findByTestId("centri-memory-open-writer-rules"),
    );

    const textarea = await screen.findByTestId("centri-memory-content");
    await waitFor(() =>
      expect(textarea).toHaveValue("Be concise."),
    );
  });

  it("saves an edit and toasts on success", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(makeList());
    vi.spyOn(CentriService, "readMemoryStore").mockResolvedValue(makeStore());
    const editSpy = vi
      .spyOn(CentriService, "editMemoryStore")
      .mockResolvedValue(makeStore({ content: "Be concise. Cite sources." }));

    renderWithProviders(<CentriMemoryScreen />);

    await user.click(
      await screen.findByTestId("centri-memory-open-writer-rules"),
    );
    const textarea = await screen.findByTestId("centri-memory-content");
    await waitFor(() => expect(textarea).toHaveValue("Be concise."));

    await user.type(textarea, " Cite sources.");
    await user.click(screen.getByTestId("centri-memory-save"));

    await waitFor(() =>
      expect(editSpy).toHaveBeenCalledWith(
        "writer",
        "rules",
        "Be concise. Cite sources.",
      ),
    );
    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
  });

  it("disables editing and explains why when no panel token is configured", async () => {
    hasTokenMock.mockReturnValue(false);
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(makeList());
    vi.spyOn(CentriService, "readMemoryStore").mockResolvedValue(makeStore());

    const user = userEvent.setup();
    renderWithProviders(<CentriMemoryScreen />);

    await user.click(
      await screen.findByTestId("centri-memory-open-writer-rules"),
    );

    expect(await screen.findByTestId("centri-memory-content")).toBeDisabled();
    expect(screen.getByTestId("centri-memory-save")).toBeDisabled();
    expect(screen.getByTestId("centri-memory-forget")).toBeDisabled();
    // The banner is shown at the top too.
    expect(
      screen.getByTestId("centri-memory-token-missing-banner"),
    ).toBeInTheDocument();
  });

  it("requires confirmation before forgetting and calls forget on confirm", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(makeList());
    vi.spyOn(CentriService, "readMemoryStore").mockResolvedValue(makeStore());
    const forgetSpy = vi
      .spyOn(CentriService, "forgetMemoryStore")
      .mockResolvedValue({ role: "writer", kind: "rules", forgotten: true });

    renderWithProviders(<CentriMemoryScreen />);

    await user.click(
      await screen.findByTestId("centri-memory-open-writer-rules"),
    );
    await screen.findByTestId("centri-memory-content");

    await user.click(screen.getByTestId("centri-memory-forget"));
    // The destructive call must not fire before confirmation.
    expect(forgetSpy).not.toHaveBeenCalled();

    await user.click(await screen.findByTestId("centri-memory-forget-yes"));
    await waitFor(() =>
      expect(forgetSpy).toHaveBeenCalledWith("writer", "rules"),
    );
    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
  });

  it("cancels a forget when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(makeList());
    vi.spyOn(CentriService, "readMemoryStore").mockResolvedValue(makeStore());
    const forgetSpy = vi.spyOn(CentriService, "forgetMemoryStore");

    renderWithProviders(<CentriMemoryScreen />);

    await user.click(
      await screen.findByTestId("centri-memory-open-writer-rules"),
    );
    await screen.findByTestId("centri-memory-content");

    await user.click(screen.getByTestId("centri-memory-forget"));
    await user.click(await screen.findByTestId("centri-memory-forget-no"));

    expect(
      screen.queryByTestId("centri-memory-forget-confirm"),
    ).not.toBeInTheDocument();
    expect(forgetSpy).not.toHaveBeenCalled();
  });

  it("toasts an error when forget fails (already gone)", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(makeList());
    vi.spyOn(CentriService, "readMemoryStore").mockResolvedValue(makeStore());
    vi.spyOn(CentriService, "forgetMemoryStore").mockRejectedValue(
      new CentriNotFoundError("nothing to forget"),
    );

    renderWithProviders(<CentriMemoryScreen />);

    await user.click(
      await screen.findByTestId("centri-memory-open-writer-rules"),
    );
    await screen.findByTestId("centri-memory-content");

    await user.click(screen.getByTestId("centri-memory-forget"));
    await user.click(await screen.findByTestId("centri-memory-forget-yes"));

    await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1));
    expect(errorToast).toHaveBeenCalledWith("CENTRI$ERROR_NOT_FOUND");
  });

  it("shows a create hint and enables save for a not-yet-authored store", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "listMemoryStores").mockResolvedValue(makeList());
    vi.spyOn(CentriService, "readMemoryStore").mockResolvedValue(
      makeStore({
        store: {
          role: "writer",
          kind: "identity",
          filename: "identity.md",
          section: "Role Identity",
          present: false,
          bytes: 0,
          chars: 0,
          lines: 0,
        },
        content: "",
      }),
    );

    renderWithProviders(<CentriMemoryScreen />);

    await user.click(
      await screen.findByTestId("centri-memory-open-writer-identity"),
    );

    expect(
      await screen.findByTestId("centri-memory-editor-empty-hint"),
    ).toBeInTheDocument();
    // Forget is disabled for an absent store; save becomes enabled once typed.
    expect(screen.getByTestId("centri-memory-forget")).toBeDisabled();
    await user.type(
      screen.getByTestId("centri-memory-content"),
      "A precise editor.",
    );
    expect(screen.getByTestId("centri-memory-save")).not.toBeDisabled();
  });
});
