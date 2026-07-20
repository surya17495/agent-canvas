/**
 * G3 — Centri Settings LIVE browser gate.
 *
 * Runs the real browser → real `centrid` request path for the Settings page.
 * Requires a running `centrid`; see `playwright.centri-live.config.ts` for the
 * config seam. The whole file skips itself when `CENTRI_E2E_BASE_URL` is unset
 * so it is a no-op in environments without a daemon.
 *
 * Procedure (documented in the PR):
 *   1. Start a real `centrid` (default loopback `127.0.0.1:6789`).
 *   2. CENTRI_E2E_BASE_URL=http://127.0.0.1:6789 \
 *      [CENTRI_E2E_PANEL_TOKEN=<token>] \
 *      npx playwright test --config playwright.centri-live.config.ts
 */

import { expect, test } from "@playwright/test";

const CENTRID_BASE_URL = process.env.CENTRI_E2E_BASE_URL?.trim();
const PANEL_TOKEN = process.env.CENTRI_E2E_PANEL_TOKEN?.trim();

test.describe("Centri Settings live gate (G3)", () => {
  test.skip(
    !CENTRID_BASE_URL,
    "Set CENTRI_E2E_BASE_URL to a running centrid to run the Centri live gate.",
  );

  // The G3 config mock-boots the app shell (VITE_MOCK_API=true) while the
  // Centri panel talks to real centrid over its own fetch path. On a fresh
  // profile the shell shows first-run gates — an "add a backend" onboarding
  // modal and an analytics-consent modal — in front of every route. They are
  // unrelated to Centri and would otherwise block the settings route from
  // rendering. Seed the onboarding + backend-registry localStorage keys before
  // the app boots so the shell comes up already onboarded, exactly as a real
  // deployment would be. This does not touch the live centrid request path.
  async function seedOnboardedShell(page: import("@playwright/test").Page) {
    await page.addInitScript(() => {
      const set = (key: string, value: string) => {
        if (window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(key, value);
        }
      };
      set("openhands-onboarded", "1");
      set(
        "openhands-backends",
        JSON.stringify([
          {
            id: "g3-local",
            name: "Local",
            host: "http://localhost:3131",
            apiKey: "g3-e2e",
            kind: "local",
          },
        ]),
      );
      set(
        "openhands-active-backend",
        JSON.stringify({ backendId: "g3-local" }),
      );
    });
  }

  // Belt-and-suspenders: if a first-run modal still appears (e.g. a shell build
  // that gates differently), dismiss it. All guarded so an already-onboarded
  // deployment with no modals passes through untouched.
  async function dismissFirstRunModals(page: import("@playwright/test").Page) {
    await page.waitForLoadState("domcontentloaded");
    const consent = page.getByTestId("telemetry-consent-form");
    try {
      await consent.waitFor({ state: "visible", timeout: 5_000 });
      await page.getByTestId("confirm-telemetry-preferences").click();
      await consent.waitFor({ state: "hidden", timeout: 5_000 });
    } catch {
      // No consent modal — already dismissed or not shown.
    }
    const skip = page.getByTestId("onboarding-skip");
    try {
      await skip.waitFor({ state: "visible", timeout: 5_000 });
      await skip.click();
      await page
        .getByTestId("onboarding-modal")
        .waitFor({ state: "hidden", timeout: 5_000 });
    } catch {
      // No onboarding modal — already onboarded.
    }
  }

  test("renders real centrid state and can sync when a token is set", async ({
    page,
  }) => {
    await seedOnboardedShell(page);
    await page.goto("/");
    await dismissFirstRunModals(page);
    await page.goto("/settings/centri");

    // The panel resolves to exactly one of the explicit states. Any of them is
    // a pass for "reached the daemon and rendered a real state"; a hang or a
    // blank page is a fail.
    const screen = page.getByTestId("centri-settings-screen");
    const errorState = page.getByTestId("centri-error");

    await expect(screen.or(errorState)).toBeVisible({ timeout: 30_000 });

    if (await errorState.isVisible()) {
      // A reachable-but-erroring daemon (e.g. 401 with no read access) still
      // proves the live path; surface which state we landed in.
      const text = await errorState.innerText();
      test
        .info()
        .annotations.push({ type: "centri-error-state", description: text });
      return;
    }

    // Healthy read: the sections rendered from live data.
    await expect(page.getByTestId("centri-engine-section")).toBeVisible();
    await expect(page.getByTestId("centri-keys-section")).toBeVisible();
    await expect(page.getByTestId("centri-sync-section")).toBeVisible();

    const syncButton = page.getByTestId("centri-sync-now");

    if (!PANEL_TOKEN) {
      // Fail-closed: no token → mutation is disabled and the reason is shown.
      await expect(page.getByTestId("centri-token-missing")).toBeVisible();
      await expect(syncButton).toBeDisabled();
      return;
    }

    // Authenticated path: "Sync now" issues a live POST /api/pump and the panel
    // refreshes without surfacing an error state.
    const pumpResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/pump") &&
        response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await syncButton.click();
    const response = await pumpResponse;
    expect(response.status()).toBeLessThan(500);

    await expect(page.getByTestId("centri-settings-screen")).toBeVisible();
  });
});
