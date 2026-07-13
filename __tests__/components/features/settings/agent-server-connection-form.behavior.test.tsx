import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetActiveStoreForTests,
  getRegisteredBackends,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import {
  DEFAULT_LOCAL_BACKEND_NAME,
  SEEDED_DEFAULT_BACKEND_ID,
} from "#/api/backend-registry/default-backend";
import type { Backend } from "#/api/backend-registry/types";
import { AgentServerConnectionForm } from "#/components/features/settings/agent-server-onboarding";
import { I18nKey } from "#/i18n/declaration";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: (namespace: string) => ({
    t: (key: string) => `${namespace}:${key}`,
    i18n: {
      language: "en",
      exists: () => false,
    },
  }),
}));

const ORIGINAL_LOCATION = window.location;
const assignMock = vi.fn();

function translated(key: I18nKey): string {
  return `openhands:${key}`;
}

function getBackend(overrides: Partial<Backend> = {}): Backend {
  return {
    id: "team-cloud",
    name: "Team Cloud",
    host: "https://cloud.example.com",
    apiKey: "cloud-key",
    kind: "cloud",
    ...overrides,
  };
}

function renderConnectionForm(
  props: React.ComponentProps<typeof AgentServerConnectionForm> = {},
) {
  render(<AgentServerConnectionForm {...props} />);

  return {
    form: screen.getByTestId("agent-server-connection-form"),
    hostInput: screen.getByTestId("agent-server-url-input"),
    keyInput: screen.getByTestId("agent-server-api-key-input"),
    retryButton: screen.getByTestId("retry-connection-button"),
    submitButton: screen.getByTestId("submit-button"),
  };
}

beforeEach(() => {
  vi.stubEnv("VITE_BACKEND_BASE_URL", "https://default.example.dev/");
  vi.stubEnv("VITE_SESSION_API_KEY", "default-key");
  window.localStorage.clear();
  window.sessionStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([]);
  assignMock.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...ORIGINAL_LOCATION,
      origin: "https://canvas.example.dev",
      protocol: "https:",
      assign: assignMock,
    },
  });
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
  __resetActiveStoreForTests();
});

describe("agent-server connection settings", () => {
  it("shows deployment defaults and reconnects without changing the clean form", async () => {
    const user = userEvent.setup();

    const { form, hostInput, keyInput, retryButton, submitButton } =
      renderConnectionForm();

    expect(form.firstElementChild).toHaveClass(
      "flex",
      "flex-col",
      "gap-5",
      "rounded-3xl",
      "border",
      "p-6",
    );
    expect(form).toHaveClass("flex", "h-full", "flex-col");
    expect(
      screen.getByText(
        translated(I18nKey.SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        translated(
          I18nKey.SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_DESCRIPTION,
        ),
      ),
    ).toBeInTheDocument();
    expect(hostInput).toHaveValue("https://default.example.dev");
    expect(keyInput).toHaveValue("default-key");
    expect(submitButton).toBeDisabled();

    await user.click(retryButton);

    expect(assignMock).toHaveBeenCalledOnce();
    expect(assignMock).toHaveBeenCalledWith("/");
    expect(getRegisteredBackends()).toEqual([]);

    fireEvent.change(keyInput, { target: { value: "rotated-key" } });
    expect(submitButton).toBeEnabled();
  });

  it("registers a trimmed default backend from settings and reconnects", async () => {
    const user = userEvent.setup();

    const { form, hostInput, keyInput, submitButton } = renderConnectionForm({
      className: "outer-layout",
      formClassName: "settings-fields",
      variant: "settings",
    });

    expect(form).toHaveClass("outer-layout");
    expect(form.firstElementChild).toHaveClass("settings-fields");
    expect(form.firstElementChild).not.toHaveClass("rounded-3xl");
    expect(
      screen.queryByText(
        translated(I18nKey.SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE),
      ),
    ).not.toBeInTheDocument();

    await user.clear(hostInput);
    await user.type(hostInput, "  https://new-agent.example.dev/api/  ");
    expect(submitButton).toBeEnabled();
    await user.clear(keyInput);
    await user.type(keyInput, "  new-session-key  ");
    await user.click(submitButton);

    expect(getRegisteredBackends()).toEqual([
      {
        id: SEEDED_DEFAULT_BACKEND_ID,
        name: DEFAULT_LOCAL_BACKEND_NAME,
        host: "https://new-agent.example.dev/api/",
        apiKey: "new-session-key",
        kind: "local",
      },
    ]);
    expect(assignMock).toHaveBeenCalledOnce();
    expect(assignMock).toHaveBeenCalledWith("/");
  });

  it("updates the seeded backend in place without changing its identity or order", async () => {
    const user = userEvent.setup();
    const cloudBackend = getBackend();
    const renamedSeed = getBackend({
      id: SEEDED_DEFAULT_BACKEND_ID,
      name: "Renamed Local",
      host: "http://old-agent.example.dev",
      apiKey: "old-key",
      kind: "local",
    });
    setRegisteredBackends([cloudBackend, renamedSeed]);
    const registryBeforeSubmit = getRegisteredBackends();

    const { form, hostInput, keyInput, submitButton } = renderConnectionForm({
      variant: "settings",
      showSectionHeader: true,
    });

    expect(form.firstElementChild).not.toHaveClass("rounded-3xl");
    expect(
      screen.getByText(
        translated(I18nKey.SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE),
      ),
    ).toBeInTheDocument();

    await user.clear(hostInput);
    await user.type(hostInput, "https://replacement.example.dev");
    await user.clear(keyInput);
    await user.type(keyInput, "replacement-key");
    await user.click(submitButton);

    const updatedRegistry = getRegisteredBackends();
    expect(updatedRegistry).toEqual([
      cloudBackend,
      {
        ...renamedSeed,
        host: "https://replacement.example.dev",
        apiKey: "replacement-key",
      },
    ]);
    expect(updatedRegistry).not.toBe(registryBeforeSubmit);
    expect(registryBeforeSubmit).toEqual([cloudBackend, renamedSeed]);
    expect(assignMock).toHaveBeenCalledOnce();
  });

  it("leaves the registry unchanged when the submitted host is blank", async () => {
    const user = userEvent.setup();
    const cloudBackend = getBackend();
    setRegisteredBackends([cloudBackend]);

    const { form, hostInput, submitButton } = renderConnectionForm({
      showSectionHeader: false,
    });

    expect(form.firstElementChild).toHaveClass("rounded-3xl");
    expect(
      screen.queryByText(
        translated(I18nKey.SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE),
      ),
    ).not.toBeInTheDocument();

    fireEvent.change(hostInput, { target: { value: "   " } });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(getRegisteredBackends()).toEqual([cloudBackend]);
    expect(assignMock).toHaveBeenCalledOnce();
    expect(assignMock).toHaveBeenCalledWith("/");
  });
});
