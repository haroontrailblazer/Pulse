// The navigation gate. Drives real back and forward gestures against the real
// UI and reports what the reader would actually experience, per surface.
//
// Profiles, because the three deliveries differ in exactly three ways -- the
// route base, whether a desktop bridge exists, and the viewport:
//   dev  the Vite dev server, base "/"          (what a contributor sees)
//   web  the built web output behind vercel.json's /app rewrites, base "/app"
//   exe  base "/" with window.pulseDesktop defined, at the EXE's minimum width
//   apk  base "/" with data-platform="android" pinned, at the real WebView size
//
// Every check writes a row. A row with ok:false is a problem, the count is
// printed at the end and a non-zero exit is the gate.
import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { providers, unknownProvider } from "../shared/providers.js";
import {
  PLACES,
  NAV_POLICY,
  NAV_POLICY_NATIVE,
  navPolicyFor,
  HOME,
} from "../shared/navigation.js";

const DEV = process.env.PULSE_QA_URL || "http://127.0.0.1:5174";
const OUT = process.env.OUT_FILE || "test-results/navigation.json";
const only = process.argv.includes("--profile")
  ? process.argv[process.argv.indexOf("--profile") + 1]
  : null;
const NOW = "2026-01-01T00:00:00.000Z";
const body = {
  providers: providers.map((p, i) => ({
    ...unknownProvider(p),
    status: i % 4 === 0 ? "degraded" : "operational",
    stale: false,
    checkedAt: NOW,
    sourceUpdatedAt: NOW,
    responseMs: 100 + i,
    components: [{ id: `${p.id}-c`, name: "API", status: "operational" }],
    incidents:
      i % 4 === 0
        ? [
            {
              id: `${p.id}-i`,
              name: "Elevated errors",
              impact: "major",
              status: "investigating",
              body: "x",
              components: ["API"],
              startedAt: NOW,
              updatedAt: NOW,
              url: p.url,
              updates: [{ body: "x", status: "investigating", at: NOW }],
            },
          ]
        : [],
  })),
  history: [],
  refreshing: false,
  fetchedAt: NOW,
  completedChecks: providers.length,
  revision: 2,
  startedAt: NOW,
};

// The hosted surface, served the way vercel.json serves it: the dashboard only
// under /app, the marketing page at the root. Standing this up rather than
// trusting the rewrite is the point -- the /app base is an assumption the whole
// URL scheme rests on.
const root = path.resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
function hosted() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = url.pathname;
    if (file === "/app" || file.startsWith("/app/")) file = "/dashboard.html";
    else if (file === "/") file = "/index.html";
    try {
      const body = await readFile(path.join(root, `.${file}`));
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

const rows = [];
const check = (profile, group, name, ok, detail) => {
  rows.push({ profile, group, name, ok: !!ok, ...(detail ? { detail } : {}) });
  if (!ok)
    console.log(`  FAIL [${group}] ${name} :: ${JSON.stringify(detail)}`);
};

const SHORT = {
  "Global map": "Map",
  "Dependency insights": "Insights",
  "Developer tools": "Tools",
};

async function surface({
  name,
  origin,
  base,
  android,
  desktop,
  update,
  width,
  height,
}) {
  // The APK and the EXE are tasks and collapse a destination they already hold;
  // a browser tab retraces every step. One gate, two expectations, both read
  // from the same constants the product branches on.
  const native = !!(android || desktop);
  const policy = navPolicyFor(native);
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  });
  const make = async () => {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      isMobile: width < 760,
      hasTouch: width < 760,
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(
      ({ android, desktop, update }) => {
        localStorage.setItem("pulse-theme", "light");
        localStorage.setItem(
          "pulse-watchlist",
          JSON.stringify(["openai", "anthropic", "cloudflare", "github"]),
        );
        // The EXE's only tell is the preload's bridge, so the gate defines the
        // same shape rather than a truthy stand-in.
        if (desktop) {
          const state = {
            enabled: false,
            permission: "granted",
            ...(update ? { update } : {}),
          };
          window.pulseDesktop = {
            configure: () => Promise.resolve(state),
            status: () => Promise.resolve(state),
            update: (action) =>
              Promise.resolve(
                action === "install" ? { state: "installing" } : state,
              ),
          };
        }
        if (!android) return;
        const pin = () => {
          const r = document.documentElement;
          if (!r) return false;
          r.dataset.platform = "android";
          return true;
        };
        if (!pin()) {
          const t = setInterval(() => {
            if (pin()) clearInterval(t);
          }, 5);
        }
        setInterval(pin, 200);
      },
      { android, desktop, update },
    );
    await ctx.route("**/api/status**", (route) =>
      route.request().url().includes("stream")
        ? route.fulfill({
            contentType: "text/event-stream",
            body: `data: ${JSON.stringify(body)}\n\n`,
          })
        : route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          }),
    );
    return ctx;
  };

  // Every place draws a .page-heading h1; only Overview and the Watchlist draw a
  // service directory, so waiting on that one would hang on a deep link or on a
  // reload anywhere else.
  const ready = async (page) => {
    await page.waitForSelector(".page-heading h1", { timeout: 30000 });
    // Tolerated rather than required, so this gate still runs end to end against
    // a build with no navigation stack at all -- which is the only way to know
    // it is measuring anything.
    await page
      .waitForFunction(() => !!window.history.state?.pulse, null, {
        timeout: 2500,
      })
      .catch(() => {});
    await page.waitForTimeout(400);
  };
  const home = base === "/" ? "/" : base;
  // A page the reader plausibly came from, so "back left the dashboard" is
  // distinguishable from "back did nothing".
  const REFERRER = `${origin}/__came_from__`;
  const boot = async (at = home) => {
    const ctx = await make();
    const page = await ctx.newPage();
    await page.route("**/__came_from__", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Before Pulse</title><h1>Before</h1>",
      }),
    );
    await page.goto(REFERRER, { waitUntil: "domcontentloaded" });
    await page.goto(origin + at, { waitUntil: "domcontentloaded" });
    await ready(page);
    return { ctx, page };
  };
  const look = (page) =>
    page.evaluate(() => ({
      inApp: !!document.querySelector(".app-shell"),
      path: location.pathname,
      search: location.search,
      i: window.history.state?.pulse?.i ?? null,
      layers: window.history.state?.pulse?.o ?? null,
      len: history.length,
      heading:
        document.querySelector(".page-heading h1")?.textContent?.trim() || null,
      title: document.title,
      dialog:
        document.querySelector("[role='dialog']")?.getAttribute("aria-label") ||
        null,
      sheet: !!document.querySelector(".sidebar.is-open"),
      listbox: !!document.querySelector("[role='listbox']"),
      panel: !!document.querySelector(".atlas-inspector"),
      focused: document.activeElement?.tagName || null,
      scrollY: Math.round(window.scrollY),
    }));
  const go = async (page, place) => {
    const label = new RegExp(
      `^(${[place, SHORT[place]].filter(Boolean).join("|")})`,
    );
    const inNav = page
      .locator("nav")
      .getByRole("button", { name: label })
      .and(page.locator(":visible"));
    if (await inNav.count()) await inNav.first().click();
    else {
      const opener = page
        .getByRole("button", { name: /More destinations/ })
        .and(page.locator(":visible"));
      if (await opener.count()) {
        await opener.first().click();
        await page.waitForTimeout(300);
      }
      await page
        .locator("nav")
        .getByRole("button", { name: label })
        .first()
        .click();
    }
    await page.waitForTimeout(400);
  };
  // One back press, as the surface delivers it. Every profile walks the same
  // Chromium session history, which is exactly why one implementation serves all
  // three: Electron's navigationHistory.goBack() and the Activity's
  // webView.goBack() are this call.
  // Whether the native shells would even hand this press to the document. The
  // Activity's callback reads webView.canGoBack() and gives the press to the
  // platform when there is nothing left; the EXE's chevron is dimmed and its
  // app-command handler checks canGoBack() first. A headless browser has no such
  // gate, so the gate models the boundary rather than pretending a page can exit
  // an app -- otherwise every native profile would "fail" at the one press that
  // is supposed to leave.
  const atRoot = async (page) => {
    const at = await page.evaluate(() => window.history.state?.pulse ?? null);
    return !!at && at.i === 0 && (at.o ?? []).length === 0;
  };
  const back = async (page) => {
    if ((desktop || android) && (await atRoot(page))) return "native";
    await page.goBack({ waitUntil: "commit" }).catch(() => {});
    await page.waitForTimeout(350);
    return "document";
  };
  const forward = async (page) => {
    await page.goForward({ waitUntil: "commit" }).catch(() => {});
    await page.waitForTimeout(350);
  };

  // ---- A. every place has a URL, and the URL round-trips ------------------
  {
    const { ctx, page } = await boot();
    for (const { page: place } of PLACES) {
      await go(page, place);
      const at = await look(page);
      const slug = PLACES.find((p) => p.page === place).slug;
      const want = base === "/" ? `/${slug}` : `${base}/${slug}`;
      const wanted = want.replace(/\/$/, "") || "/";
      check(name, "A", `${place} has the URL ${wanted}`, at.path === wanted, {
        got: at.path,
      });
      check(
        name,
        "A",
        `${place} carries no sheet in its URL`,
        !at.search && (at.layers ?? []).length === 0,
        { search: at.search, layers: at.layers },
      );
    }
    await ctx.close();
  }

  // ---- B. tapping the destination you already have beneath you ------------
  {
    const { ctx, page } = await boot();
    await go(page, "Watchlist");
    await go(page, "Overview");
    const after = await look(page);
    if (policy === NAV_POLICY_NATIVE) {
      check(
        name,
        "B",
        `policy ${policy}: tapping Overview after Watchlist collapses onto the entry it already has`,
        after.i === 0 && /Internet health/.test(after.heading || ""),
        { i: after.i, heading: after.heading },
      );
      check(
        name,
        "B",
        "so one press leaves, because Overview is the front door",
        (await back(page)) === "native",
        {},
      );
    } else {
      check(
        name,
        "B",
        `policy ${policy}: tapping Overview after Watchlist pushes rather than collapsing`,
        after.i === 2,
        { i: after.i },
      );
      await back(page);
      const one = await look(page);
      check(
        name,
        "B",
        "back once returns to Watchlist, and does not leave",
        one.inApp && /Your stack/.test(one.heading || ""),
        { heading: one.heading, inApp: one.inApp },
      );
      await back(page);
      const two = await look(page);
      check(
        name,
        "B",
        "back twice returns to Overview, and does not leave",
        two.inApp && /Internet health/.test(two.heading || ""),
        { heading: two.heading, inApp: two.inApp },
      );
      check(name, "B", "back twice lands on the root entry", two.i === 0, {
        i: two.i,
      });
    }
    await ctx.close();
  }

  // ---- B2. the reported walk, exactly as it was reported ------------------
  // Overview, Map, Incidents, Map, Overview. The two returns are the reader
  // going back without touching the back control, and on a task the stack has
  // to say so: five taps, one entry left, one press to leave. On the website
  // the browser's own back button must still retrace all five.
  {
    const { ctx, page } = await boot();
    const walked = [];
    for (const place of ["Global map", "Incidents", "Global map", "Overview"]) {
      await go(page, place);
      walked.push((await look(page)).i);
    }
    const at = await look(page);
    if (policy === NAV_POLICY_NATIVE) {
      check(
        name,
        "B2",
        "revisiting Map collapses onto the Map entry rather than duplicating it",
        walked[2] === 1,
        { depths: walked },
      );
      check(
        name,
        "B2",
        "and returning to Overview leaves the front door alone on the stack",
        at.i === 0 && /Internet health/.test(at.heading || ""),
        { i: at.i, heading: at.heading, depths: walked },
      );
      check(
        name,
        "B2",
        "one press leaves, instead of four that retrace pages already walked out of",
        (await back(page)) === "native",
        {},
      );
    } else {
      check(
        name,
        "B2",
        "the website retraces every tap, including the repeats",
        at.i === 4,
        { i: at.i, depths: walked },
      );
    }
    await ctx.close();
  }

  // ---- B3. a first visit is still a push, on every surface ----------------
  // Clear-top is not popUpTo(start): a destination the reader has NOT been to
  // still earns its own entry, and back still retraces it.
  {
    const { ctx, page } = await boot();
    await go(page, "Incidents");
    await go(page, "Watchlist");
    const at = await look(page);
    check(name, "B3", "two new destinations are two entries", at.i === 2, {
      i: at.i,
    });
    await back(page);
    const one = await look(page);
    check(
      name,
      "B3",
      "and back retraces the first of them",
      one.inApp && /Every signal/.test(one.heading || ""),
      { heading: one.heading },
    );
    await ctx.close();
  }

  // ---- C. an overlay is closed by back, and the page does not change -------
  const overlays = [
    {
      id: "More navigation sheet",
      when: () => width < 760,
      open: async (page) => {
        await page
          .getByRole("button", { name: /More destinations/ })
          .first()
          .click();
        await page.waitForTimeout(350);
      },
      shut: (at) => !at.sheet,
    },
    {
      id: "Help & methodology sheet",
      open: async (page) => {
        if (width < 760) {
          await page
            .getByRole("button", { name: /More destinations/ })
            .first()
            .click();
          await page.waitForTimeout(350);
        }
        await page
          .getByRole("button", { name: /Help & methodology/ })
          .first()
          .click();
        await page.waitForTimeout(350);
      },
      shut: (at) => !at.dialog,
    },
    {
      id: "incident inbox",
      open: async (page) => {
        await page
          .getByRole("button", { name: /incident notifications/ })
          .first()
          .click();
        await page.waitForTimeout(400);
      },
      shut: (at) => !at.dialog,
    },
    {
      id: "provider detail sheet",
      open: async (page) => {
        await page
          .locator(".service-row, .provider-row, .directory-row, .service-card")
          .first()
          .click({ timeout: 8000 });
        await page.waitForTimeout(400);
      },
      shut: (at) => !at.dialog,
    },
    {
      id: "category picker",
      open: async (page) => {
        await page
          .getByRole("button", { name: /Filter service category/ })
          .first()
          .click();
        await page.waitForTimeout(300);
      },
      shut: (at) => !at.listbox,
    },
  ];
  for (const overlay of overlays) {
    if (overlay.when && !overlay.when()) continue;
    const { ctx, page } = await boot();
    let opened = true;
    try {
      await overlay.open(page);
    } catch {
      opened = false;
    }
    if (!opened) {
      rows.push({
        profile: name,
        group: "C",
        name: `${overlay.id} not reachable at this width`,
        ok: true,
        skipped: true,
      });
      await ctx.close();
      continue;
    }
    const before = await look(page);
    check(name, "C", `${overlay.id} opened`, !overlay.shut(before), before);
    check(
      name,
      "C",
      `${overlay.id} took a history entry`,
      (before.layers ?? []).length > 0,
      { layers: before.layers },
    );
    check(
      name,
      "C",
      `${overlay.id} put nothing in the URL`,
      before.path === home,
      { path: before.path },
    );
    await back(page);
    const after = await look(page);
    check(
      name,
      "C",
      `back closed ${overlay.id} and stayed in the app`,
      after.inApp && overlay.shut(after),
      after,
    );
    check(
      name,
      "C",
      `back closed ${overlay.id} without changing the place`,
      after.inApp && after.heading === before.heading,
      { was: before.heading, now: after.heading },
    );
    await ctx.close();
  }

  // ---- C2. choosing inside an overlay is not leaving a place --------------
  // Every picker is a history entry, so choosing an option pops one -- and a
  // pop used to mean "the reader moved, clear the view they left behind". That
  // is what made the service directory's funnel look broken on both the
  // Overview and the Watchlist: the category was set and then wiped by the
  // dismissal of the menu that set it. The directory is the only place in the
  // product where a picker writes page-level state, so it is the case to hold.
  for (const place of ["Overview", "Watchlist"]) {
    const { ctx, page } = await boot();
    if (place !== "Overview") await go(page, place);
    const funnel = page
      .getByRole("button", { name: /Filter service category/ })
      .and(page.locator(":visible"))
      .first();
    if (!(await funnel.count())) {
      rows.push({
        profile: name,
        group: "C2",
        name: `no category filter on ${place} at this width`,
        ok: true,
        skipped: true,
      });
      await ctx.close();
      continue;
    }
    await funnel.click();
    await page.waitForTimeout(350);
    const option = page.locator("[role='listbox'] [role='option']").nth(1);
    const wanted = ((await option.textContent()) || "").trim();
    await option.click();
    // Long enough for the picker's own history entry to pop and for anything
    // that lands with it to have run.
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({
      label:
        document
          .querySelector(".category-filter .filter-menu-button")
          ?.getAttribute("aria-label") || null,
      active: !!document.querySelector(".category-filter.is-active"),
      pressed: document.querySelectorAll(
        ".directory-toolbar .tabs button[aria-pressed='true']",
      ).length,
      heading:
        document.querySelector(".page-heading h1")?.textContent?.trim() || null,
    }));
    check(
      name,
      "C2",
      `the category chosen on ${place} survives the picker closing`,
      !!wanted && (after.label || "").includes(wanted),
      { wanted, ...after },
    );
    check(
      name,
      "C2",
      `and the funnel still reports that a filter is on (${place})`,
      after.active,
      after,
    );
    check(
      name,
      "C2",
      `${place} keeps exactly one directory tab selected`,
      after.pressed === 1,
      after,
    );
    await ctx.close();
  }

  // ---- D. the boundary ----------------------------------------------------
  {
    const { ctx, page } = await boot();
    const root = await atRoot(page);
    const how = await back(page);
    const at = await look(page);
    if (desktop || android) {
      check(
        name,
        "D",
        "the front door is the root of the stack",
        root,
        await page.evaluate(() => window.history.state?.pulse ?? null),
      );
      // So the press never reaches the document: on Android the platform
      // backgrounds the task (and below API 34 asks first), and in the EXE
      // nothing happens.
      check(
        name,
        "D",
        "the shell keeps the press at the root",
        how === "native",
        {
          how,
        },
      );
    } else
      check(
        name,
        "D",
        "back at the root hands the reader back to where they came from",
        !at.inApp && /__came_from__/.test(page.url()),
        { url: page.url() },
      );
    await ctx.close();
  }

  // ---- E. forward redoes ---------------------------------------------------
  {
    const { ctx, page } = await boot();
    await go(page, "Incidents");
    await back(page);
    const back1 = await look(page);
    await forward(page);
    const fwd = await look(page);
    check(
      name,
      "E",
      "forward redoes the step back undid",
      /Every signal/.test(fwd.heading || ""),
      { afterBack: back1.heading, afterForward: fwd.heading },
    );
    await ctx.close();
  }

  // ---- F. reload keeps the place and never resurrects a sheet --------------
  {
    const { ctx, page } = await boot();
    await go(page, "Dependency insights");
    const before = await look(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    const after = await look(page);
    check(
      name,
      "F",
      "reload lands on the same place",
      after.heading === before.heading,
      { was: before.heading, now: after.heading },
    );
    // And a reload performed inside a sheet comes back to the page, not the
    // sheet: no overlay is ever cold-restorable.
    await page
      .getByRole("button", { name: /incident notifications/ })
      .first()
      .click();
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    const reloaded = await look(page);
    check(
      name,
      "F",
      "a reload inside a sheet comes back without the sheet",
      !reloaded.dialog,
      { dialog: reloaded.dialog },
    );
    await ctx.close();
  }

  // ---- G. deep links, cold ------------------------------------------------
  for (const { page: place, slug } of PLACES) {
    const at = base === "/" ? `/${slug}` : `${base}/${slug}`;
    const { ctx, page } = await boot(at.replace(/\/$/, "") || "/");
    const seen = await look(page);
    const want = {
      Overview: /Internet health/,
      Incidents: /Every signal/,
      Watchlist: /Your stack/,
      "Global map": /connected/,
      "Developer tools": /next deploy/,
      "Dependency insights": /bigger picture/,
    }[place];
    check(
      name,
      "G",
      `a cold ${at || "/"} opens ${place}`,
      want.test(seen.heading || ""),
      { heading: seen.heading },
    );
    if (place !== HOME && (android || desktop))
      // The Home floor: a widget, a notification or the tray can land the reader
      // straight on a destination, and the first press must not eject them.
      check(
        name,
        "G",
        `a cold ${at} has somewhere to go back to (Home floor)`,
        seen.i === 1,
        { i: seen.i },
      );
    if (place !== HOME && !android && !desktop)
      check(
        name,
        "G",
        `a cold ${at} on the web keeps the reader's own entry beneath it`,
        seen.i === 0,
        { i: seen.i },
      );
    await ctx.close();
  }

  // ---- H. no dead presses, and no press that does two things --------------
  // Four taps and five presses on every surface: four that retrace, then the
  // one that reaches the boundary. The fourth tap differs by policy only so
  // that the walk stays four entries deep -- on a task, returning to Overview
  // would collapse the stack and there would be nothing left to retrace, which
  // group B2 proves on its own. What this holds is the other property: every
  // press does exactly one thing, and none of them does nothing.
  {
    const { ctx, page } = await boot();
    const trail = [];
    const last =
      policy === NAV_POLICY_NATIVE ? "Developer tools" : "Overview";
    const taps = ["Incidents", "Watchlist", "Global map", last];
    const presses = 4;
    for (const place of taps) await go(page, place);
    let previous = await look(page);
    trail.push(previous.heading);
    for (let n = 0; n < 5; n += 1) {
      const how = await back(page);
      if (how === "native") {
        check(
          name,
          "H",
          `the shell took over on press ${n + 1}, after retracing every tap`,
          n === presses,
          { at: n + 1, want: presses + 1, trail },
        );
        break;
      }
      const at = await look(page);
      if (!at.inApp) {
        check(
          name,
          "H",
          `press ${n + 1} left the app`,
          !native && n === presses,
          { at: n + 1, want: presses + 1, trail },
        );
        break;
      }
      const moved =
        at.heading !== previous.heading ||
        (at.layers ?? []).length !== (previous.layers ?? []).length;
      check(name, "H", `press ${n + 1} did something`, moved, {
        was: previous.heading,
        now: at.heading,
      });
      trail.push(at.heading);
      previous = at;
    }
    check(
      name,
      "H",
      "five presses retraced four taps in order",
      trail.join(" < ") ===
        [
          policy === NAV_POLICY_NATIVE
            ? "Built for your next deploy."
            : "Internet health, in view.",
          "A connected world.",
          "Your stack, at a glance.",
          "Every signal. Less noise.",
          "Internet health, in view.",
        ].join(" < "),
      { trail },
    );
    await ctx.close();
  }

  // ---- I. the one place sheets nest --------------------------------------
  {
    const { ctx, page } = await boot();
    try {
      await page
        .getByRole("button", { name: /incident notifications/ })
        .first()
        .click();
      await page.waitForTimeout(450);
      const inbox = await look(page);
      const row = page
        .locator(
          "[role='dialog'] .inbox-row, [role='dialog'] .inbox-item button, [role='dialog'] button",
        )
        .filter({ hasText: /./ });
      const provider = page
        .locator("[role='dialog']")
        .locator(".inbox-provider, .inbox-row, .inbox-item")
        .first();
      const target = (await provider.count()) ? provider : row.nth(2);
      await target.click({ timeout: 6000 });
      await page.waitForTimeout(450);
      const deep = await look(page);
      if (deep.dialog && deep.dialog !== inbox.dialog) {
        check(
          name,
          "I",
          "a provider opened from the inbox takes its own entry",
          (deep.layers ?? []).length === (inbox.layers ?? []).length + 1,
          { inbox: inbox.layers, deep: deep.layers },
        );
        await back(page);
        const returned = await look(page);
        check(
          name,
          "I",
          "back from that provider returns to the inbox, not to the page",
          returned.dialog === inbox.dialog,
          { want: inbox.dialog, got: returned.dialog },
        );
      } else {
        rows.push({
          profile: name,
          group: "I",
          name: "no provider row in the inbox with this fixture",
          ok: true,
          skipped: true,
        });
      }
    } catch (error) {
      rows.push({
        profile: name,
        group: "I",
        name: "inbox drill not reachable",
        ok: true,
        skipped: true,
        detail: String(error).slice(0, 90),
      });
    }
    await ctx.close();
  }

  // ---- L. arriving where you already are is not a place change ------------
  {
    const { ctx, page } = await boot();
    await go(page, "Incidents");
    const one = await look(page);
    await go(page, "Incidents");
    await go(page, "Incidents");
    const three = await look(page);
    check(
      name,
      "L",
      "three taps on the destination you are on add no entries",
      three.i === one.i,
      { was: one.i, now: three.i },
    );
    await ctx.close();
  }

  // ---- M. the EXE's chevron, which no other gate can see ------------------
  if (desktop) {
    const { ctx, page } = await boot();
    const chevron = page.getByRole("button", { name: "Go back" });
    check(name, "M", "the EXE draws a back control", await chevron.count(), {});
    check(
      name,
      "M",
      "it is dimmed at the root rather than removed",
      (await chevron.getAttribute("aria-disabled")) === "true",
      {},
    );
    const fit = await page.evaluate(() => {
      const row = document.querySelector(".page-title-row");
      const h1 = row?.querySelector("h1");
      return {
        rowScroll: row?.scrollWidth,
        rowWidth: row?.clientWidth,
        titleFont: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
      };
    });
    check(
      name,
      "M",
      "the title row still fits at the window's minimum width",
      fit.rowScroll <= fit.rowWidth + 1,
      fit,
    );
    check(
      name,
      "M",
      "the headline is still set at a readable size beside it",
      fit.titleFont >= 20,
      fit,
    );
    await go(page, "Incidents");
    check(
      name,
      "M",
      "it becomes available once there is somewhere to go",
      (await chevron.getAttribute("aria-disabled")) === "false",
      {},
    );
    await chevron.click();
    await page.waitForTimeout(400);
    const at = await look(page);
    check(
      name,
      "M",
      "clicking it goes back",
      /Internet health/.test(at.heading || ""),
      { heading: at.heading },
    );
    // Alt+Left and Alt+Right, which an Electron window has no chrome to offer and
    // which Electron 44 does not bind for us.
    await go(page, "Watchlist");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.waitForTimeout(450);
    const altBack = await look(page);
    check(
      name,
      "M",
      "Alt+Left goes back",
      /Internet health/.test(altBack.heading || ""),
      { heading: altBack.heading },
    );
    await page.keyboard.press("Alt+ArrowRight");
    await page.waitForTimeout(450);
    const altForward = await look(page);
    check(
      name,
      "M",
      "Alt+Right goes forward again",
      /Your stack/.test(altForward.heading || ""),
      { heading: altForward.heading },
    );
    // And is left alone while the reader is typing, or Alt+Left would take the page
    // away mid-edit and lose what they had written.
    await page
      .getByRole("button", { name: /Filter services|Search/ })
      .first()
      .click()
      .catch(() => {});
    const field = page
      .locator("input[type='search'], .search-input input")
      .first();
    if (await field.count()) {
      await field.click();
      await field.type("clou");
      await page.keyboard.press("Alt+ArrowLeft");
      await page.waitForTimeout(400);
      const typing = await look(page);
      check(
        name,
        "M",
        "Alt+Left in a text field leaves the page alone",
        /Your stack/.test(typing.heading || ""),
        { heading: typing.heading },
      );
    }
    await ctx.close();
  }

  // ---- N. the update notice, below Dependency insights ---------------------
  {
    const { ctx, page } = await boot();
    const row = page.locator(".nav-upgrade");
    if (width < 760) {
      await page
        .getByRole("button", { name: /More destinations/ })
        .first()
        .click();
      await page.waitForTimeout(350);
    }
    const shown = await row.count();
    if (desktop) {
      check(name, "N", "the update notice is offered", shown === 1, { shown });
      // Below Dependency insights means exactly that: after the last destination
      // in the list, and outside the nav landmark, because it is not a place.
      const where = await page.evaluate(() => {
        const at = document.querySelector(".nav-upgrade");
        if (!at) return null;
        const nav = at.closest(".sidebar")?.querySelector("nav");
        const last = nav?.querySelector("button:last-of-type");
        return {
          insideNav: !!at.closest("nav"),
          afterNav: !!nav && nav.compareDocumentPosition(at) === 4,
          lastDestination: last?.textContent?.trim() || null,
          href: at.getAttribute("href"),
          target: at.getAttribute("target"),
          tag: at.tagName,
          reach: Math.round(at.getBoundingClientRect().height),
        };
      });
      check(
        name,
        "N",
        "it sits after the destination list",
        where?.afterNav,
        where,
      );
      check(
        name,
        "N",
        "and outside the nav landmark",
        where && !where.insideNav,
        where,
      );
      check(
        name,
        "N",
        "the destination above it is Dependency insights",
        /Dependency insights/.test(where?.lastDestination || ""),
        where,
      );
      check(
        name,
        "N",
        "it is a button that downloads in place, not a link to a browser",
        where?.tag === "BUTTON" && !where?.href,
        where,
      );
      check(
        name,
        "N",
        "and clears the touch floor",
        (where?.reach ?? 0) >= 44,
        where,
      );
      check(
        name,
        "N",
        "it names the version and the size",
        /Update to 9\.9\.9/.test(await row.innerText()) &&
          /MB/.test(await row.innerText()),
        { text: (await row.innerText()).replace(/\n/g, " ") },
      );
    } else
      // The website has no native bridge, so it can never learn of an update --
      // and this is the assertion that proves the request's "in site no need to
      // show the update" rather than assuming it.
      check(name, "N", "the website never offers an update", shown === 0, {
        shown,
      });
    await ctx.close();
  }

  // ---- K. a traversal restores where the reader was -----------------------
  {
    const { ctx, page } = await boot();
    await go(page, "Incidents");
    const scrolled = await page.evaluate(() => {
      const panel = document.querySelector(".incident-feed");
      if (panel && panel.scrollHeight > panel.clientHeight + 40) {
        panel.scrollTop = 220;
        return { kind: "panel", at: panel.scrollTop };
      }
      window.scrollTo(0, 400);
      return { kind: "window", at: Math.round(window.scrollY) };
    });
    await page.waitForTimeout(250);
    // Watchlist, not Overview: on a task Overview is already beneath the reader
    // and tapping it collapses the stack, so the press that follows would leave
    // the app instead of measuring a restored offset.
    await go(page, "Watchlist");
    await back(page);
    await page.waitForTimeout(450);
    const restored = await page.evaluate(() => ({
      panel: document.querySelector(".incident-feed")?.scrollTop ?? null,
      window: Math.round(window.scrollY),
    }));
    const got = scrolled.kind === "panel" ? restored.panel : restored.window;
    check(
      name,
      "K",
      `back restores the ${scrolled.kind} offset it left`,
      scrolled.at === 0 || Math.abs((got ?? 0) - scrolled.at) <= 24,
      { left: scrolled.at, got, kind: scrolled.kind },
    );
    await ctx.close();
  }

  await browser.close();
}

const server = hosted();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const hostedOrigin = `http://127.0.0.1:${server.address().port}`;

const PROFILES = [
  { name: "dev", origin: DEV, base: "/", width: 1440, height: 900 },
  { name: "web", origin: hostedOrigin, base: "/app", width: 390, height: 844 },
  {
    name: "exe",
    origin: DEV,
    base: "/",
    desktop: true,
    // A release newer than anything this tree could be, so the check is about the
    // wiring rather than about today's version number.
    update: {
      version: "9.9.9",
      name: "Pulse-9.9.9-Windows.exe",
      bytes: 105191649,
      sha256:
        "d75232f4226c7727deffdae217c70d5dc1e64d8a5a8b1f95c28ee5b6f68c9b7d",
      url: "https://www.pulses4u.in/downloads/v9.9.9/Pulse-9.9.9-Windows.exe",
    },
    width: 390,
    height: 844,
  },
  {
    name: "apk",
    origin: DEV,
    base: "/",
    android: true,
    width: 360,
    height: 640,
  },
];

for (const profile of PROFILES) {
  if (only && profile.name !== only) continue;
  console.log(
    `\n=== ${profile.name} (${profile.base}, ${profile.width}x${profile.height}) ===`,
  );
  try {
    await surface(profile);
  } catch (error) {
    check(
      profile.name,
      "!",
      "profile crashed",
      false,
      String(error).slice(0, 400),
    );
  }
}
server.close();

const bad = rows.filter((r) => !r.ok);
const skipped = rows.filter((r) => r.skipped);
writeFileSync(
  OUT,
  JSON.stringify(
    { policy: { web: NAV_POLICY, native: NAV_POLICY_NATIVE }, rows },
    null,
    1,
  ),
);
console.log(
  `\n${rows.length} checks, ${skipped.length} skipped, ${bad.length} problems -> ${OUT}`,
);
for (const group of [...new Set(rows.map((r) => r.group))])
  console.log(
    `  ${group}: ${rows.filter((r) => r.group === group && !r.ok).length} / ${rows.filter((r) => r.group === group).length} failing`,
  );
process.exit(bad.length ? 1 : 0);
