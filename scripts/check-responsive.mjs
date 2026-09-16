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
    const fixtureIncidents = incidents.flatMap((incident) => [
      incident,
      {
        ...incident,
        id: `${incident.id}-follow-up`,
        name: `${incident.name} follow-up`,
      },
    ]);
    const data = {
      providers: providers.map((p) => {
        const providerIncidents = fixtureIncidents.filter((item) => item.provider === p.id);
        const incident = providerIncidents[0];
        return {
          ...unknownProvider(p),
          status: incident?.impact === "major" ? "outage" : incident ? "degraded" : "operational",
          stale: false,
          checkedAt: timestamp,
          components: p.id === "openai" ? [{ id: "sf-api", name: "San Francisco / API", status: "degraded_performance" }] : [],
          incidents: providerIncidents,
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
    // One directory, rendered as list rows on a phone and as the comparison
    // table in a wide window. There is still exactly one implementation — the
    // presentation is responsive, the data path is not forked.
    const phone = viewport.width <= 760;
    assert.equal(await page.locator(".service-table").count(), phone ? 0 : 1);
    assert.equal(await page.locator(".service-list").count(), phone ? 1 : 0);
    // The Overview previews three services and expands in place, so the list is
    // never a scroller nested inside the scrolling page.
    const rows = phone ? ".service-list .service-row" : ".service-table tbody tr";
    assert.equal(await page.locator(rows).count(), 3, `Directory preview at ${viewport.width}`);
    const expand = page.getByRole("button", { name: /View all \d+ services/ });
    assert.equal(await expand.count(), 1, "The preview must offer the full list");
    await expand.click();
    await page.waitForTimeout(250);
    assert.equal(
      await page.locator(rows).count(),
      providers.length,
      `Every service must appear once expanded at ${viewport.width}`,
    );
    await page.getByRole("button", { name: "Show fewer services" }).click();
    await page.waitForTimeout(250);
    // Expanding the list scrolls the page; the geometry below is measured from
    // the top of the document.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    // The Overview previews a fixed number of incidents and links onward; the
    // full feed is the Incidents destination. A short list with a way out beats
    // a scroller nested inside a scrolling page.
    assert.equal(
      await page.locator(".incident-stream .incident-item").count(),
      3,
      "The Overview must preview exactly three incidents",
    );
    assert.ok(
      fixtureIncidents.length > 3,
      "This fixture must exceed the preview cap for the assertion to mean anything",
    );
    assert.equal(
      await page.locator(".incident-stream").evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
      true,
      "The Overview incident preview must not scroll internally",
    );
    assert.ok(
      (await page.getByRole("button", { name: /View all \d+ incidents/ }).count()) > 0,
      "The preview must offer a route to the full feed",
    );
    assert.ok(await page.locator(".atlas-hub.outage").count() > 0, "Map should show official outage locations");
    assert.ok(await page.locator(".atlas-hub.degraded").count() > 0, "Map should show official degraded locations");
    if (!phone) {
      assert.equal(
        await page.locator(".service-table tbody tr").first().locator(".health-bars i").count(),
        30,
        "Desktop component-health bars must retain the earlier full fallback",
      );
      assert.equal(
        await page.locator(".service-table tbody tr td:nth-child(4)").first().isVisible(),
        true,
        "Component health is a desktop column",
      );
    } else {
      // The phone carries the same signal as a readable count on each row
      // rather than 30 sub-pixel bars.
      assert.equal(
        await page.locator(".service-row-meta small").count(),
        await page.locator(".service-list .service-row").count(),
        "Each phone row must state its component health",
      );
    }
    const geometry = await page.evaluate(() => {
      const title = document.querySelector(".page-heading h1");
      const style = getComputedStyle(title);
      const directory = document.querySelector(".services-panel");
      const list = document.querySelector(".service-table-wrap");
      const map = document.querySelector(".atlas-map");
      const incidentsPanel = document.querySelector(".incidents-panel");
      return {
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        titleWidth: title.clientWidth,
        titleScroll: title.scrollWidth,
        titleHeight: title.getBoundingClientRect().height,
        titleFont: parseFloat(style.fontSize),
        titleLine: parseFloat(style.lineHeight),
        titleRowTop: document.querySelector(".page-title-row").getBoundingClientRect().top,
        bottomNav: document.querySelectorAll(".bottom-nav .bottom-nav-item").length,
        bottomNavHeight: document.querySelector(".bottom-nav")?.getBoundingClientRect().height ?? 0,
        bottomNavTargets: [...document.querySelectorAll(".bottom-nav .bottom-nav-item")]
          .map((node) => Math.round(node.getBoundingClientRect().height)),
        mainPaddingBottom: parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom),
        directoryHeight: directory.getBoundingClientRect().height,
        listHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
        listOverflow: getComputedStyle(list).overflowY,
        mapHeight: map.getBoundingClientRect().height,
        incidentsHeight: incidentsPanel.getBoundingClientRect().height,
      };
    });
    assert.ok(geometry.scroll <= geometry.width, `Horizontal overflow at ${viewport.width}`);
    assert.ok(geometry.titleScroll <= geometry.titleWidth, `Page title overflows at ${viewport.width}`);
    // The title may wrap. What it may not do is shrink below a readable size to
    // stay on one line — that is what produced a 15px screen title on a phone.
    assert.ok(
      geometry.titleFont >= 20,
      `Page title is only ${geometry.titleFont}px at ${viewport.width}`,
    );
    assert.ok(
      geometry.listScrollHeight <= geometry.listHeight + 1,
      `Directory must not scroll inside the page at ${viewport.width}`,
    );
    if (phone) {
      // Navigation lives in a fixed bottom bar, always one tap away, instead of
      // a hamburger that scrolls off the top of a three-viewport page.
      assert.equal(geometry.bottomNav, 5, `Bottom navigation must offer five destinations at ${viewport.width}`);
      for (const height of geometry.bottomNavTargets)
        assert.ok(height >= 44, `Bottom navigation targets must clear 44px (saw ${height}) at ${viewport.width}`);
      assert.ok(
        geometry.mainPaddingBottom >= geometry.bottomNavHeight,
        `Content must clear the bottom navigation at ${viewport.width}`,
      );
    } else {
      assert.equal(geometry.bottomNav, 0, `The sidebar replaces the bottom bar at ${viewport.width}`);
    }
    const android = await page.evaluate(() => {
      document.documentElement.dataset.platform = "android";
      const title = document.querySelector(".page-heading h1");
      const style = getComputedStyle(title);
      return {
        summary: document.querySelectorAll(".summary-grid").length,
        overview: document.querySelectorAll(".overview-grid").length,
        directory:
          document.querySelectorAll(".service-table").length +
          document.querySelectorAll(".service-list").length,
        titleWidth: title.clientWidth,
        titleScroll: title.scrollWidth,
        titleHeight: title.getBoundingClientRect().height,
        titleFont: parseFloat(style.fontSize),
        titleLine: parseFloat(style.lineHeight),
        titleRowTop: document.querySelector(".page-title-row").getBoundingClientRect().top,
      };
    });
    assert.deepEqual([android.summary, android.overview, android.directory], [1, 1, 1]);
    assert.ok(android.titleScroll <= android.titleWidth, `Android page title overflows at ${viewport.width}`);
    assert.ok(android.titleFont >= 20, `Android page title is only ${android.titleFont}px at ${viewport.width}`);
    assert.ok(android.titleRowTop >= 36, `Android status-bar inset is missing at ${viewport.width}`);
    if (!phone)
      assert.equal(
        await page.locator(".service-table tbody tr td:nth-child(4)").first().isVisible(),
        false,
        "Status signals should be hidden in the Android APK",
      );
    await page.evaluate(() => delete document.documentElement.dataset.platform);
    await page.screenshot({ path: `test-results/overview-${viewport.width}-light.png`, fullPage: true });
    await page.getByRole("button", { name: /View all \d+ services/ }).click();
    await page.waitForTimeout(250);
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
    const overviewHeaderTop = await page
      .locator(".page-title-row")
      .evaluate((node) => node.getBoundingClientRect().top);
    await page
      .locator(phone ? ".bottom-nav" : "nav")
      .getByRole("button", { name: /^Map\b|^Global map\b/ })
      .first()
      .click();
    await page.getByRole("heading", { name: "A connected world.", exact: true }).waitFor();
    const mapHeader = await page.evaluate(() => ({
      titleRowTop: document.querySelector(".page-title-row").getBoundingClientRect().top,
      mapHeight: document.querySelector(".map-main .atlas-map").getBoundingClientRect().height,
      bottomNavTop: document.querySelector(".bottom-nav")?.getBoundingClientRect().top ?? Infinity,
      mapBottom: document.querySelector(".map-main .atlas-map").getBoundingClientRect().bottom,
    }));
    assert.ok(mapHeader.mapHeight > 0, `Global map workspace must remain below the shared header at ${viewport.width}`);
    assert.ok(
      mapHeader.mapBottom <= mapHeader.bottomNavTop + 0.5,
      `Global map must not sit under the bottom navigation at ${viewport.width}`,
    );
    const androidMapTop = await page.evaluate(() => {
      document.documentElement.dataset.platform = "android";
      return document.querySelector(".page-title-row").getBoundingClientRect().top;
    });
    assert.ok(androidMapTop >= 36, `Android Global map header must clear the status bar at ${viewport.width}`);
    await page.evaluate(() => delete document.documentElement.dataset.platform);
    assert.deepEqual(errors, []);
    checks.push({ ...viewport, ...geometry, errors });
    await context.close();
  }
  await writeFile("test-results/responsive.json", JSON.stringify(checks, null, 2));
  console.log(
  "Shared Overview, readable page titles, phone bottom navigation, responsive directory, Android insets, watched stars, and themes: passed at 390, 1080 portrait, and 1440 pixels.",
);
} finally { await browser.close(); }
