import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import App from "#/root";
import { server } from "#/mocks/node";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

const TRANSLATIONS: Record<string, string> = {
  BACKEND$MANAGE_TITLE: "Manage backends",
  BACKEND$MANAGE_EMPTY: "No backends yet.",
  BACKEND$ADD: "+ Add Backend",
  BACKEND$KIND_LOCAL: "Local",
  BACKEND$KIND_CLOUD: "Cloud",
  BACKEND$EDIT: "Edit",
  BACKEND$REMOVE: "Remove",
  HOME$DONE: "Done",
  SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE: "Agent server connection",
  SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_DESCRIPTION:
    "Enter connection details.",
  SETTINGS$AGENT_SERVER_URL: "Agent server URL",
  SETTINGS$AGENT_SERVER_URL_PLACEHOLDER: "http://127.0.0.1:8000",
  SETTINGS$AGENT_SERVER_API_KEY: "Session API key",
  SETTINGS$AGENT_SERVER_API_KEY_PLACEHOLDER: "Enter your session API key",
  SETTINGS$AGENT_SERVER_BROWSER_ONLY_NOTE: "Saved in this browser only.",
  SETTINGS$AGENT_SERVER_RETRY_CONNECTION: "Retry connection",
  SETTINGS$SAVE_AND_RECONNECT: "Save and reconnect",
  COMMON$OPTIONAL: "Optional",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      let value = TRANSLATIONS[key] ?? key;
      for (const [optionKey, optionValue] of Object.entries(options ?? {})) {
        value = value.replaceAll(`{{${optionKey}}}`, String(optionValue));
      }
      return value;
    },
  }),
}));

const RouterStub = createRoutesStub([
  {
    Component: App,
    path: "/",
    children: [
      {
        Component: () => <div data-testid="app-outlet">app outlet</div>,
        path: "/",
      },
    ],
  },
]);

const renderApp = (initialEntries: string[] = ["/"]) =>
  render(<RouterStub initialEntries={initialEntries} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });

describe("App root agent-server bootstrap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  it("renders the routed page even when the connected server reports an old version", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.0.0" }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
  });

  it("renders the routed page when the server omits a version field", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0 }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
  });

  it("renders the routed page when the backend is unreachable", async () => {
    let serverInfoRequests = 0;

    server.use(
      http.get("/server_info", () => {
        serverInfoRequests += 1;
        return HttpResponse.error();
      }),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(serverInfoRequests).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
  });

  it("renders the routed page when the backend requires a session API key", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ detail: "Unauthorized" }, { status: 401 }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
  });

  it("renders the routed page when the agent server is reachable", async () => {
    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
  });
});
