// Captures every Pulse screen, modal and state across phone widths and both
// themes, using deterministic fixture feeds so the images are comparable
// between runs. Companion to check-responsive.mjs: that script asserts, this
// one is the visual record.
//
//   node scripts/capture-screens.mjs --out test-results/screens/before
//
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { providers, unknownProvider } from "../shared/providers.js";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const origin = args.get("url") || process.env.PULSE_QA_URL || "http://127.0.0.1:5174";
const outDir = resolve(args.get("out") || "test-results/screens/current");
const only = args.get("only");

const WIDTHS = [
  { name: "small", width: 360, height: 780 },
  { name: "phone", width: 390, height: 844 },
  { name: "large", width: 430, height: 932 },
];

// Readings older than STALE_MS (5 minutes) are treated as unavailable, so the
// fixture has to be stamped at capture time. Everything then reads "Just now",
// which is itself stable between runs.
const NOW = new Date().toISOString();

const INCIDENTS = [
  {
    provider: "cloudflare",
    id: "cf-1",
    name: "Elevated 5xx errors in Western Europe",
    impact: "critical",
    status: "investigating",
    body: "We are investigating elevated error rates affecting requests routed through Amsterdam and Frankfurt. Customers may see intermittent 5xx responses.",
    components: ["Amsterdam (AMS)", "Frankfurt (FRA)", "CDN / Cache"],
  },
  {
    provider: "github",
    id: "gh-1",
    name: "Degraded performance for Actions",
    impact: "major",
    status: "identified",
    body: "Queued workflow runs are starting later than usual. A fix is being deployed.",
    components: ["Actions", "Webhooks"],
  },
  {
    provider: "openai",
    id: "oa-1",
    name: "Increased latency on the API",
    impact: "minor",
    status: "monitoring",
    body: "Latency has returned to normal levels and we are monitoring the result.",
    components: ["API"],
  },
  {
    provider: "npm",
    id: "npm-1",
    name: "Package publishing delays",
    impact: "minor",
    status: "monitoring",
    body: "Publishing is succeeding but index propagation is slower than usual.",
    components: ["Publishing"],
  },
];

function feed({ healthy = false, incidents = INCIDENTS } = {}) {
  const active = healthy ? [] : incidents;
  return {
    providers: providers.map((p) => {
      const mine = active.filter((i) => i.provider === p.id);
      const worst = mine.find((i) => ["critical", "major"].includes(i.impact));
      return {
        ...unknownProvider(p),
        description: `${p.name} publishes an official status feed covering ${p.product.toLowerCase()}.`,
        status: worst ? "outage" : mine.length ? "degraded" : "operational",
        stale: false,
        checkedAt: NOW,
        sourceUpdatedAt: NOW,
        components: Array.from({ length: 12 }, (_, i) => ({
          id: `${p.id}-c${i}`,
          name: `${p.name} component ${i + 1}`,
          status:
            mine.length && i < 2
              ? worst
                ? "major_outage"
                : "degraded_performance"
              : "operational",
        })),
        incidents: mine.map((i) => ({
          ...i,
          startedAt: NOW,
          updatedAt: NOW,
          url: p.url,
          updates: [
            { body: i.body, status: i.status, at: NOW },
            { body: "We are continuing to investigate this issue.", status: "investigating", at: NOW },
          ],
        })),
      };
    }),
    history: [],
    refreshing: false,
    fetchedAt: NOW,
    completedChecks: providers.length,
    revision: 2,
    startedAt: NOW,
  };
}

const SCENARIOS = {
  incidents: { body: feed(), watchlist: ["openai", "anthropic", "cloudflare", "github"] },
  healthy: { body: feed({ healthy: true }), watchlist: ["openai", "anthropic", "cloudflare", "github"] },
  empty: { body: feed({ healthy: true }), watchlist: [] },
  loading: { body: feed(), watchlist: ["openai", "cloudflare"], hang: true },
  error: { body: feed(), watchlist: ["openai", "cloudflare"], fail: true },
};

async function makeContext(browser, viewport, theme, scenario) {
  const { body, watchlist, hang, fail } = SCENARIOS[scenario];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: viewport.width <= 500,
    hasTouch: viewport.width <= 500,
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ([theme, watchlist]) => {
      localStorage.setItem("pulse-theme", theme);
      localStorage.setItem("pulse-watchlist", JSON.stringify(watchlist));
      localStorage.setItem("pulse-refresh", "true");
    },
    [theme, watchlist],
  );
  await context.route("**/api/status**", async (route) => {
    const url = route.request().url();
    if (hang) return; // Never fulfil: the app stays in its loading state.
    if (fail) return route.fulfill({ status: 500, contentType: "text/plain", body: "Monitor unavailable" });
    if (url.includes("stream"))
      return route.fulfill({
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify(body)}\n\n`,
      });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  return context;
}

// Works before and after the redesign: uses a visible destination control when
// one exists, otherwise opens the navigation drawer first.
// A destination can be labelled differently in the bottom bar than in the
// "More" sheet ("Map" vs "Global map"), and can carry a trailing count badge
// ("Watchlist 4"), so match any known label from the start of the name.
const SHORT = {
  "Global map": "Map",
  "Developer tools": "Tools",
  "Dependency insights": "Insights",
};
async function goTo(page, name) {
  const names = [name, SHORT[name]].filter(Boolean).join("|");
  const label = new RegExp(`^(${names})\\b`);
  const inNav = page.locator("nav").getByRole("button", { name: label }).and(page.locator(":visible"));
  if (await inNav.count()) {
    await inNav.first().click();
  } else {
    const opener = page
      .getByRole("button", { name: /Open navigation|More|Menu/ })
      .and(page.locator(":visible"));
    if (await opener.count()) await opener.first().click();
    await page.waitForTimeout(350);
    await page.locator("nav").getByRole("button", { name: label }).first().click();
  }
  await page.waitForTimeout(450);
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(250);
}

const shots = [];
async function shot(page, file, { full = true } = {}) {
  await settle(page);
  const path = resolve(outDir, `${file}.png`);
  await page.screenshot({ path, fullPage: full, animations: "disabled" });
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  shots.push({ file: `${file}.png`, ...overflow, overflows: overflow.scrollWidth > overflow.innerWidth });
  process.stdout.write(`  ${file}.png${overflow.scrollWidth > overflow.innerWidth ? "  ⚠ horizontal overflow" : ""}\n`);
}

// Matches check-responsive.mjs: use the installed Edge channel rather than a
// separately downloaded Playwright build.
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

try {
  for (const viewport of WIDTHS) {
    if (only && only !== viewport.name) continue;
    const isPhone = viewport.width <= 500;
    const tag = `${viewport.name}-${viewport.width}`;

    // ---- Main journey, light theme, with live incidents -------------------
    {
      const context = await makeContext(browser, viewport, "light", "incidents");
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /Service directory|Your watchlist/ }).waitFor({ timeout: 30000 });

      await shot(page, `${tag}-01-overview-light`);
      await goTo(page, "Incidents");
      await shot(page, `${tag}-02-incidents`);
      await goTo(page, "Watchlist");
      await shot(page, `${tag}-03-watchlist`);
      await goTo(page, "Global map");
      await shot(page, `${tag}-04-map`);
      await goTo(page, "Developer tools");
      await shot(page, `${tag}-05-devtools`);
      // The security lab is the app's only real form screen.
      await page.getByRole("tab", { name: "Security lab" }).click();
      await page.waitForTimeout(400);
      await shot(page, `${tag}-05b-security-lab`);
      await goTo(page, "Dependency insights");
      await shot(page, `${tag}-06-insights`);
      await goTo(page, "Overview");

      // Navigation surface itself
      if (isPhone) {
        const opener = page.getByRole("button", { name: /Open navigation|More/ }).and(page.locator(":visible"));
        if (await opener.count()) {
          await opener.first().click();
          await shot(page, `${tag}-07-navigation`, { full: false });
          await page.keyboard.press("Escape");
          await page.waitForTimeout(350);
        } else {
          await shot(page, `${tag}-07-navigation`, { full: false });
        }
      }

      // Provider detail — the app's deepest content screen
      await page.getByRole("button", { name: /^Cloudflare/ }).first().click();
      await page.getByRole("link", { name: /Official status page/ }).waitFor();
      await shot(page, `${tag}-08-provider-detail`, { full: false });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);

      // Incident inbox
      await page.getByRole("button", { name: /incident notifications/i }).first().click();
      await page.waitForTimeout(500);
      await shot(page, `${tag}-09-incident-inbox`, { full: false });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);

      // Watchlist editor — the app's main "form"
      const editor = page
        .getByRole("button", { name: /Edit watchlist|Add services?/ })
        .and(page.locator(":visible"));
      if (!(await editor.count())) {
        const opener = page
          .getByRole("button", { name: /Open navigation|More|Menu/ })
          .and(page.locator(":visible"));
        if (await opener.count()) await opener.first().click();
        await page.waitForTimeout(350);
      }
      await page.getByRole("button", { name: /Edit watchlist|Add services?/ }).first().click();
      await page.waitForTimeout(500);
      await shot(page, `${tag}-10-watchlist-editor`, { full: false });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);

      // Settings
      const settings = page.getByRole("button", { name: "Settings", exact: true }).and(page.locator(":visible"));
      if (await settings.count()) await settings.first().click();
      else {
        const opener = page.getByRole("button", { name: /Open navigation|More/ }).and(page.locator(":visible"));
        if (await opener.count()) await opener.first().click();
        await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      }
      await page.waitForTimeout(500);
      await shot(page, `${tag}-11-settings`, { full: false });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);

      if (errors.length) console.warn(`  page errors at ${tag}:`, errors);
      await writeFile(resolve(outDir, `${tag}-page-errors.json`), JSON.stringify(errors, null, 2));
      await context.close();
    }

    // ---- Dark theme -------------------------------------------------------
    {
      const context = await makeContext(browser, viewport, "dark", "incidents");
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /Service directory|Your watchlist/ }).waitFor({ timeout: 30000 });
      await shot(page, `${tag}-12-overview-dark`);
      await goTo(page, "Incidents");
      await shot(page, `${tag}-13-incidents-dark`);
      await context.close();
    }

    // ---- States: healthy / empty / loading / error ------------------------
    for (const [scenario, file] of [
      ["healthy", "14-state-all-clear"],
      ["empty", "15-state-empty-watchlist"],
      ["loading", "16-state-loading"],
      ["error", "17-state-error"],
    ]) {
      const context = await makeContext(browser, viewport, "light", scenario);
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      if (scenario === "loading") {
        await page.waitForTimeout(2500);
      } else {
        await page
          .getByRole("heading", { name: /Service directory|Your watchlist/ })
          .waitFor({ timeout: 30000 })
          .catch(() => {});
        await page.waitForTimeout(1200);
      }
      if (scenario === "empty") await goTo(page, "Watchlist");
      await shot(page, `${tag}-${file}`);
      await context.close();
    }
  }

  await writeFile(resolve(outDir, "index.json"), JSON.stringify({ origin, captured: shots }, null, 2));
  const bad = shots.filter((s) => s.overflows);
  console.log(`\n${shots.length} screenshots written to ${outDir}`);
  if (bad.length) {
    console.log(`${bad.length} with horizontal overflow:`);
    for (const b of bad) console.log(`  ${b.file} (${b.scrollWidth} > ${b.innerWidth})`);
  } else console.log("No horizontal overflow in any capture.");
} finally {
  await browser.close();
}
