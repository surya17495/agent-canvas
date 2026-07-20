/**
 * Playwright config for the Centri Settings **live** gate (G3).
 *
 * Unlike the mock-LLM / live stacks, this config does NOT boot an
 * agent-server. It serves the frontend in mock-API mode (so the surrounding
 * app boots without real credentials) while pointing the Centri config seam
 * at a **real** `centrid` daemon supplied by the operator:
 *
 *   - `CENTRI_E2E_BASE_URL`      → base URL of a running `centrid` (required;
 *                                   the single spec skips itself when unset).
 *   - `CENTRI_E2E_PANEL_TOKEN`   → optional panel token; when present the gate
 *                                   also exercises the authenticated "Sync now"
 *                                   mutation. When absent, the gate asserts the
 *                                   fail-closed (token-missing) state instead.
 *
 * These map onto the same seam the app reads in production
 * (`VITE_CENTRID_BASE_URL` / `VITE_CENTRI_PANEL_TOKEN`, see
 * `src/api/centri/centri-config.ts`). This keeps the Centri request path
 * genuinely live end-to-end (browser → centrid) even though the rest of the
 * app is mocked.
 */

import { defineConfig, devices } from "@playwright/test";

const CENTRI_E2E_FRONTEND_PORT = process.env.CENTRI_E2E_FRONTEND_PORT ?? "3131";
const FRONTEND_URL = `http://localhost:${CENTRI_E2E_FRONTEND_PORT}/`;

const CENTRID_BASE_URL = process.env.CENTRI_E2E_BASE_URL ?? "";
const PANEL_TOKEN = process.env.CENTRI_E2E_PANEL_TOKEN ?? "";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function envAssignment(name: string, value: string) {
  return `${name}=${shellQuote(value)}`;
}

export default defineConfig({
  testDir: "./tests/e2e/centri-live",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results-centri-live/results.json" }],
    ["html", { outputFolder: "playwright-report-centri-live", open: "never" }],
  ],
  outputDir: "test-results-centri-live",
  use: {
    baseURL: FRONTEND_URL,
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // `dev:mock` boots the frontend with MSW enabled (VITE_MOCK_API=true) so
    // the surrounding app shell is healthy without a real agent-server. The
    // Centri panel still reaches the real `centrid` via its own fetch path
    // (VITE_CENTRID_BASE_URL). NOTE: `dev:frontend` hardcodes
    // VITE_MOCK_API=false via cross-env and cannot be used here.
    command: [
      envAssignment("VITE_CENTRID_BASE_URL", CENTRID_BASE_URL),
      envAssignment("VITE_CENTRI_PANEL_TOKEN", PANEL_TOKEN),
      envAssignment("VITE_FRONTEND_PORT", CENTRI_E2E_FRONTEND_PORT),
      "npm run dev:mock",
    ].join(" "),
    url: FRONTEND_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
