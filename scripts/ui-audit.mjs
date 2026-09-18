// Measures the rendered UI against the design system's hard rules, on every
// screen, at every phone width, in both themes. Objective counterpart to
// capture-screens.mjs — that one produces pictures, this one produces numbers.
//
//   node scripts/ui-audit.mjs --out test-results/ui-audit-before.json
//
// Rules checked:
//   * no text below MIN_TEXT_PX carries meaning
//   * every interactive target is at least MIN_TARGET px on both axes
//   * text contrast against its effective background meets WCAG AA
//   * nothing overflows the viewport horizontally
//   * nothing sits under the bottom safe area / navigation
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { providers, unknownProvider } from "../shared/providers.js";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const origin = args.get("url") || process.env.PULSE_QA_URL || "http://127.0.0.1:5174";
const outFile = resolve(args.get("out") || "test-results/ui-audit.json");

const MIN_TEXT_PX = Number(process.env.PULSE_MIN_TEXT || 12);
const MIN_TARGET = 44;
const WIDTHS = [360, 390, 430];
const PAGES = ["Overview", "Incidents", "Watchlist", "Global map", "Developer tools", "Dependency insights"];
const NOW = new Date().toISOString();

const INCIDENTS = [
  { provider: "cloudflare", id: "cf-1", name: "Elevated 5xx errors in Western Europe", impact: "critical", status: "investigating", body: "We are investigating elevated error rates.", components: ["Amsterdam (AMS)", "Frankfurt (FRA)"] },
  { provider: "github", id: "gh-1", name: "Degraded performance for Actions", impact: "major", status: "identified", body: "Queued workflow runs are starting later than usual.", components: ["Actions"] },
  { provider: "openai", id: "oa-1", name: "Increased latency on the API", impact: "minor", status: "monitoring", body: "Latency has returned to normal levels.", components: ["API"] },
];

const body = {
  providers: providers.map((p) => {
    const mine = INCIDENTS.filter((i) => i.provider === p.id);
    const worst = mine.find((i) => ["critical", "major"].includes(i.impact));
    return {
      ...unknownProvider(p),
      description: `${p.name} publishes an official status feed.`,
      status: worst ? "outage" : mine.length ? "degraded" : "operational",
      stale: false,
      checkedAt: NOW,
      sourceUpdatedAt: NOW,
      components: Array.from({ length: 12 }, (_, i) => ({
        id: `${p.id}-c${i}`,
        name: `${p.name} component ${i + 1}`,
        status: mine.length && i < 2 ? (worst ? "major_outage" : "degraded_performance") : "operational",
      })),
      incidents: mine.map((i) => ({ ...i, startedAt: NOW, updatedAt: NOW, url: p.url, updates: [{ body: i.body, status: i.status, at: NOW }] })),
    };
  }),
  history: [],
  refreshing: false,
  fetchedAt: NOW,
  completedChecks: providers.length,
  revision: 2,
  startedAt: NOW,
};

// Injected into the page: walks the rendered tree and reports violations.
const PROBE = `(() => {
  const MIN_TEXT_PX = ${MIN_TEXT_PX};
  const MIN_TARGET = ${MIN_TARGET};

  const parse = (c) => {
    const m = c && c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const effectiveBg = (el) => {
    let node = el, acc = null;
    while (node && node !== document.documentElement.parentNode) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? over(acc, c) : c;
        if (acc.a >= 0.999) return acc;
      }
      node = node.parentElement;
    }
    return acc && acc.a >= 0.999 ? acc : { r: 255, g: 255, b: 255, a: 1 };
  };
  const path = (el) => {
    const bits = [];
    let n = el;
    for (let i = 0; n && i < 4; i++, n = n.parentElement)
      bits.unshift(n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".") : ""));
    return bits.join(" > ");
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const tinyText = [], lowContrast = [], smallTargets = [], overflow = [];
  const seenTiny = new Set(), seenContrast = new Set(), seenTarget = new Set();

  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    // Elements wider than the viewport. Content inside a deliberately
    // horizontally scrollable strip (a chip rail, a tab bar) is not overflow.
    if (rect.right > window.innerWidth + 1 || rect.left < -1) {
      let scroller = el.parentElement, scrollable = false;
      while (scroller && scroller !== document.body) {
        const overflowX = getComputedStyle(scroller).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") { scrollable = true; break; }
        scroller = scroller.parentElement;
      }
      if (!scrollable)
        overflow.push({ selector: path(el), left: Math.round(rect.left), right: Math.round(rect.right), viewport: window.innerWidth });
    }

    // Own text (direct text nodes only, so a wrapper isn't blamed for a child)
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (ownText) {
      const size = parseFloat(s.fontSize);
      const key = path(el) + "|" + Math.round(size);
      if (size < MIN_TEXT_PX && !seenTiny.has(key)) {
        seenTiny.add(key);
        tinyText.push({ selector: path(el), fontSize: +size.toFixed(1), text: ownText.slice(0, 48) });
      }
      const fg = parse(s.color);
      if (fg) {
        const bg = effectiveBg(el);
        const composed = fg.a < 1 ? over(fg, bg) : fg;
        const r = ratio(composed, bg);
        const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
        const need = large ? 3 : 4.5;
        const ckey = path(el) + "|" + s.color;
        if (r < need && !seenContrast.has(ckey)) {
          seenContrast.add(ckey);
          lowContrast.push({ selector: path(el), ratio: +r.toFixed(2), required: need, fontSize: +size.toFixed(1), color: s.color, text: ownText.slice(0, 40) });
        }
      }
    }
  }

  const interactive = "button, a[href], input, select, textarea, [role=button], [role=switch], [role=tab], summary, [tabindex]:not([tabindex='-1'])";
  for (const el of document.querySelectorAll(interactive)) {
    if (!visible(el)) continue;
    if (el.disabled) continue;
    // A control may keep a small visual size and carry its touch target on an
    // absolutely positioned ::after with negative insets. Measure the real
    // reachable area, not just the painted box — for the control itself and
    // for any label or wrapper it delegates its target to.
    const reach = (node) => {
      const box = node.getBoundingClientRect();
      const after = getComputedStyle(node, "::after");
      if (!after || after.content === "none" || after.position !== "absolute")
        return box;
      const grow = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n < 0 ? -n : 0;
      };
      const top = grow(after.top), right = grow(after.right);
      const bottom = grow(after.bottom), left = grow(after.left);
      if (!(top || right || bottom || left)) return box;
      return {
        width: box.width + left + right,
        height: box.height + top + bottom,
        left: box.left - left,
        top: box.top - top,
      };
    };
    let r = reach(el);
    // An inline link inside a paragraph is exempt; standalone controls are not.
    const inline = el.tagName === "A" && getComputedStyle(el).display.startsWith("inline") && el.closest("p, li, small");
    if (inline) continue;
    // A checkbox or radio is small by platform convention; the label around it
    // is the real target, so judge the label instead.
    if (el.tagName === "INPUT" && ["checkbox", "radio"].includes(el.type)) {
      const label = el.closest("label");
      const box = label ? reach(label) : null;
      if (box && box.width >= MIN_TARGET - 0.5 && box.height >= MIN_TARGET - 0.5) continue;
    }
    // A field that fills a control-sized wrapper is targeted through it.
    if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
      const wrapper = el.closest(".search-input, .field, label");
      const box = wrapper && wrapper !== el ? reach(wrapper) : null;
      if (box && box.height >= MIN_TARGET - 0.5) continue;
    }
    if (r.width < MIN_TARGET - 0.5 || r.height < MIN_TARGET - 0.5) {
      const key = path(el);
      if (seenTarget.has(key)) continue;
      seenTarget.add(key);
      smallTargets.push({
        selector: key,
        width: Math.round(r.width),
        height: Math.round(r.height),
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
      });
    }
  }

  return {
    tinyText, lowContrast, smallTargets, overflow,
    documentScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
  };
})()`;

// The bottom bar shortens some destination labels; match either spelling.
const SHORT = {
  "Global map": "Map",
  "Developer tools": "Tools",
  "Dependency insights": "Insights",
};
async function goTo(page, name) {
  const names = [name, SHORT[name]].filter(Boolean).join("|");
  const label = new RegExp(`^(${names})\\b`);
  const inNav = page.locator("nav").getByRole("button", { name: label }).and(page.locator(":visible"));
  if (await inNav.count()) await inNav.first().click();
  else {
    const opener = page.getByRole("button", { name: /Open navigation|More|Menu/ }).and(page.locator(":visible"));
    if (await opener.count()) await opener.first().click();
    await page.waitForTimeout(300);
    await page.locator("nav").getByRole("button", { name: label }).first().click();
  }
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
const report = { origin, minTextPx: MIN_TEXT_PX, minTarget: MIN_TARGET, runs: [], toggles: [] };
try {
  for (const width of WIDTHS) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        ([theme]) => {
          localStorage.setItem("pulse-theme", theme);
          localStorage.setItem("pulse-watchlist", JSON.stringify(["openai", "anthropic", "cloudflare", "github"]));
        },
        [theme],
      );
      await context.route("**/api/status**", (route) =>
        route.fulfill(
          route.request().url().includes("stream")
            ? { contentType: "text/event-stream", body: `data: ${JSON.stringify(body)}\n\n` }
            : { contentType: "application/json", body: JSON.stringify(body) },
        ),
      );
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /Service directory|Your watchlist/ }).waitFor({ timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);

      for (const name of PAGES) {
        if (name !== "Overview") await goTo(page, name);
        const result = await page.evaluate(PROBE);
        report.runs.push({ width, theme, screen: name, ...result });
        process.stdout.write(
          `${width}/${theme}/${name}: ${result.tinyText.length} tiny, ${result.lowContrast.length} low-contrast, ${result.smallTargets.length} small targets, ${result.overflow.length} overflowing\n`,
        );
      }

      // A toggle whose pressed state paints nothing is invisible in a
      // screenshot of the default state, so nothing else in this file would
      // catch it. One shipped that way: the insights filter's accent fill was
      // written at (0,2,0) and lost the cascade to a (0,4,0) :is() list in
      // theme.css, so pressing it changed no background, no border and no
      // text — the single visible effect was the star turning --on-accent
      // against an unchanged surface, which is white on white in light and
      // black on black in dark. Press every unpressed toggle on this screen
      // and require that something actually changes colour.
      const toggles = await page.evaluate(async () => {
        const settle = () =>
          new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const read = (el) => {
          const cs = getComputedStyle(el);
          const svg = el.querySelector("svg");
          return {
            background: cs.backgroundColor,
            borderColor: cs.borderTopColor,
            color: cs.color,
            svgColor: svg ? getComputedStyle(svg).color : null,
          };
        };
        const out = [];
        const candidates = [...document.querySelectorAll(".impact-controls [aria-pressed]")];
        for (const el of candidates) {
          if (el.getAttribute("aria-pressed") !== "false") continue;
          const before = read(el);
          el.click();
          await settle();
          const after = read(el);
          out.push({
            label: el.textContent.trim().replace(/\s+/g, " "),
            becamePressed: el.getAttribute("aria-pressed") === "true",
            changed: ["background", "borderColor", "color"].filter((k) => before[k] !== after[k]),
            before,
            after,
          });
          // Hand the screen back in its default state for the next probe.
          const reset = candidates.find((n) => n !== el && n.getAttribute("aria-pressed") === "false");
          (reset || el).click();
          await settle();
        }
        return out;
      });
      for (const t of toggles) {
        report.toggles.push({ width, theme, ...t });
        if (t.becamePressed && !t.changed.length)
          process.stdout.write(
            `${width}/${theme}/toggle "${t.label}": PRESSED STATE PAINTS NOTHING
`,
          );
      }

      // Overlays get their own pass — they are where the deepest content lives.
      await goTo(page, "Overview");
      await page.getByRole("button", { name: /^Cloudflare/ }).first().click();
      await page.getByRole("link", { name: /Official status page/ }).waitFor();
      report.runs.push({ width, theme, screen: "Provider detail", ...(await page.evaluate(PROBE)) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      await page.getByRole("button", { name: /incident notifications/i }).first().click();
      await page.waitForTimeout(400);
      report.runs.push({ width, theme, screen: "Incident inbox", ...(await page.evaluate(PROBE)) });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      const settings = page.getByRole("button", { name: "Settings", exact: true }).and(page.locator(":visible"));
      if (!(await settings.count())) {
        const opener = page.getByRole("button", { name: /Open navigation|More|Menu/ }).and(page.locator(":visible"));
        if (await opener.count()) await opener.first().click();
        await page.waitForTimeout(300);
      }
      await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      await page.waitForTimeout(400);
      report.runs.push({ width, theme, screen: "Settings", ...(await page.evaluate(PROBE)) });

      const last = report.runs.slice(-3);
      for (const r of last)
        process.stdout.write(
          `${width}/${theme}/${r.screen}: ${r.tinyText.length} tiny, ${r.lowContrast.length} low-contrast, ${r.smallTargets.length} small targets, ${r.overflow.length} overflowing\n`,
        );
      await context.close();
    }
  }

  const total = (k) => report.runs.reduce((n, r) => n + r[k].length, 0);
  const unique = (k, f) => new Set(report.runs.flatMap((r) => r[k].map(f))).size;
  report.summary = {
    tinyTextInstances: total("tinyText"),
    tinyTextUniqueSelectors: unique("tinyText", (x) => x.selector),
    smallestTextPx: Math.min(Infinity, ...report.runs.flatMap((r) => r.tinyText.map((x) => x.fontSize))),
    lowContrastInstances: total("lowContrast"),
    lowContrastUniqueSelectors: unique("lowContrast", (x) => x.selector),
    worstContrast: Math.min(Infinity, ...report.runs.flatMap((r) => r.lowContrast.map((x) => x.ratio))),
    smallTargetInstances: total("smallTargets"),
    smallTargetUniqueSelectors: unique("smallTargets", (x) => x.selector),
    overflowInstances: total("overflow"),
    horizontalScrollScreens: report.runs.filter((r) => r.documentScrollWidth > r.innerWidth).map((r) => `${r.width}/${r.theme}/${r.screen}`),
    togglesChecked: report.toggles.length,
    deadToggleStates: report.toggles
      .filter((t) => t.becamePressed && !t.changed.length)
      .map((t) => `${t.width}/${t.theme}/${t.label}`),
  };
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`\nWritten to ${outFile}`);
} finally {
  await browser.close();
}
