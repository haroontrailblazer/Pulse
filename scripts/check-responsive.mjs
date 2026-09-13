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
    const timestamp = new Date().toISOString();
    const incidents = [
      { provider: "openai", id: "sf", name: "San Francisco API latency", impact: "minor", status: "monitoring", updatedAt: timestamp, body: "Official service update." },
      { provider: "github", id: "london", name: "London Actions disruption", impact: "major", status: "investigating", updatedAt: timestamp, body: "Official service update." },
      { provider: "googlecloud", id: "tokyo", name: "Tokyo Cloud incident", impact: "major", status: "investigating", updatedAt: timestamp, body: "Official service update." },
      { provider: "azure", id: "virginia", name: "Virginia platform degradation", impact: "minor", status: "monitoring", updatedAt: timestamp, body: "Official service update." },
    ];
    const data = {
      providers: providers.map((p) => {
        const incident = incidents.find((item) => item.provider === p.id);
        return {
          ...unknownProvider(p),
          status: incident?.impact === "major" ? "outage" : incident ? "degraded" : "operational",
          stale: false,
          checkedAt: timestamp,
          components: p.id === "openai" ? [{ id: "sf-api", name: "San Francisco / API", status: "degraded_performance" }] : [],
          incidents: incident ? [incident] : [],
        };
      }),
      history: [], refreshing: false, fetchedAt: timestamp, completedChecks: providers.length, revision: 1,
    };
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
    assert.equal(await page.locator(".incident-stream .incident-item").count(), incidents.length);
    assert.equal(
      await page.locator(".incident-stream").evaluate((node) => node.scrollHeight <= node.clientHeight),
      true,
      "Live incidents must not be clipped on the Overview page",
    );
    assert.ok(await page.locator(".atlas-hub.outage").count() > 0, "Map should show official outage locations");
    assert.ok(await page.locator(".atlas-hub.degraded").count() > 0, "Map should show official degraded locations");
    assert.equal(
      await page.locator(".health-bars i").count(),
      (providers.length - 1) * 30 + 1,
      "Desktop component-health bars must retain the earlier full fallback",
    );
    assert.equal(
      await page.locator(".service-table tbody tr td:nth-child(4)").first().isVisible(),
      viewport.width > 760,
      "Status signals should be desktop-only on the website",
    );
    const geometry = await page.evaluate(() => {
      const title = document.querySelector(".page-heading h1");
      const style = getComputedStyle(title);
      const dot = document.querySelector(".page-heading .eyebrow > span");
      const menu = document.querySelector(".page-menu svg");
      const directory = document.querySelector(".services-panel");
      const list = document.querySelector(".service-table-wrap");
      return {
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        titleWidth: title.clientWidth,
        titleScroll: title.scrollWidth,
        titleHeight: title.getBoundingClientRect().height,
        titleFont: parseFloat(style.fontSize),
        titleLine: parseFloat(style.lineHeight),
        eyebrowTop: document.querySelector(".page-heading .eyebrow").getBoundingClientRect().top,
        dotLeft: dot?.getBoundingClientRect().left ?? null,
        menuLeft: menu?.getBoundingClientRect().left ?? null,
        directoryHeight: directory.getBoundingClientRect().height,
        listHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
        listOverflow: getComputedStyle(list).overflowY,
      };
    });
    assert.ok(geometry.scroll <= geometry.width, `Horizontal overflow at ${viewport.width}`);
    assert.ok(geometry.titleScroll <= geometry.titleWidth, `Page title overflows at ${viewport.width}`);
    assert.ok(geometry.titleHeight <= geometry.titleLine * 1.1, `Page title wraps at ${viewport.width}`);
    assert.equal(geometry.listOverflow, "auto", `Directory must scroll internally at ${viewport.width}`);
    assert.ok(geometry.listScrollHeight > geometry.listHeight, `Directory rows must be contained by the fixed card at ${viewport.width}`);
    if (viewport.width <= 760)
      assert.ok(Math.abs(geometry.dotLeft - geometry.menuLeft) <= 0.5, `Menu glyph must align with the eyebrow dot at ${viewport.width}`);
    const android = await page.evaluate(() => {
      document.documentElement.dataset.platform = "android";
      const title = document.querySelector(".page-heading h1");
      const style = getComputedStyle(title);
      const dot = document.querySelector(".page-heading .eyebrow > span");
      const menu = document.querySelector(".page-menu svg");
      return {
        summary: document.querySelectorAll(".summary-grid").length,
        overview: document.querySelectorAll(".overview-grid").length,
        directory: document.querySelectorAll(".service-table").length,
        titleWidth: title.clientWidth,
        titleScroll: title.scrollWidth,
        titleHeight: title.getBoundingClientRect().height,
        titleFont: parseFloat(style.fontSize),
        titleLine: parseFloat(style.lineHeight),
        eyebrowTop: document.querySelector(".page-heading .eyebrow").getBoundingClientRect().top,
        dotLeft: dot?.getBoundingClientRect().left ?? null,
        menuLeft: menu?.getBoundingClientRect().left ?? null,
      };
    });
    assert.deepEqual([android.summary, android.overview, android.directory], [1, 1, 1]);
    assert.ok(android.titleScroll <= android.titleWidth, `Android page title overflows at ${viewport.width}`);
    assert.ok(android.titleHeight <= android.titleLine * 1.1, `Android page title wraps at ${viewport.width}`);
    assert.ok(android.eyebrowTop >= 36, `Android status-bar inset is missing at ${viewport.width}`);
    if (viewport.width <= 760)
      assert.ok(Math.abs(android.dotLeft - android.menuLeft) <= 0.5, `Android menu glyph must align with the eyebrow dot at ${viewport.width}`);
    assert.equal(
      await page.locator(".service-table tbody tr td:nth-child(4)").first().isVisible(),
      false,
      "Status signals should be hidden in the Android APK",
    );
    await page.evaluate(() => delete document.documentElement.dataset.platform);
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
    const overviewHeaderTop = await page.locator(".page-heading .eyebrow").evaluate((node) => node.getBoundingClientRect().top);
    if (viewport.width <= 760) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Global map", exact: true }).click();
    await page.getByRole("heading", { name: "A connected world.", exact: true }).waitFor();
    const mapHeader = await page.evaluate(() => {
      const eyebrow = document.querySelector(".page-heading .eyebrow");
      const dot = document.querySelector(".page-heading .eyebrow > span");
      const menu = document.querySelector(".page-menu svg");
      return {
        eyebrowTop: eyebrow.getBoundingClientRect().top,
        dotLeft: dot?.getBoundingClientRect().left ?? null,
        menuLeft: menu?.getBoundingClientRect().left ?? null,
        mapHeight: document.querySelector(".map-main .atlas-map").getBoundingClientRect().height,
      };
    });
    assert.ok(Math.abs(mapHeader.eyebrowTop - overviewHeaderTop) <= 0.5, `Global map header must align with every page at ${viewport.width}`);
    assert.ok(mapHeader.mapHeight > 0, `Global map workspace must remain below the shared header at ${viewport.width}`);
    if (viewport.width <= 760)
      assert.ok(Math.abs(mapHeader.dotLeft - mapHeader.menuLeft) <= 0.5, `Global map menu glyph must align with the eyebrow dot at ${viewport.width}`);
    const androidMapTop = await page.evaluate(() => {
      document.documentElement.dataset.platform = "android";
      return document.querySelector(".page-heading .eyebrow").getBoundingClientRect().top;
    });
    assert.ok(androidMapTop >= 36, `Android Global map header must clear the status bar at ${viewport.width}`);
    await page.evaluate(() => delete document.documentElement.dataset.platform);
    assert.deepEqual(errors, []);
    checks.push({ ...viewport, ...geometry, errors });
    await context.close();
  }
  await writeFile("test-results/responsive.json", JSON.stringify(checks, null, 2));
  console.log("Desktop Overview, one-line page titles, Android styling, watched stars, and themes: passed at 390, 1080 portrait, and 1440 pixels.");
} finally { await browser.close(); }
