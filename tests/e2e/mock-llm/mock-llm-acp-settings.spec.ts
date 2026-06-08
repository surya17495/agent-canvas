/**
 * Mock-LLM E2E tests for ACP Settings → Agent single-save + auth banner.
 *
 * Covers the changes from PR #1251:
 *   1. Only ONE "Save Changes" button on the Settings → Agent page (no
 *      separate credentials-only save).
 *   2. Credential fields render for built-in ACP providers.
 *   3. Saving both agent spec + credential in one click persists both.
 *   4. The credentials section renders only for built-in providers (not
 *      for "Custom" preset).
 *
 * These tests exercise the real agent-server settings API, same as the
 * existing ACP agent spec (mock-llm-acp-agent.spec.ts). They focus on
 * the settings form UX — not a full conversation round-trip.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  selectDropdownOption,
  ensureMockLLMProfile,
  resetToOpenHandsAgentViaUI,
  resetMockLLM,
  BACKEND_URL,
  SESSION_API_KEY,
} from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });

// ── Helpers ───────────────────────────────────────────────────────────

/** Navigate to Settings → Agent and wait for the form to render. */
async function navigateToAgentSettings(page: Page) {
  await routeSessionApiKey(page);
  await page.goto("/settings/agent", { waitUntil: "domcontentloaded" });
  await dismissAnalyticsModal(page);
  await waitForTestId(page, "agent-settings-screen");
}

/** Switch the agent type to ACP and select a preset. */
async function selectAcpPreset(page: Page, preset: RegExp) {
  await selectDropdownOption(page, /Agent/, /ACP/);
  await waitForTestId(page, "agent-preset-selector");
  await selectDropdownOption(page, /Preset/, preset);
}

/** Locator for all credential secret fields. */
function credentialFields(page: Page) {
  return page.locator('[data-testid^="settings-acp-secret-"]');
}

// ── Tests ─────────────────────────────────────────────────────────────

test.describe("ACP settings: single save + auth banner", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterAll(async ({ request, browser }) => {
    const page = await browser.newPage();
    try {
      await seedLocalStorage(page);
      await resetToOpenHandsAgentViaUI(page);
      await ensureMockLLMProfile(page);
    } catch {
      // best-effort
    } finally {
      await page.close();
    }
    try {
      await resetMockLLM(request);
    } catch {
      // best-effort
    }
  });

  // ── 1. Only one Save button on the page ─────────────────────────────

  test("renders a single Save button when ACP provider is selected", async ({
    page,
  }) => {
    await ensureMockLLMProfile(page);
    await navigateToAgentSettings(page);
    await selectAcpPreset(page, /Codex/);

    await expect(page.getByTestId("agent-save-button")).toHaveCount(1);
    await expect(page.getByTestId("acp-credentials-save")).not.toBeVisible({
      timeout: 2_000,
    });
  });

  // ── 2. Credentials section renders for built-in ACP providers ───────

  test("shows credential fields for built-in ACP providers", async ({
    page,
  }) => {
    await ensureMockLLMProfile(page);
    await navigateToAgentSettings(page);
    await selectAcpPreset(page, /Codex/);

    // Credential fields render synchronously once the preset is selected,
    // so a short timeout is sufficient here.
    const fields = credentialFields(page);
    await expect(fields.first()).toBeVisible({ timeout: 5_000 });
    expect(await fields.count()).toBeGreaterThanOrEqual(1);
  });

  // ── 3. Credentials section hidden for Custom preset ─────────────────

  test("hides credentials section for Custom preset", async ({ page }) => {
    await ensureMockLLMProfile(page);
    await navigateToAgentSettings(page);
    await selectAcpPreset(page, /Custom/);

    await expect(page.getByTestId("agent-command-input")).toBeVisible({
      timeout: 5_000,
    });

    await expect(credentialFields(page)).toHaveCount(0, { timeout: 2_000 });

    const authBanner = page
      .getByTestId("settings-acp-auth-detected")
      .or(page.getByTestId("settings-acp-auth-checking"));
    await expect(authBanner).not.toBeVisible({ timeout: 2_000 });
  });

  // ── 4. Single save persists credential when both spec and cred are dirty ──

  test("single Save persists ACP credential alongside agent spec", async ({
    page,
    request,
  }) => {
    await ensureMockLLMProfile(page);
    await navigateToAgentSettings(page);
    await selectAcpPreset(page, /Codex/);

    // Fill the first credential field (Codex exposes CODEX_AUTH_JSON).
    const fields = credentialFields(page);
    await expect(fields.first()).toBeVisible({ timeout: 5_000 });
    await fields.first().click();
    await fields.first().fill("test-credential-value-e2e");

    const saveBtn = page.getByTestId("agent-save-button");
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();
    await expect(saveBtn).toBeDisabled({ timeout: 15_000 });

    // Verify the credential was persisted via the secrets API
    const secretsResp = await request.get(
      `${BACKEND_URL}/api/settings/secrets`,
      { headers: { "X-Session-API-Key": SESSION_API_KEY } },
    );
    expect(secretsResp.ok()).toBe(true);
    const body = (await secretsResp.json()) as {
      secrets: { name: string; description?: string }[];
    };
    expect(body.secrets.length).toBeGreaterThanOrEqual(1);
  });

  // ── 5. Save button disabled when no changes ─────────────────────────

  test("Save button is disabled when no changes have been made", async ({
    page,
  }) => {
    await navigateToAgentSettings(page);

    const saveBtn = page.getByTestId("agent-save-button");
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await expect(saveBtn).toBeDisabled({ timeout: 5_000 });
  });
});
