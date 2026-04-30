/**
 * Shared helpers for Tilly E2E scenarios.
 *
 * Each scenario imports `runScenario` and passes a function that takes
 * `{ page, ctx, ss, apiCall, sendChat, openAddExpense, log }` and runs
 * the actual assertions. `runScenario` handles browser launch, login,
 * results-dir setup, screenshot capture, network logging, and teardown.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BT_BASE || "https://buildtogether-v2.vercel.app";
const EMAIL = process.env.BT_EMAIL || "riley-qa-2026-04-28@buildtogether.test";
const PASSWORD = process.env.BT_PASSWORD || "testpass123";
const HEADLESS = process.env.BT_HEADLESS !== "0";

function defaultResultsDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join("test-results", "e2e", stamp);
}

const RESULTS_DIR = process.env.BT_RESULTS_DIR || defaultResultsDir();

async function login(page) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const inputs = await page.locator("input").all();
  if (inputs.length < 2) {
    throw new Error("login form not found — site may already have a session");
  }
  await inputs[0].fill(EMAIL);
  await inputs[1].fill(PASSWORD);
  await page.getByText("Sign in", { exact: false }).first().click();
  // Wait for the bottom tab bar to render — the most reliable post-login signal
  await page.getByText("Tilly", { exact: true }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function gotoTab(page, label) {
  await page.getByText(label, { exact: true }).first().click();
  await page.waitForTimeout(1500);
}

/**
 * Authenticated API call from inside the page context. Uses the bearer
 * token stored in localStorage by AuthContext.
 */
async function apiCall(page, requestPath, opts = {}) {
  return page.evaluate(
    async ({ requestPath, opts }) => {
      const token = localStorage.getItem("build_together_auth_token");
      try {
        const r = await fetch(requestPath, {
          ...opts,
          headers: {
            ...(opts.headers || {}),
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        let body;
        try {
          body = await r.json();
        } catch {
          body = await r.text();
        }
        return { status: r.status, body };
      } catch (e) {
        return { error: e.message };
      }
    },
    { requestPath, opts },
  );
}

/**
 * Open the AddExpense modal by clicking the + FAB on the Spend screen.
 * Caller should already be on Spend.
 */
async function openAddExpense(page) {
  const pos = await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll("button")).filter(
      (el) => el.textContent.trim() === "+",
    );
    const fab = m.find((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.right > window.innerWidth - 100 &&
        r.bottom > window.innerHeight - 200
      );
    });
    if (!fab) return null;
    const r = fab.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!pos) throw new Error("+ FAB not found on Spend screen");
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(1200);
}

/** Click a tab inside the AddExpense modal: "text" | "voice" | "photo" */
async function clickModalTab(page, label) {
  const pos = await page.evaluate((lbl) => {
    const all = Array.from(document.querySelectorAll("*")).filter(
      (el) => el.children.length === 0,
    );
    const match = all.find(
      (el) => (el.textContent || "").trim().toLowerCase() === lbl.toLowerCase(),
    );
    if (!match) return null;
    const r = match.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  if (!pos) throw new Error(`modal tab "${label}" not found`);
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(800);
}

/**
 * Send a chat message on the Tilly screen. Caller should already be on
 * the Tilly tab. Returns the latency until the bot reply lands in
 * `/api/tilly/chat/history`.
 */
async function sendChat(page, message, { timeoutMs = 45000 } = {}) {
  const before = await apiCall(page, "/api/tilly/chat/history");
  const lenBefore = before.body?.messages?.length ?? 0;

  const chatInput = page.locator("input").last();
  await chatInput.click();
  await chatInput.fill(message);
  await page.waitForTimeout(250);

  // Find the small send button just to the right of the chat input
  const sendInfo = await page.evaluate(() => {
    const inputEls = Array.from(document.querySelectorAll("input"));
    const chatIn = inputEls[inputEls.length - 1];
    const ir = chatIn.getBoundingClientRect();
    const candidates = Array.from(
      document.querySelectorAll('button, [role="button"]'),
    );
    const m = candidates.find((c) => {
      const r = c.getBoundingClientRect();
      return (
        r.x > ir.right - 30 &&
        r.x < ir.right + 80 &&
        r.y >= ir.y - 15 &&
        r.bottom <= ir.bottom + 15 &&
        r.width > 25 &&
        r.width < 80
      );
    });
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (sendInfo) {
    await page.mouse.click(sendInfo.x, sendInfo.y);
  } else {
    await page.keyboard.press("Enter");
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(500);
    const h = await apiCall(page, "/api/tilly/chat/history");
    const lenNow = h.body?.messages?.length ?? 0;
    if (lenNow >= lenBefore + 2) {
      return {
        latencyMs: Date.now() - start,
        reply: h.body.messages[h.body.messages.length - 1],
      };
    }
  }
  throw new Error(`chat reply not received within ${timeoutMs}ms`);
}

/**
 * Run a scenario function with a fresh logged-in browser. Captures
 * screenshots into `<resultsDir>/<scenarioId>-<step>.png`, dumps a
 * `network.log` file, and writes a `result.json` with pass/fail.
 */
async function runScenario(scenarioId, body) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outDir = path.join(RESULTS_DIR, scenarioId);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 80 });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
  });
  const page = await ctx.newPage();

  const network = [];
  page.on("response", (resp) => {
    const u = resp.url();
    if (u.includes("/api/")) {
      network.push(
        `${resp.status()} ${resp.request().method()} ${u.replace(BASE, "")}`,
      );
    }
  });
  const errors = [];
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
  });

  let stepCounter = 0;
  const ss = async (name) => {
    stepCounter += 1;
    const file = path.join(
      outDir,
      `${String(stepCounter).padStart(2, "0")}-${name}.png`,
    );
    await page.screenshot({ path: file, fullPage: true });
    console.log("   📸", path.relative(process.cwd(), file));
    return file;
  };

  const log = (msg) => console.log(`   ${msg}`);

  console.log(`\n▶ ${scenarioId}`);
  const t0 = Date.now();
  let result;
  try {
    await login(page);
    await body({
      page,
      ctx,
      ss,
      log,
      apiCall: (p, o) => apiCall(page, p, o),
      sendChat: (m, o) => sendChat(page, m, o),
      openAddExpense: () => openAddExpense(page),
      clickModalTab: (l) => clickModalTab(page, l),
      gotoTab: (l) => gotoTab(page, l),
    });
    result = { scenarioId, status: "pass", durationMs: Date.now() - t0 };
    console.log(`✔ ${scenarioId} passed in ${result.durationMs}ms\n`);
  } catch (err) {
    result = {
      scenarioId,
      status: "fail",
      durationMs: Date.now() - t0,
      error: err.message,
      stack: err.stack,
    };
    console.error(`✘ ${scenarioId} failed: ${err.message}\n`);
    try {
      await ss("FAIL");
    } catch {
      // ignore
    }
  }

  fs.writeFileSync(path.join(outDir, "network.log"), network.join("\n"));
  if (errors.length) {
    fs.writeFileSync(path.join(outDir, "errors.log"), errors.join("\n"));
  }
  fs.writeFileSync(
    path.join(outDir, "result.json"),
    JSON.stringify(result, null, 2),
  );

  await browser.close();
  return result;
}

module.exports = {
  BASE,
  EMAIL,
  RESULTS_DIR,
  runScenario,
  login,
  gotoTab,
  apiCall,
  openAddExpense,
  clickModalTab,
  sendChat,
};
