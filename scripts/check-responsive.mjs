import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { providers, unknownProvider } from "../shared/providers.js";

const origin = process.env.PULSE_QA_URL || "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
await mkdir("test-results", { recursive: true });
const checks = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1080, height: 1920 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    await context.addInitScript(() => {
      if (!localStorage.getItem("pulse-theme")) localStorage.setItem("pulse-theme", "light");
      localStorage.setItem("pulse-watchlist", JSON.stringify(["openai", "anthropic", "cloudflare", "github"]));
    });
    const data = { providers: providers.map((p) => ({ ...unknownProvider(p), status: p.id === "openai" ? "degraded" : "operational", stale: false, checkedAt: new Date().toISOString(), components: [], incidents: [] })), history: [], refreshing: false, fetchedAt: new Date().toISOString(), completedChecks: providers.length, revision: 1 };
    await context.route("**/api/status**", (route) => route.fulfill({ contentType: route.request().url().includes("stream") ? "text/event-stream" : "application/json", body: route.request().url().includes("stream") ? `data: ${JSON.stringify(data)}\n\n` : JSON.stringify(data) }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole("heading", { name: "Service directory", exact: false }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator(".mobile-overview").count(), 0);
    assert.equal(await page.locator(".summary-grid").count(), 1);
    assert.equal(await page.locator(".overview-grid").count(), 1);
    assert.equal(await page.locator(".service-table").count(), 1);
    const geometry = await page.evaluate(() => {
      const title = document.querySelector(".page-heading h1");
      const style = getComputedStyle(title);
      return {
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        titleWidth: title.clientWidth,
        titleScroll: title.scrollWidth,
        titleHeight: title.getBoundingClientRect().height,
        titleFont: parseFloat(style.fontSize),
        titleLine: parseFloat(style.lineHeight),
      };
    });
    assert.ok(geometry.scroll <= geometry.width, `Horizontal overflow at ${viewport.width}`);
    assert.ok(geometry.titleScroll <= geometry.titleWidth, `Page title overflows at ${viewport.width}`);
    assert.ok(geometry.titleHeight <= geometry.titleLine * 1.1, `Page title wraps at ${viewport.width}`);
    const android = await page.evaluate(() => {
      document.documentElement.dataset.platform = "android";
      const title = document.querySelector(".page-heading h1");
      const style = getComputedStyle(title);
      return {
        summary: document.querySelectorAll(".summary-grid").length,
        overview: document.querySelectorAll(".overview-grid").length,
        directory: document.querySelectorAll(".service-table").length,
        titleWidth: title.clientWidth,
        titleScroll: title.scrollWidth,
        titleHeight: title.getBoundingClientRect().height,
        titleFont: parseFloat(style.fontSize),
        titleLine: parseFloat(style.lineHeight),
      };
    });
    assert.deepEqual([android.summary, android.overview, android.directory], [1, 1, 1]);
    assert.ok(android.titleScroll <= android.titleWidth, `Android page title overflows at ${viewport.width}`);
    assert.ok(android.titleHeight <= android.titleLine * 1.1, `Android page title wraps at ${viewport.width}`);
    await page.screenshot({ path: `test-results/overview-${viewport.width}-light.png`, fullPage: true });
    await page.getByRole("button", { name: "OpenAI", exact: false }).first().click();
    await page.getByRole("button", { name: "Remove from watchlist", exact: false }).waitFor();
    assert.equal(await page.locator(".watchlist-star.watched").count() > 0, true);
    assert.equal(await page.locator(".modal-actions .watchlist-star.watched").evaluate((el) => getComputedStyle(el).color), "rgb(255, 210, 74)");
    await page.keyboard.press("Escape");
    await page.evaluate(() => { localStorage.setItem("pulse-theme", "dark"); });
    await page.reload();
    await page.getByRole("heading", { name: "Service directory", exact: false }).waitFor();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.screenshot({ path: `test-results/overview-${viewport.width}-dark.png`, fullPage: true });
    assert.deepEqual(errors, []);
    checks.push({ ...viewport, ...geometry, errors });
    await context.close();
  }
  await writeFile("test-results/responsive.json", JSON.stringify(checks, null, 2));
  console.log("Desktop Overview, one-line page titles, Android styling, watched stars, and themes: passed at 390, 1080 portrait, and 1440 pixels.");
} finally { await browser.close(); }
