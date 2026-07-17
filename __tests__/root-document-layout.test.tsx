import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Layout } from "#/root";

// The React Router document primitives (<Meta>, <Links>, <ScrollRestoration>,
// <Scripts>) read from the framework context that a bare render() does not
// provide. Stub them to no-ops while spreading the real module (and keeping the
// setup file's useRevalidator override) so everything else stays intact.
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  Meta: () => null,
  Links: () => null,
  ScrollRestoration: () => null,
  Scripts: () => null,
  useRevalidator: () => ({ revalidate: vi.fn() }),
}));

// AgentServerUIRoot pulls in the full provider stack; render its children
// directly so the test asserts <Layout>'s own composition in isolation.
vi.mock("#/components/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/components/providers")>()),
  AgentServerUIRoot: ({ children }: { children: ReactNode }) => (
    <div data-testid="agent-server-ui-root">{children}</div>
  ),
}));

// Replace the telemetry banner with a gate-free sentinel. Its real
// implementation self-suppresses in the test environment (its i18n-ready and
// consent gates never open), so asserting the real form's absence would pass
// vacuously. The sentinel renders whenever <Layout> mounts the banner, making
// this a true regression guard: it rendered before this change and must not
// render after.
vi.mock("#/components/features/analytics/telemetry-consent-banner", () => ({
  TelemetryConsentBanner: () => (
    <div data-testid="telemetry-consent-banner-sentinel" />
  ),
}));

describe("root document Layout", () => {
  it("does not mount the telemetry consent banner", () => {
    // Arrange & Act
    render(
      <Layout>
        <div data-testid="layout-child" />
      </Layout>,
    );

    // Assert — the layout renders its routed children, but the telemetry
    // consent banner is no longer part of the root render tree: it was removed
    // from onboarding so telemetry opt-out lives only in settings.
    expect(screen.getByTestId("layout-child")).toBeInTheDocument();
    expect(
      screen.queryByTestId("telemetry-consent-banner-sentinel"),
    ).not.toBeInTheDocument();
  });
});
