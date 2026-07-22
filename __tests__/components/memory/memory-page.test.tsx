import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../../test-utils";
import { MemoryPage } from "#/components/features/memory/memory-page";
import { toEngineMemoryRows } from "#/components/features/memory/engine-memories-panel";
import { toGraphDocuments } from "#/components/features/memory/memory-graph-panel";
import CentriService, {
  CentriEngineUnavailableError,
} from "#/api/centri/centri-service.api";
import type {
  CentriGraphDocument,
  CentriMemoryGraphResponse,
} from "#/api/centri/centri.types";

// Combined mutation path (browser token OR server-side proxy auth, §3.12).
const hasMutationPathMock = vi.hoisted(() => vi.fn<() => boolean>());
vi.mock("#/api/centri/centri-config", () => ({
  hasCentriMutationPath: hasMutationPathMock,
  hasCentriProxyAuth: () => false,
  hasCentriPanelToken: () => false,
  getCentriPanelToken: () => null,
  getCentridBaseUrl: () => "http://127.0.0.1:6789",
}));

// The graph canvas needs a real browser (ResizeObserver/canvas); it has its
// own upstream tests. Here we assert the adapted lib-shape contract instead:
// every document handed to the lib must carry an iterable `memories` array
// and a `documentType` (the live engine feed carries `memoryEntries`/`type`,
// which crashed the page before the `toGraphDocuments` adapter).
vi.mock("@supermemory/memory-graph", () => ({
  MemoryGraph: ({
    documents,
    children,
  }: {
    documents: Array<{ memories?: unknown; documentType?: unknown }>;
    children?: ReactNode;
  }) => (
    <div
      data-testid="mock-memory-graph"
      data-doc-count={documents.length}
      data-lib-shape={String(
        documents.every(
          (d) =>
            Array.isArray(d.memories) && typeof d.documentType === "string",
        ),
      )}
      data-first-doc-memory-count={
        Array.isArray(documents[0]?.memories)
          ? documents[0].memories.length
          : "missing"
      }
    >
      {documents.length === 0 ? children : null}
    </div>
  ),
}));

// The authored-blocks screen is fully covered by its own test file.
vi.mock(
  "#/components/features/settings/centri-memory/centri-memory-screen",
  () => ({
    CentriMemoryScreen: () => <div data-testid="mock-authored-screen" />,
  }),
);

const successToast = vi.hoisted(() => vi.fn());
const errorToast = vi.hoisted(() => vi.fn());
vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: successToast,
  displayErrorToast: errorToast,
}));

function makeDoc(
  overrides: Partial<CentriGraphDocument> = {},
): CentriGraphDocument {
  return {
    id: "doc-1",
    title: "session doc",
    containerTags: ["centri:alice:agent"],
    memoryEntries: [
      {
        id: "mem-1",
        memory: "Prefers pytest over unittest",
        version: 1,
        isLatest: true,
        isForgotten: false,
        parentMemoryId: null,
        rootMemoryId: null,
        updatedAt: "2026-07-21T09:00:00Z",
      },
      {
        id: "mem-0",
        memory: "old version",
        version: 1,
        isLatest: false,
        isForgotten: false,
        parentMemoryId: null,
        rootMemoryId: null,
      },
      {
        id: "mem-2",
        memory: "forgotten memory",
        version: 1,
        isLatest: true,
        isForgotten: true,
        parentMemoryId: null,
        rootMemoryId: null,
      },
    ],
    ...overrides,
  };
}

function makeGraph(
  overrides: Partial<CentriMemoryGraphResponse> = {},
): CentriMemoryGraphResponse {
  return {
    user: "alice",
    roles: ["agent", "writer"],
    container_tags: ["centri:alice:agent", "centri:alice:writer"],
    documents: [makeDoc()],
    pagination: { currentPage: 1, limit: 100, totalItems: 1, totalPages: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  hasMutationPathMock.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  successToast.mockReset();
  errorToast.mockReset();
});

describe("toGraphDocuments", () => {
  it("maps the live engine feed (memoryEntries/type) to the lib shape (memories/documentType)", () => {
    const docs = toGraphDocuments([
      makeDoc({ type: "text", createdAt: "2026-07-22T08:25:29.504Z" }),
    ]);
    expect(docs).toHaveLength(1);
    expect(Array.isArray(docs[0].memories)).toBe(true);
    expect(docs[0].memories).toHaveLength(3);
    expect(docs[0].memories[0].memory).toBe("Prefers pytest over unittest");
    expect(docs[0].documentType).toBe("text");
    expect(docs[0].title).toBe("session doc");
  });

  it("never hands the lib a document without an iterable memories array", () => {
    const docs = toGraphDocuments([
      makeDoc({ memoryEntries: undefined as never, title: undefined }),
    ]);
    expect(Array.isArray(docs[0].memories)).toBe(true);
    expect(docs[0].memories).toHaveLength(0);
    expect(docs[0].documentType).toBe("text");
    expect(docs[0].title).toBeNull();
  });
});

describe("toEngineMemoryRows", () => {
  it("keeps only latest, non-forgotten entries and maps roles from tags", () => {
    const rows = toEngineMemoryRows([makeDoc()], "alice");
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("agent");
    expect(rows[0].entry.id).toBe("mem-1");
  });

  it("skips documents without a centri container tag for this user", () => {
    const rows = toEngineMemoryRows(
      [makeDoc({ containerTags: ["someone-else"] })],
      "alice",
    );
    expect(rows).toHaveLength(0);
  });
});

describe("MemoryPage", () => {
  it("renders the graph passthrough and the editable rows", async () => {
    vi.spyOn(CentriService, "getMemoryGraph").mockResolvedValue(makeGraph());

    renderWithProviders(<MemoryPage />);

    await waitFor(() =>
      expect(screen.getByTestId("mock-memory-graph")).toHaveAttribute(
        "data-doc-count",
        "1",
      ),
    );
    // The panel must hand the lib adapted documents (memories/documentType),
    // not the raw engine feed (memoryEntries/type).
    expect(screen.getByTestId("mock-memory-graph")).toHaveAttribute(
      "data-lib-shape",
      "true",
    );
    expect(screen.getByTestId("mock-memory-graph")).toHaveAttribute(
      "data-first-doc-memory-count",
      "3",
    );
    expect(screen.getByTestId("engine-memory-mem-1")).toBeInTheDocument();
    expect(screen.queryByTestId("engine-memory-mem-0")).toBeNull();
    expect(screen.queryByTestId("engine-memory-mem-2")).toBeNull();
    expect(screen.getByTestId("mock-authored-screen")).toBeInTheDocument();
  });

  it("hides mutations and shows the banner when no auth path exists", async () => {
    hasMutationPathMock.mockReturnValue(false);
    vi.spyOn(CentriService, "getMemoryGraph").mockResolvedValue(makeGraph());

    renderWithProviders(<MemoryPage />);

    await waitFor(() =>
      expect(screen.getByTestId("engine-memory-mem-1")).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("memory-mutations-disabled-banner"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("engine-memory-add")).toBeNull();
    expect(screen.queryByTestId("engine-memory-edit-mem-1")).toBeNull();
  });

  it("revises a memory via PATCH with the role from the container tag", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "getMemoryGraph").mockResolvedValue(makeGraph());
    const update = vi
      .spyOn(CentriService, "updateEngineMemory")
      .mockResolvedValue({
        role: "agent",
        container_tag: "centri:alice:agent",
        spine_event_id: 7,
        memory: {
          id: "mem-3",
          memory: "Prefers pytest",
          version: 2,
          isLatest: true,
          isForgotten: false,
          parentMemoryId: "mem-1",
          rootMemoryId: "mem-1",
        },
      });

    renderWithProviders(<MemoryPage />);
    await user.click(await screen.findByTestId("engine-memory-edit-mem-1"));
    const editor = screen.getByTestId("engine-memory-editor-mem-1");
    await user.clear(editor);
    await user.type(editor, "Prefers pytest");
    await user.click(screen.getByTestId("engine-memory-save-mem-1"));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("agent", "mem-1", "Prefers pytest"),
    );
    expect(successToast).toHaveBeenCalled();
  });

  it("forgets a memory via DELETE after inline confirm", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "getMemoryGraph").mockResolvedValue(makeGraph());
    const forget = vi
      .spyOn(CentriService, "forgetEngineMemory")
      .mockResolvedValue({
        role: "agent",
        container_tag: "centri:alice:agent",
        spine_event_id: 8,
        id: "mem-1",
        forgotten: true,
      });

    renderWithProviders(<MemoryPage />);
    await user.click(await screen.findByTestId("engine-memory-forget-mem-1"));
    await user.click(screen.getByTestId("engine-memory-confirm-forget-mem-1"));

    await waitFor(() => expect(forget).toHaveBeenCalledWith("agent", "mem-1"));
    expect(successToast).toHaveBeenCalled();
  });

  it("creates a memory via POST for the role picked in the add box", async () => {
    const user = userEvent.setup();
    vi.spyOn(CentriService, "getMemoryGraph").mockResolvedValue(makeGraph());
    const create = vi
      .spyOn(CentriService, "createEngineMemories")
      .mockResolvedValue({
        role: "writer",
        container_tag: "centri:alice:writer",
        spine_event_id: 9,
        document_id: "doc-9",
        memories: [{ id: "mem-9" }],
      });

    renderWithProviders(<MemoryPage />);
    const input = await screen.findByTestId("engine-memory-add-input");
    await user.type(input, "Likes espresso");
    await user.selectOptions(
      screen.getByTestId("engine-memory-add-role"),
      "writer",
    );
    await user.click(screen.getByTestId("engine-memory-add-save"));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith("writer", [
        { content: "Likes espresso" },
      ]),
    );
    expect(successToast).toHaveBeenCalled();
  });

  it("renders the inline error state on 502 (engine down) without retrying", async () => {
    vi.spyOn(CentriService, "getMemoryGraph").mockRejectedValue(
      new CentriEngineUnavailableError("engine down"),
    );

    renderWithProviders(<MemoryPage />);

    expect(await screen.findByTestId("memory-graph-error")).toBeInTheDocument();
    expect(screen.getByTestId("memory-graph-retry")).toBeInTheDocument();
    expect(CentriService.getMemoryGraph).toHaveBeenCalledTimes(1);
  });

  it("refetches with the picked role when the filter changes", async () => {
    const user = userEvent.setup();
    const getGraph = vi
      .spyOn(CentriService, "getMemoryGraph")
      .mockResolvedValue(makeGraph());

    renderWithProviders(<MemoryPage />);
    await screen.findByTestId("engine-memory-mem-1");
    await user.selectOptions(
      screen.getByTestId("memory-role-filter"),
      "writer",
    );

    await waitFor(() => expect(getGraph).toHaveBeenCalledWith("writer"));
  });
});
