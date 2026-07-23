import { chromium } from "playwright";

const CANVAS_URL = "http://127.0.0.1:8010";
const KEY = process.env.LOCAL_BACKEND_API_KEY || "";
const OUT_DIR = process.env.OUT_DIR || "/tmp/demovid";

const SKIP = `try {
  localStorage.setItem("openhands-onboarded", "1");
  localStorage.setItem("openhands-telemetry-consent", "denied");
  localStorage.setItem("openhands-backends", JSON.stringify([
    { id: "default-local", name: "Local", host: "${CANVAS_URL}", apiKey: ${JSON.stringify(KEY)}, kind: "local" },
  ]));
  localStorage.setItem("openhands-active-backend", JSON.stringify({ backendId: "default-local" }));
} catch {}`;

const CURSOR = `
window.addEventListener("DOMContentLoaded", () => {
  const d = document.createElement("div");
  d.id = "__demo_cursor";
  d.style.cssText = "position:fixed;top:0;left:0;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,0.85);border:2px solid rgba(0,0,0,0.55);box-shadow:0 0 6px rgba(0,0,0,0.6);z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);transition:width .1s,height .1s";
  document.body.appendChild(d);
  window.addEventListener("mousemove", (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; }, true);
  window.addEventListener("mousedown", () => { d.style.width = "12px"; d.style.height = "12px"; }, true);
  window.addEventListener("mouseup", () => { d.style.width = "18px"; d.style.height = "18px"; }, true);
});`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
await page.addInitScript(SKIP);
await page.addInitScript(CURSOR);

const pause = (ms) => page.waitForTimeout(ms);
async function moveClick(loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 30 });
  await pause(350);
  await page.mouse.down();
  await page.mouse.up();
}

try {
  // Pre-warm (not recorded meaningfully: happens on a throwaway page)
  const warm = await ctx.newPage();
  await warm.addInitScript(SKIP);
  await warm.goto(CANVAS_URL + "/conversations", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await warm.waitForTimeout(2000);
  await warm.close();

  // Scene 1: home
  await page.goto(CANVAS_URL + "/conversations", { waitUntil: "networkidle", timeout: 45000 });
  await pause(2500);

  // Scene 2: yesterday's session — facts were stored here
  await moveClick(page.getByText("Monday - launch planning").first());
  await page.getByText("AURORA", { exact: false }).first().waitFor({ timeout: 90000 });
  await pause(8000);

  // Scene 3: memory browser — the real engine store
  await moveClick(page.getByRole("link", { name: "Memory" }));
  await pause(9000);

  // Scene 4: new chat in a fresh workspace
  await moveClick(page.getByRole("link", { name: "New Chat" }));
  await pause(1500);
  await moveClick(page.getByRole("button", { name: /open workspace/i }));
  await pause(800);
  const dlg = page.getByRole("dialog").filter({ hasText: "Open Workspace" });
  await moveClick(dlg.getByRole("combobox"));
  await pause(900);
  await moveClick(page.getByText("centri-demo-b", { exact: false }).first());
  await pause(700);
  await moveClick(dlg.getByRole("button", { name: /confirm/i }));
  await pause(1800);

  // Scene 5: cold-start question
  const composer = page.locator('[data-testid="chat-input"]');
  await moveClick(composer);
  await page.keyboard.type(
    "Fresh session, quick check: what's our launch demo codename, the target date, and the tagline? And what were we doing next?",
    { delay: 30 },
  );
  await pause(1000);
  await page.keyboard.press("Enter");
  await pause(2000);
  // fallback: if the text is still in the composer, click the send button
  const remaining = (await composer.innerText().catch(() => "")).trim();
  if (remaining.length > 10) {
    const send = page.locator("button:has(svg)").last();
    await moveClick(send);
  }

  // Scene 6: wait for the answer to start streaming, then for the backend
  // to report the run finished; reload so the persisted answer renders
  // stably, and hold on it.
  await page.getByText("AURORA", { exact: false }).first().waitFor({ timeout: 180000 });
  const convId = page.url().split("/conversations/")[1].split(/[/?#]/)[0];
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const r = await fetch(`${CANVAS_URL}/api/conversations/${convId}`, {
      headers: { "X-Session-API-Key": KEY },
    });
    const j = await r.json().catch(() => ({}));
    const st = String(j.execution_status || j.status || "").toUpperCase();
    if (st && st !== "RUNNING" && st !== "STARTING") break;
    await new Promise((res) => setTimeout(res, 2000));
  }
  await page.reload({ waitUntil: "networkidle", timeout: 90000 });
  await page.waitForFunction(
    () => {
      const t = document.body.innerText;
      return t.includes("AURORA") && t.includes("August 5") && t.includes("colleagues");
    },
    { timeout: 90000, polling: 500 },
  );
  await pause(2500);
  await page.screenshot({ path: "/tmp/step_answer.png" });
  await pause(8500);
  console.log("final url:", page.url());
} catch (e) {
  console.error("RECORDING ERROR:", e.message);
  await page.screenshot({ path: "/tmp/step_error.png" }).catch(() => {});
} finally {
  await ctx.close();
  const video = await page.video().path();
  console.log("video:", video);
  await browser.close();
}
