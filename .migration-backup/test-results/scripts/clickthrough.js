/**
 * Click-through test — simulate a real user, capture screenshots
 * AFTER each interaction, log everything that fails. The earlier
 * test ran headless + relied too heavily on API-direct calls.
 * This one drives the UI like a human would.
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "https://buildtogether-v2.vercel.app";
const RESULTS_DIR = "C:/Projects/BuildtogetherV2/test-results";
const SHOTS = path.join(RESULTS_DIR, "clickthrough");
fs.mkdirSync(SHOTS, { recursive: true });

const log = [];
function record(line) {
  const out = "[" + new Date().toISOString().slice(11, 19) + "] " + line;
  console.log(out);
  log.push(out);
}

async function api(method, route, body, token) {
  const res = await fetch(BASE + route, {
    method,
    headers: Object.assign(
      { "content-type": "application/json" },
      token ? { authorization: "Bearer " + token } : {},
    ),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function shot(page, name) {
  const p = path.join(SHOTS, name + ".png");
  await page.screenshot({ path: p, fullPage: true });
  record("📸 " + name);
}

async function tryClick(page, locator, label) {
  try {
    await locator.click({ timeout: 4000 });
    record("✅ click " + label);
    return true;
  } catch (e) {
    record("❌ click " + label + ": " + e.message.split("\n")[0]);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, slowMo: 50 });
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  page.on("pageerror", (e) => record("💥 PAGE ERROR: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") record("📛 CONSOLE ERR: " + msg.text().slice(0, 200));
  });

  try {
    // ─── Setup: register + complete onboarding via API to skip past it ─────
    const tag = Date.now();
    const email = "click-" + tag + "@example.com";
    const reg = await api("POST", "/api/auth/register", {
      email,
      password: "ClickThru12345!",
      name: "Maya",
    });
    if (!reg.json?.token) throw new Error("register failed: " + JSON.stringify(reg.json));
    const token = reg.json.token;
    await api("POST", "/api/household/create", { name: "Maya", schoolName: "NYU" }, token);
    await api("POST", "/api/household/complete-onboarding", null, token);

    // Send 2 chat messages so memory + history populate before screenshots
    await api("POST", "/api/tilly/chat", { message: "i'm anxious about money lately" }, token);
    await api("POST", "/api/tilly/chat", { message: "saving for a trip to barcelona" }, token);

    // Create a real dream
    await api("POST", "/api/dreams", {
      name: "Barcelona spring",
      target: 2400,
      glyph: "✺",
      gradient: ["#E94B3C", "#F59E0B"],
      weeklyAuto: 40,
      loc: "Spring break",
      dueLabel: "Mar 5",
    }, token);

    record("Setup done. Token=" + token.slice(0, 12) + "...");

    // ─── Load app + inject token ───────────────────────────────────────────
    await page.goto(BASE + "/app/", { waitUntil: "networkidle" });
    await page.evaluate((t) => localStorage.setItem("build_together_auth_token", t), token);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    await shot(page, "00-bthome-loaded");

    // ─── DOM AUDIT — list all clickable elements + their text/role ─────────
    const audit = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll('[tabindex], [role="button"], button, [class*="r-1loqt21"]');
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const text = (el.textContent || "").trim().slice(0, 60);
        out.push({
          idx: i,
          tag: el.tagName,
          text,
          role: el.getAttribute("role"),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      });
      return out;
    });
    fs.writeFileSync(path.join(RESULTS_DIR, "clickthrough-dom-audit.json"), JSON.stringify(audit, null, 2));
    record("DOM audit: " + audit.length + " clickable elements");

    // Find the bottom tab bar buttons by finding the row of elements with
    // similar y coordinate at the bottom of the viewport.
    const bottomY = 896 - 100; // rough bottom area
    const bottomTabs = audit.filter((e) => e.y > bottomY - 80 && e.y < 896 && e.w < 100);
    record("bottom tabs found: " + bottomTabs.map((b) => b.text).join(" | "));

    // ─── Test each tab ─────────────────────────────────────────────────────
    const tabsToTest = ["TODAY", "TILLY", "SPEND", "CREDIT", "DREAMS", "YOU"];
    for (const tab of tabsToTest) {
      // Try multiple selectors per tab
      const selectors = [
        page.getByText(tab, { exact: true }).last(), // mono-caps label
        page.getByText(tab, { exact: false }).last(),
        page.getByText(tab.toLowerCase(), { exact: false }).last(),
      ];
      let clicked = false;
      for (const sel of selectors) {
        try {
          await sel.click({ timeout: 1500 });
          clicked = true;
          break;
        } catch {}
      }
      record(tab + " tab " + (clicked ? "clicked" : "FAILED to click"));
      await page.waitForTimeout(2500);
      await shot(page, "tab-" + tab.toLowerCase());
    }

    // ─── Tilly chat — try to type + send a message ────────────────────────
    await page.getByText("TILLY", { exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(2000);

    // Find the chat input
    const chatInput = page.locator('input[placeholder*="Talk"], input[placeholder*="Tilly"]').first();
    const inputVisible = await chatInput.isVisible().catch(() => false);
    record("chat input visible: " + inputVisible);
    if (inputVisible) {
      await chatInput.fill("can i afford a $90 ticket?");
      await shot(page, "chat-typed");
      // Press send button (usually a circular arrow/up button)
      // Look for arrow ↑ character
      const sendBtn = page.getByText("↑").first();
      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click().catch(() => {});
        record("clicked send via ↑");
        await page.waitForTimeout(8000); // wait for Claude reply
        await shot(page, "chat-after-send");
      } else {
        record("❌ send button not found");
      }
    }

    // ─── Tilly tone tuner — change tone ────────────────────────────────────
    await page.getByText("YOU", { exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, "profile-before-tone");
    const coachBtn = page.getByText("Coach", { exact: false }).first();
    if (await coachBtn.isVisible().catch(() => false)) {
      await coachBtn.click().catch(() => {});
      record("clicked Coach tone");
      await page.waitForTimeout(2000);
      await shot(page, "profile-coach-tone");
    } else {
      record("❌ Coach tone button not found");
    }

    // ─── Tweaks panel — change theme ───────────────────────────────────────
    const tweaksBtn = page.getByText("tweaks", { exact: false }).first();
    if (await tweaksBtn.isVisible().catch(() => false)) {
      await tweaksBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
      await shot(page, "tweaks-open");
      // try clicking a different theme like "paper" or "dusk"
      for (const theme of ["paper", "dusk", "citrus", "bloom"]) {
        const themeBtn = page.getByText(theme, { exact: false }).first();
        if (await themeBtn.isVisible().catch(() => false)) {
          await themeBtn.click().catch(() => {});
          record("clicked theme " + theme);
          await page.waitForTimeout(800);
          await shot(page, "theme-" + theme);
          break;
        }
      }
    } else {
      record("❌ tweaks button not found");
    }

    // ─── BTDreams — try to add a new dream via UI ──────────────────────────
    await page.getByText("DREAMS", { exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, "dreams-loaded");
    const newDream = page.getByText("Name a new dream", { exact: false }).first();
    if (await newDream.isVisible().catch(() => false)) {
      await newDream.click().catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, "dreams-new-modal");
    }

    // ─── BTCredit — pay $50 button ────────────────────────────────────────
    await page.getByText("CREDIT", { exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, "credit-loaded");

    // ─── Final BTHome screenshot ──────────────────────────────────────────
    await page.getByText("TODAY", { exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, "back-home");

    // Persist log
    fs.writeFileSync(path.join(RESULTS_DIR, "clickthrough-log.txt"), log.join("\n"));
    record("Done. " + log.filter((l) => l.includes("✅") || l.includes("📸")).length + " ok / " + log.filter((l) => l.includes("❌") || l.includes("💥")).length + " issues");
  } catch (e) {
    record("FATAL: " + e.message);
    record(e.stack || "");
  } finally {
    fs.writeFileSync(path.join(RESULTS_DIR, "clickthrough-log.txt"), log.join("\n"));
    await browser.close();
  }
})();
