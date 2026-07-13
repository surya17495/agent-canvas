import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Automation } from "#/types/automation";
import type {
  Backend,
  BackendKind,
  ResolvedActiveBackend,
} from "#/api/backend-registry/types";
import type { AutomationHealthResponse } from "#/api/automation-service/automation-service.api";
import { I18nKey } from "#/i18n/declaration";
import AutomationDetail from "#/routes/automation-detail";

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useAutomationHealth: vi.fn(),
  useAutomationDetail: vi.fn(),
  useToggleAutomation: vi.fn(),
  useDeleteAutomation: vi.fn(),
  useDispatchAutomation: vi.fn(),
  useActiveBackend: vi.fn(),
  useNavigation: vi.fn(),
  useTracking: vi.fn(),
  refetchHealth: vi.fn(),
  refetchDetail: vi.fn(),
  toggle: vi.fn(),
  deleteAutomation: vi.fn(),
  dispatch: vi.fn(),
  navigate: vi.fn(),
  trackEnabled: vi.fn(),
  trackExported: vi.fn(),
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
  downloadTarball: vi.fn(),
  serializeAutomation: vi.fn(),
  getAutomationExportFilename: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useParams: mocks.useParams,
}));

vi.mock("#/hooks/query/use-automation-health", () => ({
  useAutomationHealth: mocks.useAutomationHealth,
}));

vi.mock("#/hooks/query/use-automation-detail", () => ({
  useAutomationDetail: mocks.useAutomationDetail,
}));

vi.mock("#/hooks/query/use-automations", () => ({
  useToggleAutomation: mocks.useToggleAutomation,
  useDeleteAutomation: mocks.useDeleteAutomation,
  useDispatchAutomation: mocks.useDispatchAutomation,
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: mocks.useActiveBackend,
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: mocks.useNavigation,
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: mocks.useTracking,
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: mocks.displaySuccessToast,
  displayErrorToast: mocks.displayErrorToast,
}));

vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: { downloadTarball: mocks.downloadTarball },
}));

vi.mock("#/utils/automation-export", () => ({
  serializeAutomation: mocks.serializeAutomation,
  getAutomationExportFilename: mocks.getAutomationExportFilename,
}));

vi.mock("#/utils/utils", () => ({
  downloadBlob: mocks.downloadBlob,
}));

vi.mock("#/components/features/automations/detail/back-link", () => ({
  BackLink: () => <div data-testid="back-link" />,
}));

vi.mock("#/components/features/automations/detail/detail-header", () => ({
  DetailHeader: ({
    automation,
    onToggle,
    onEdit,
    onDelete,
    onExport,
    onDownloadTarball,
    onRunNow,
    isRunningNow,
  }: {
    automation: Automation;
    onToggle: () => void;
    onEdit?: () => void;
    onDelete: () => void;
    onExport: () => void;
    onDownloadTarball: () => void;
    onRunNow: () => void;
    isRunningNow: boolean;
  }) => (
    <section data-testid="detail-header">
      <span>{automation.name}</span>
      <span data-testid="run-pending">{String(isRunningNow)}</span>
      <button type="button" onClick={onToggle}>
        toggle automation
      </button>
      {onEdit && (
        <button type="button" onClick={onEdit}>
          edit automation
        </button>
      )}
      <button type="button" onClick={onDelete}>
        delete automation
      </button>
      <button type="button" onClick={onExport}>
        export automation
      </button>
      <button type="button" onClick={onDownloadTarball}>
        download tarball
      </button>
      <button type="button" onClick={onRunNow}>
        run automation
      </button>
    </section>
  ),
}));

vi.mock("#/components/features/automations/detail/prompt-section", () => ({
  PromptSection: ({ prompt }: { prompt: string }) => (
    <div data-testid="prompt-section">{prompt}</div>
  ),
}));

vi.mock(
  "#/components/features/automations/detail/configuration-section",
  () => ({
    ConfigurationSection: ({ automation }: { automation: Automation }) => (
      <div data-testid="configuration-section">{automation.id}</div>
    ),
  }),
);

vi.mock("#/components/features/automations/detail/plugins-section", () => ({
  PluginsSection: ({ plugins }: { plugins: string[] }) => (
    <div data-testid="plugins-section">{plugins.join(",")}</div>
  ),
}));

vi.mock("#/components/features/automations/detail/activity-section", () => ({
  ActivitySection: ({
    createdAt,
    lastRunAt,
  }: {
    createdAt: string;
    lastRunAt?: string | null;
  }) => (
    <div data-testid="activity-section">
      {createdAt}:{lastRunAt ?? "never"}
    </div>
  ),
}));

vi.mock(
  "#/components/features/automations/detail/activity-log-section",
  () => ({
    ActivityLogSection: ({ automation }: { automation: Automation }) => (
      <div data-testid="activity-log-section">{automation.id}</div>
    ),
  }),
);

vi.mock("#/components/features/automations/detail/detail-skeleton", () => ({
  DetailSkeleton: () => <div data-testid="detail-skeleton" />,
}));

vi.mock("#/components/features/automations/detail/not-found-state", () => ({
  NotFoundState: () => <div data-testid="not-found-state" />,
}));

vi.mock("#/components/features/automations/error-state", () => ({
  ErrorState: ({ onRetry }: { onRetry: () => void }) => (
    <button type="button" onClick={onRetry}>
      retry detail
    </button>
  ),
}));

vi.mock("#/components/features/automations/backend-not-configured", () => ({
  BackendNotConfigured: ({ onRetry }: { onRetry: () => void }) => (
    <button type="button" onClick={onRetry}>
      retry health
    </button>
  ),
}));

vi.mock("#/components/features/automations/delete-confirmation-modal", () => ({
  DeleteConfirmationModal: ({
    automationName,
    isOpen,
    onConfirm,
    onCancel,
  }: {
    automationName: string;
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    isOpen ? (
      <div data-testid="delete-modal">
        <span>{automationName}</span>
        <button type="button" onClick={onConfirm}>
          confirm delete
        </button>
        <button type="button" onClick={onCancel}>
          cancel delete
        </button>
      </div>
    ) : null,
}));

vi.mock(
  "#/components/features/automations/detail/edit-automation-modal",
  () => ({
    EditAutomationModal: ({
      automation,
      isOpen,
      onClose,
    }: {
      automation: Automation;
      isOpen: boolean;
      onClose: () => void;
    }) => (
      <div data-testid="edit-modal-mounted">
        {isOpen && (
          <button type="button" onClick={onClose}>
            close edit for {automation.name}
          </button>
        )}
      </div>
    ),
  }),
);

interface HealthState {
  data: AutomationHealthResponse | undefined;
  isLoading: boolean;
  refetch: () => void;
}

interface DetailState {
  data: Automation | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

interface RenderOptions {
  automation?: Partial<Automation>;
  health?: Partial<HealthState>;
  detail?: Partial<DetailState>;
  backend?: Backend;
  automationId?: string;
  omitAutomationId?: boolean;
  isDispatchPending?: boolean;
  omitNavigate?: boolean;
}

interface DeleteMutationOptions {
  onSuccess: () => void;
}

interface DispatchMutationOptions {
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "automation-42",
    name: "Nightly review",
    prompt: "Review open pull requests",
    trigger: {
      type: "schedule",
      schedule: "0 2 * * *",
      schedule_human: "Nightly",
      timezone: "America/Chicago",
    },
    enabled: true,
    repository: "OpenHands/agent-canvas",
    model: "review-profile",
    created_at: "2026-07-01T02:00:00Z",
    updated_at: "2026-07-02T02:00:00Z",
    branch: "main",
    plugins: ["github"],
    notification: "slack",
    timezone: "America/Chicago",
    last_triggered_at: "2026-07-12T02:00:00Z",
    ...overrides,
  };
}

function makeBackend(kind: BackendKind = "local"): Backend {
  return {
    id: `${kind}-backend`,
    name: kind === "local" ? "Local" : "Cloud",
    host: kind === "local" ? "http://localhost:8000" : "https://cloud.test",
    apiKey: `${kind}-key`,
    kind,
  };
}

function renderRoute(options: RenderOptions = {}) {
  vi.clearAllMocks();
  const automation = makeAutomation(options.automation);
  const health: HealthState = {
    data: { status: "ok" },
    isLoading: false,
    refetch: mocks.refetchHealth,
    ...options.health,
  };
  const detail: DetailState = {
    data: automation,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mocks.refetchDetail,
    ...options.detail,
  };
  const active: ResolvedActiveBackend = {
    backend: options.backend ?? makeBackend(),
    orgId: null,
  };

  mocks.useParams.mockReturnValue(
    options.omitAutomationId
      ? {}
      : { automationId: options.automationId ?? automation.id },
  );
  mocks.useAutomationHealth.mockReturnValue(health);
  mocks.useAutomationDetail.mockReturnValue(detail);
  mocks.useActiveBackend.mockReturnValue(active);
  mocks.useNavigation.mockReturnValue({
    navigate: options.omitNavigate ? undefined : mocks.navigate,
  });
  mocks.useTracking.mockReturnValue({
    trackPrebuiltAutomationEnabled: mocks.trackEnabled,
    trackAutomationExported: mocks.trackExported,
  });
  mocks.useToggleAutomation.mockReturnValue({ mutate: mocks.toggle });
  mocks.useDeleteAutomation.mockReturnValue({
    mutate: mocks.deleteAutomation,
  });
  mocks.useDispatchAutomation.mockReturnValue({
    mutate: mocks.dispatch,
    isPending: options.isDispatchPending ?? false,
  });
  mocks.serializeAutomation.mockReturnValue({
    version: 1,
    kind: "automation",
    spec: { name: automation.name },
  });
  mocks.getAutomationExportFilename.mockReturnValue("nightly-review.json");

  return {
    automation,
    user: userEvent.setup(),
    ...render(<AutomationDetail />),
  };
}

function makeAxiosError({
  message = "request failed",
  status,
  data,
}: {
  message?: string;
  status?: number;
  data?: unknown;
}) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response:
      status === undefined && data === undefined ? undefined : { status, data },
  });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}

describe("AutomationDetail route behavior", () => {
  it("keeps the detail query disabled while health is loading", () => {
    renderRoute({ health: { data: undefined, isLoading: true } });

    expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
    expect(mocks.useAutomationDetail).toHaveBeenCalledWith({
      id: "automation-42",
      enabled: false,
    });
  });

  it("offers a health retry and uses an empty id when the route parameter is absent", async () => {
    const { user } = renderRoute({
      omitAutomationId: true,
      health: { data: { status: "error", message: "offline" } },
    });

    await user.click(screen.getByRole("button", { name: "retry health" }));

    expect(mocks.refetchHealth).toHaveBeenCalledOnce();
    expect(mocks.useAutomationDetail).toHaveBeenCalledWith({
      id: "",
      enabled: false,
    });
  });

  it("shows a skeleton while a healthy backend loads the automation", () => {
    renderRoute({ detail: { isLoading: true, data: undefined } });

    expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
    expect(mocks.useAutomationDetail).toHaveBeenCalledWith({
      id: "automation-42",
      enabled: true,
    });
  });

  it("shows the not-found state only for an HTTP 404", () => {
    renderRoute({
      detail: {
        data: undefined,
        isError: true,
        error: makeAxiosError({ status: 404 }),
      },
    });

    expect(screen.getByTestId("not-found-state")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "retry detail" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["a plain failure", new Error("plain failure")],
    ["a non-404 HTTP failure", makeAxiosError({ status: 503 })],
    ["an HTTP failure without a response", makeAxiosError({})],
  ])("offers a detail retry for %s", async (_label, error) => {
    const { user } = renderRoute({
      detail: { data: undefined, isError: true, error },
    });

    await user.click(screen.getByRole("button", { name: "retry detail" }));

    expect(mocks.refetchDetail).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("not-found-state")).not.toBeInTheDocument();
  });

  it("treats an empty successful response as a retryable detail error", async () => {
    const { user } = renderRoute({ detail: { data: undefined } });

    await user.click(screen.getByRole("button", { name: "retry detail" }));

    expect(mocks.refetchDetail).toHaveBeenCalledOnce();
  });

  it("disables the detail query if the active backend changes after mount", () => {
    const { rerender } = renderRoute();
    mocks.useActiveBackend.mockReturnValue({
      backend: makeBackend("cloud"),
      orgId: null,
    });

    rerender(<AutomationDetail />);

    expect(mocks.useAutomationDetail).toHaveBeenLastCalledWith({
      id: "automation-42",
      enabled: false,
    });
  });

  it("renders optional content and opens and closes local edit controls", async () => {
    const { user } = renderRoute({ isDispatchPending: true });

    expect(screen.getByTestId("prompt-section")).toHaveTextContent(
      "Review open pull requests",
    );
    expect(screen.getByTestId("plugins-section")).toHaveTextContent("github");
    expect(screen.getByTestId("configuration-section")).toHaveTextContent(
      "automation-42",
    );
    expect(screen.getByTestId("activity-section")).toHaveTextContent(
      "2026-07-01T02:00:00Z:2026-07-12T02:00:00Z",
    );
    expect(screen.getByTestId("activity-log-section")).toHaveTextContent(
      "automation-42",
    );
    expect(screen.getByTestId("run-pending")).toHaveTextContent("true");

    await user.click(screen.getByRole("button", { name: "edit automation" }));
    const closeEdit = screen.getByRole("button", {
      name: "close edit for Nightly review",
    });
    expect(closeEdit).toBeInTheDocument();
    await user.click(closeEdit);

    expect(
      screen.queryByRole("button", {
        name: "close edit for Nightly review",
      }),
    ).not.toBeInTheDocument();
  });

  it("omits local-only and absent optional content for cloud automations", () => {
    renderRoute({
      backend: makeBackend("cloud"),
      automation: { prompt: null, plugins: undefined, last_triggered_at: null },
    });

    expect(screen.queryByTestId("prompt-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plugins-section")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "edit automation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("edit-modal-mounted")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-section")).toHaveTextContent("never");
    expect(screen.getByTestId("run-pending")).toHaveTextContent("false");
  });

  it("does not render the plugins section for an empty plugin list", () => {
    renderRoute({ automation: { plugins: [] } });

    expect(screen.queryByTestId("plugins-section")).not.toBeInTheDocument();
  });

  it("turns an enabled automation off without recording an enable event", async () => {
    const { user, automation } = renderRoute();

    await user.click(screen.getByRole("button", { name: "toggle automation" }));

    expect(mocks.toggle).toHaveBeenCalledWith({
      id: automation.id,
      enabled: false,
    });
    expect(mocks.trackEnabled).not.toHaveBeenCalled();
  });

  it("turns a disabled automation on and records the enable event", async () => {
    const { user, automation } = renderRoute({
      automation: { enabled: false },
    });

    await user.click(screen.getByRole("button", { name: "toggle automation" }));

    expect(mocks.toggle).toHaveBeenCalledWith({
      id: automation.id,
      enabled: true,
    });
    expect(mocks.trackEnabled).toHaveBeenCalledWith({
      automationId: automation.id,
      automationName: automation.name,
    });
  });

  it("cancels deletion without mutating, then deletes and navigates on success", async () => {
    const { user, automation } = renderRoute();
    const openDelete = screen.getByRole("button", {
      name: "delete automation",
    });

    await user.click(openDelete);
    expect(screen.getByTestId("delete-modal")).toHaveTextContent(
      automation.name,
    );
    await user.click(screen.getByRole("button", { name: "cancel delete" }));
    expect(screen.queryByTestId("delete-modal")).not.toBeInTheDocument();
    expect(mocks.deleteAutomation).not.toHaveBeenCalled();

    await user.click(openDelete);
    await user.click(screen.getByRole("button", { name: "confirm delete" }));

    expect(mocks.deleteAutomation).toHaveBeenCalledWith(
      automation.id,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    const options = mocks.deleteAutomation.mock.calls[0][1] as
      | DeleteMutationOptions
      | undefined;
    expect(options).toBeDefined();
    options?.onSuccess();
    expect(mocks.navigate).toHaveBeenCalledWith("/automations");
  });

  it("allows deletion success when navigation is unavailable", async () => {
    const { user } = renderRoute({ omitNavigate: true });

    await user.click(screen.getByRole("button", { name: "delete automation" }));
    await user.click(screen.getByRole("button", { name: "confirm delete" }));

    const options = mocks.deleteAutomation.mock.calls[0][1] as
      | DeleteMutationOptions
      | undefined;
    expect(() => options?.onSuccess()).not.toThrow();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("shows success feedback after dispatching the automation", async () => {
    const { user, automation } = renderRoute();

    await user.click(screen.getByRole("button", { name: "run automation" }));

    expect(mocks.dispatch).toHaveBeenCalledWith(
      automation.id,
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    const options = mocks.dispatch.mock.calls[0][1] as
      | DispatchMutationOptions
      | undefined;
    options?.onSuccess();
    expect(mocks.displaySuccessToast).toHaveBeenCalledWith(
      I18nKey.AUTOMATIONS$RUN_NOW_SUCCESS,
    );
  });

  it.each([
    [
      "the API response message",
      makeAxiosError({
        message: "transport detail",
        status: 422,
        data: { message: "automation rejected" },
      }),
      "automation rejected",
    ],
    [
      "the Axios message when response data is absent",
      makeAxiosError({ message: "network unavailable", status: 503 }),
      "network unavailable",
    ],
    [
      "the translated fallback for an empty Axios error",
      makeAxiosError({ message: "", status: 500, data: {} }),
      I18nKey.AUTOMATIONS$RUN_NOW_ERROR,
    ],
    [
      "a plain error message",
      new Error("dispatch crashed"),
      "dispatch crashed",
    ],
    [
      "the translated fallback for an empty plain error",
      new Error(""),
      I18nKey.AUTOMATIONS$RUN_NOW_ERROR,
    ],
  ])("shows %s when dispatch fails", async (_label, error, expectedMessage) => {
    const { user } = renderRoute();
    await user.click(screen.getByRole("button", { name: "run automation" }));
    const options = mocks.dispatch.mock.calls[0][1] as
      | DispatchMutationOptions
      | undefined;

    options?.onError(error);

    expect(mocks.displayErrorToast).toHaveBeenCalledWith(expectedMessage);
  });

  it("exports formatted JSON and records the active backend kind", async () => {
    const { user, automation } = renderRoute();

    await user.click(screen.getByRole("button", { name: "export automation" }));

    expect(mocks.serializeAutomation).toHaveBeenCalledWith(automation);
    expect(mocks.getAutomationExportFilename).toHaveBeenCalledWith(automation);
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "nightly-review.json",
    );
    const blob = mocks.downloadBlob.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(await readBlob(blob)).toBe(
      `${JSON.stringify(
        {
          version: 1,
          kind: "automation",
          spec: { name: automation.name },
        },
        null,
        2,
      )}\n`,
    );
    expect(mocks.trackExported).toHaveBeenCalledWith({
      backendKind: "local",
    });
  });

  it("downloads a tarball for the displayed automation", async () => {
    const { user, automation } = renderRoute();

    await user.click(screen.getByRole("button", { name: "download tarball" }));

    expect(mocks.downloadTarball).toHaveBeenCalledWith(
      automation.id,
      automation.name,
    );
  });
});
