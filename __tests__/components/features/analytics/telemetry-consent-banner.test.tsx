import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelemetryConsentBanner } from "#/components/features/analytics/telemetry-consent-banner";

const mocks = vi.hoisted(() => ({
  ready: false,
  showConsentPrompt: false,
  useTranslation: vi.fn<(namespace: string) => void>(),
  translate: vi.fn<(key: string) => string>(),
  grantConsent: vi.fn<() => void>(),
  denyConsent: vi.fn<() => void>(),
}));

const translations: Record<string, string> = {
  TELEMETRY$CONSENT_TITLE: "Help improve OpenHands",
  TELEMETRY$CONSENT_DESCRIPTION:
    "We collect anonymous usage data to improve the product.",
  TELEMETRY$SEND_ANONYMOUS_DATA: "Send anonymous usage data",
  TELEMETRY$CONFIRM_PREFERENCES: "Confirm preferences",
};

vi.mock("react-i18next", () => ({
  useTranslation: (namespace: string) => {
    mocks.useTranslation(namespace);
    return { t: mocks.translate, ready: mocks.ready };
  },
}));

vi.mock("#/hooks/use-telemetry", () => ({
  useTelemetry: () => ({
    showConsentPrompt: mocks.showConsentPrompt,
    grantConsent: mocks.grantConsent,
    denyConsent: mocks.denyConsent,
  }),
}));

interface RenderBannerOptions {
  ready?: boolean;
  showConsentPrompt?: boolean;
  onChoice?: (granted: boolean) => void;
}

function renderBanner({
  ready = true,
  showConsentPrompt = true,
  onChoice,
}: RenderBannerOptions = {}) {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.ready = ready;
  mocks.showConsentPrompt = showConsentPrompt;
  mocks.translate.mockImplementation(
    (key) => translations[key] ?? `Missing translation: ${key}`,
  );

  return render(<TelemetryConsentBanner onChoice={onChoice} />);
}

function advanceBy(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function submit(form: HTMLFormElement) {
  const event = new Event("submit", { bubbles: true, cancelable: true });
  act(() => {
    form.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("telemetry consent", () => {
  it("stays hidden when either translations or the consent prompt are unavailable", () => {
    const { rerender } = renderBanner({
      ready: false,
      showConsentPrompt: true,
    });

    advanceBy(50);
    expect(
      screen.queryByTestId("telemetry-consent-form"),
    ).not.toBeInTheDocument();

    mocks.ready = true;
    mocks.showConsentPrompt = false;
    rerender(<TelemetryConsentBanner />);
    advanceBy(50);

    expect(
      screen.queryByTestId("telemetry-consent-form"),
    ).not.toBeInTheDocument();
  });

  it("waits exactly 50 ms, then renders accessible translated preferences", () => {
    renderBanner();

    expect(
      screen.queryByTestId("telemetry-consent-form"),
    ).not.toBeInTheDocument();
    advanceBy(49);
    expect(
      screen.queryByTestId("telemetry-consent-form"),
    ).not.toBeInTheDocument();

    advanceBy(1);

    const dialog = screen.getByRole("dialog", {
      name: "Help improve OpenHands",
    });
    expect(dialog).toHaveClass("z-[70]");
    expect(
      screen.getByText(
        "We collect anonymous usage data to improve the product.",
      ),
    ).toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox", {
      name: "Send anonymous usage data",
    });
    expect(checkbox).toHaveAttribute("name", "analytics");
    expect(checkbox).toHaveAttribute("type", "checkbox");
    expect(checkbox).toBeChecked();

    const confirm = screen.getByRole("button", {
      name: "Confirm preferences",
    });
    expect(confirm).toHaveAttribute("type", "submit");
    expect(mocks.useTranslation).toHaveBeenCalledWith("openhands");
    expect(mocks.grantConsent).not.toHaveBeenCalled();
    expect(mocks.denyConsent).not.toHaveBeenCalled();
  });

  it("cancels a pending reveal and hides a visible prompt when consent is no longer requested", () => {
    const { rerender } = renderBanner();

    advanceBy(49);
    mocks.showConsentPrompt = false;
    rerender(<TelemetryConsentBanner />);
    advanceBy(1);
    expect(
      screen.queryByTestId("telemetry-consent-form"),
    ).not.toBeInTheDocument();

    mocks.showConsentPrompt = true;
    rerender(<TelemetryConsentBanner />);
    advanceBy(50);
    expect(screen.getByTestId("telemetry-consent-form")).toBeInTheDocument();

    mocks.showConsentPrompt = false;
    rerender(<TelemetryConsentBanner />);
    expect(
      screen.queryByTestId("telemetry-consent-form"),
    ).not.toBeInTheDocument();
  });

  it("grants the default checked preference and reports the choice", () => {
    const onChoice = vi.fn<(granted: boolean) => void>();
    renderBanner({ onChoice });
    advanceBy(50);

    const event = submit(screen.getByTestId("telemetry-consent-form"));

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.grantConsent).toHaveBeenCalledOnce();
    expect(mocks.denyConsent).not.toHaveBeenCalled();
    expect(onChoice).toHaveBeenCalledOnce();
    expect(onChoice).toHaveBeenCalledWith(true);
  });

  it("denies an unchecked preference and reports the choice", () => {
    const onChoice = vi.fn<(granted: boolean) => void>();
    renderBanner({ onChoice });
    advanceBy(50);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Send anonymous usage data" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Send anonymous usage data" }),
    ).not.toBeChecked();

    const event = submit(screen.getByTestId("telemetry-consent-form"));

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.denyConsent).toHaveBeenCalledOnce();
    expect(mocks.grantConsent).not.toHaveBeenCalled();
    expect(onChoice).toHaveBeenCalledOnce();
    expect(onChoice).toHaveBeenCalledWith(false);
  });

  it("accepts safely when no choice callback is provided", () => {
    const errors: unknown[] = [];
    const handleWindowError = (event: ErrorEvent) => {
      event.preventDefault();
      errors.push(event.error);
    };
    window.addEventListener("error", handleWindowError);
    renderBanner();
    advanceBy(50);

    try {
      const event = submit(screen.getByTestId("telemetry-consent-form"));

      expect(event.defaultPrevented).toBe(true);
      expect(errors).toEqual([]);
      expect(mocks.grantConsent).toHaveBeenCalledOnce();
      expect(mocks.denyConsent).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("error", handleWindowError);
    }
  });
});
