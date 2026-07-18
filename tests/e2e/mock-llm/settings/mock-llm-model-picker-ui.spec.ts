/**
 * Mock-LLM E2E test: the in-conversation LLM model-picker UI (the pill).
 *
 * The `/model` slash command is already covered by mock-llm-model-switch.spec.ts.
 * This spec exercises the *pill picker UI* end-to-end — the surface built for the
 * Centri model-picker vertical slice (LlmModelPickerMenu):
 *
 *   1. Setup: activate a mock LLM profile (A) and create a second profile (B)
 *      as the switch target, then register a text-reply trajectory.
 *   2. Open the picker pill and verify it renders the real profile list with the
 *      current profile marked selected (aria-selected) — no hardcoded models.
 *   3. Click profile B in the picker and verify the switch goes through the real
 *      contract: POST /api/conversations/{id}/switch_llm carrying B's model, plus
 *      the "Switched to profile" confirmation in the chat log.
 *
 * All backend-shaped inputs come from the real agent-server (profiles API +
 * switch_llm), never fixtures — fixtures are reserved for the component tests.
 */

import { test, expect } from "@playwright/test";
import {
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  waitForPath,
  getConversationIdFromURL,
  waitForNonUserMessageText,
  deleteConversation,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  ensureMockLLMProfile,
  createProfileViaUI,
  deleteProfileIfExists,
  setChatInput,
} from "../utils/mock-llm-helpers";

/** Profile B is the switch target — created via the Settings UI. */
const PROFILE_B_NAME = "picker-ui-profile-b";
const MODEL_B = "openai/mock-model-picker-beta";

const INITIAL_REPLY_TOKEN = "PICKER_UI_INITIAL_REPLY_OK";

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM model-picker pill UI", () => {
  const conversationIds = new Set<string>();

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ request }) => {
    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
        conversationIds.delete(id);
      } catch {
        // best-effort cleanup
      }
    }
  });

  test.afterAll(async ({ request, browser }) => {
    const page = await browser.newPage();
    try {
      await seedLocalStorage(page);
      await routeSessionApiKey(page);
      await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
      await dismissAnalyticsModal(page);
      await waitForTestId(page, "add-llm-profile");
      await deleteProfileIfExists(page, PROFILE_B_NAME);
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

  // ── Step 1: activate profile A, create switch-target profile B, trajectory ─

  test("step 1: configure LLM, create switch-target profile, register trajectory", async ({
    page,
    request,
  }) => {
    await ensureMockLLMProfile(page);

    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "add-llm-profile");

    await deleteProfileIfExists(page, PROFILE_B_NAME);
    await createProfileViaUI(page, {
      profileName: PROFILE_B_NAME,
      model: MODEL_B,
    });

    const profileRows = page.getByTestId("profile-row");
    const profileTexts = await profileRows.allTextContents();
    expect(
      profileTexts.some((text) => text.includes(PROFILE_B_NAME)),
      `Profile "${PROFILE_B_NAME}" should appear in the list`,
    ).toBe(true);

    // Turn 0 padding: the agent-server makes an internal LLM call before the
    // agent's main loop (see mock-llm-model-switch.spec.ts for the rationale).
    await registerTrajectory(request, "picker-ui", [
      { text: "" },
      { text: INITIAL_REPLY_TOKEN },
    ]);
    await activateTrajectory(request, "picker-ui");
  });

  // ── Step 2: open the pill, verify the list, switch via the picker ─────────

  test("step 2: open picker pill, verify current selection, switch profile", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    let switchLlmCalled = false;
    let switchLlmBody: Record<string, unknown> | null = null;
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (
        req.method() === "POST" &&
        url.pathname.match(/\/api\/conversations\/[^/]+\/switch_llm/)
      ) {
        switchLlmCalled = true;
        try {
          switchLlmBody = req.postDataJSON();
        } catch {
          // non-JSON body
        }
      }
    });

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    await test.step("send initial message", async () => {
      await setChatInput(page, "Hello, please respond briefly.");
      await page.getByTestId("submit-button").click();
      await waitForPath(page, /\/conversations\/.+/, 30_000);
    });

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    await test.step("wait for initial agent reply", async () => {
      await waitForNonUserMessageText(page, INITIAL_REPLY_TOKEN, 30_000);
    });

    await test.step("open the picker pill", async () => {
      const pill = page.getByTestId("chat-input-llm-profile");
      await expect(pill).toBeVisible({ timeout: 10_000 });
      await pill.click();
      await waitForTestId(page, "chat-input-llm-profile-popover");
    });

    await test.step("picker lists the real profiles from the backend", async () => {
      // Both the active profile and the switch target are present — the list is
      // populated from the profiles API, not a hardcoded model catalog.
      await expect(
        page.getByTestId(`chat-input-llm-profile-option-${PROFILE_B_NAME}`),
      ).toBeVisible({ timeout: 10_000 });
      // The active profile ("mock-llm") is marked as the current selection.
      // Options are menuitemradio, so the current one carries aria-checked.
      const current = page.getByTestId(
        "chat-input-llm-profile-option-mock-llm",
      );
      await expect(current).toBeVisible();
      await expect(current).toHaveAttribute("role", "menuitemradio");
      await expect(current).toHaveAttribute("aria-checked", "true");
    });

    await test.step("selecting profile B fires switch_llm with B's model", async () => {
      await page
        .getByTestId(`chat-input-llm-profile-option-${PROFILE_B_NAME}`)
        .click();
      // Confirmation renders in the chat log.
      await waitForNonUserMessageText(page, PROFILE_B_NAME, 30_000);

      expect(
        switchLlmCalled,
        "POST /switch_llm should have been called from the picker",
      ).toBe(true);
      expect(switchLlmBody).toBeTruthy();
      const llm = switchLlmBody!.llm as Record<string, unknown> | undefined;
      expect(llm, "switch_llm body should contain an llm object").toBeTruthy();
      expect(
        llm!.model,
        `switch_llm body.llm.model should be "${MODEL_B}"`,
      ).toBe(MODEL_B);
    });

    await test.step("pill now reflects the switched-to profile", async () => {
      await expect(page.getByTestId("chat-input-llm-profile")).toContainText(
        PROFILE_B_NAME,
        { timeout: 10_000 },
      );
    });

    await test.step("verify no error banners", async () => {
      const errorBanner = page.getByTestId("error-message-banner");
      await expect(errorBanner).not.toBeVisible({ timeout: 2_000 });
    });
  });

  // ── Step 3: mobile (390x844) layout — popover stays below the header ───────

  test("step 3: mobile popover is viewport-safe and the trigger meets 44px", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // iPhone 12-class portrait viewport (the size main-agent QA screenshotted).
    await page.setViewportSize({ width: 390, height: 844 });

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    await test.step("start a conversation so the composer pill is present", async () => {
      await setChatInput(page, "Hello, please respond briefly.");
      await page.getByTestId("submit-button").click();
      await waitForPath(page, /\/conversations\/.+/, 30_000);
    });

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);
    await waitForNonUserMessageText(page, INITIAL_REPLY_TOKEN, 30_000);

    const pill = page.getByTestId("chat-input-llm-profile");
    await expect(pill).toBeVisible({ timeout: 10_000 });

    await test.step("trigger has a >=44x44 effective touch target", async () => {
      const box = await pill.boundingBox();
      expect(box, "pill should have a bounding box").toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    });

    await pill.click();
    await waitForTestId(page, "chat-input-llm-profile-popover");

    // The mobile header (SidebarMobileMenuBar) is h-12 = 48px at the top.
    const MOBILE_HEADER_BOTTOM = 48;

    await test.step("popover top clears the mobile header", async () => {
      const menu = page.getByTestId("chat-input-llm-profile-popover");
      const box = await menu.boundingBox();
      expect(box, "popover should have a bounding box").toBeTruthy();
      expect(
        box!.y,
        "popover top must sit below the 48px mobile header",
      ).toBeGreaterThanOrEqual(MOBILE_HEADER_BOTTOM);
      // No horizontal overflow past the 390px viewport.
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    });

    await test.step("search box is visible and not occluded by the header", async () => {
      const search = page.getByTestId("llm-model-picker-search-input");
      // The search box only renders at >=6 profiles; assert its position only
      // when present (this suite configures 2 profiles, so it may be absent).
      if (await search.count()) {
        const box = await search.boundingBox();
        expect(box!.y).toBeGreaterThanOrEqual(MOBILE_HEADER_BOTTOM);
        // The header must not win hit-testing over the search region.
        const midX = box!.x + box!.width / 2;
        const midY = box!.y + box!.height / 2;
        const hit = await page.evaluate(
          ([x, y]) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest("header") ? "HEADER" : "MENU";
          },
          [midX, midY],
        );
        expect(hit).toBe("MENU");
      }
    });

    await test.step("Settings row is reachable via scroll", async () => {
      const settings = page.getByTestId("llm-model-picker-settings-link");
      await settings.scrollIntoViewIfNeeded();
      await expect(settings).toBeVisible();
      const box = await settings.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(MOBILE_HEADER_BOTTOM);
    });

    await test.step("keyboard still closes and restores focus to the trigger", async () => {
      await page.keyboard.press("Escape");
      await expect(
        page.getByTestId("chat-input-llm-profile-popover"),
      ).toBeHidden();
      await expect(pill).toBeFocused();
    });
  });
});
