/**
 * Quick screenshots: signin (logged out), BTSpend with new FAB,
 * Tweaks panel showing tab bar still visible.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://buildtogether-v2.vercel.app";
const SHOTS = "C:/Projects/BuildtogetherV2/test-results/clickthrough";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
  });

  // 1. Sign-in (logged out)
  let page = await ctx.newPage();
  await page.goto(BASE + "/app/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("build_together_auth_token"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(SHOTS, "v2-signin.png"), fullPage: true });
  console.log("📸 v2-signin.png");
  await page.close();

  // 2. Spend tab + Tweaks open over it
  const reg = await fetch(BASE + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "shot-" + Date.now() + "@example.com",
      password: "Quickshot12345!",
      name: "Maya",
    }),
  }).then((r) => r.json());
  const token = reg.token;
  await fetch(BASE + "/api/household/create", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Maya", schoolName: "NYU" }),
  });
  await fetch(BASE + "/api/household/complete-onboarding", {
    method: "POST",
    headers: { authorization: "Bearer " + token },
  });

  page = await ctx.newPage();
  await page.goto(BASE + "/app/", { waitUntil: "networkidle" });
  await page.evaluate((t) => localStorage.setItem("build_together_auth_token", t), token);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  // Open Spend
  await page.getByText("SPEND", { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, "v2-spend-with-fab.png"), fullPage: true });
  console.log("📸 v2-spend-with-fab.png");

  // Open Tweaks while on Spend
  await page.getByText("tweaks", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, "v2-tweaks-over-spend.png"), fullPage: true });
  console.log("📸 v2-tweaks-over-spend.png");

  // Try clicking a tab while Tweaks is open
  await page.getByText("CREDIT", { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, "v2-credit-after-tweaks-click.png"), fullPage: true });
  console.log("📸 v2-credit-after-tweaks-click.png — should show Credit, not stuck on Spend");

  await browser.close();
})();
