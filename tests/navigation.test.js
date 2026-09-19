import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HOME,
  NAV_POLICY,
  PLACES,
  pageFor,
  pathFor,
  placeFromLocation,
  resolveBase,
} from "../shared/navigation.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("every place round-trips through its URL at both bases", () => {
  // The hosted site answers at /app and the EXE, the APK and the dev server all
  // answer at /, so one bundle has to be correct at either base.
  for (const base of ["/", "/app"])
    for (const { page } of PLACES)
      assert.equal(
        pageFor(pathFor(page, base), base),
        page,
        `${page} did not survive ${base}`,
      );
});

test("no slug contains a dot", () => {
  // Both extension-less fallbacks this product depends on key off one:
  // server/index.js tests path.extname before falling back to index.html, and
  // Capacitor's WebViewLocalServer tests getLastPathSegment().contains(".").
  // A slug with a dot would 404 in the EXE and fail to reload in the APK.
  for (const { slug } of PLACES) assert.ok(!slug.includes("."), slug);
});

test("slugs are unique and Overview is the root", () => {
  const slugs = PLACES.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(PLACES.find((p) => p.page === HOME).slug, "");
  assert.equal(pathFor(HOME, "/"), "/");
  assert.equal(pathFor(HOME, "/app"), "/app");
});

test("the route table covers exactly the destinations the app renders", () => {
  // A destination with no slug would be unreachable by URL and would have no
  // entry to go back to; a slug with no destination would resolve to Overview.
  const app = read("src/App.jsx");
  const declared = app
    .slice(
      app.indexOf("const navigation = ["),
      app.indexOf("];", app.indexOf("const navigation = [")),
    )
    .matchAll(/\{ name: "([^"]+)"/g);
  const names = [...declared].map((m) => m[1]);
  assert.deepEqual(names.sort(), PLACES.map((p) => p.page).sort());
});

test("the base is read off the document's own path", () => {
  assert.equal(resolveBase("/"), "/");
  assert.equal(resolveBase("/incidents"), "/");
  assert.equal(resolveBase("/app"), "/app");
  assert.equal(resolveBase("/app/incidents"), "/app");
  // The hosted build also answers, unrewritten, at its physical filename;
  // routing that under / would rewrite the reader's URL to paths the host serves
  // the marketing page from.
  assert.equal(resolveBase("/dashboard.html"), "/app");
  // Not a prefix match: /apple is not the dashboard.
  assert.equal(resolveBase("/apples"), "/");
});

test("an unknown path resolves to Overview rather than to nothing", () => {
  assert.equal(pageFor("/nonsense", "/"), HOME);
  assert.equal(pageFor("/app/nonsense", "/app"), HOME);
  assert.equal(pageFor("/incidents/extra", "/"), HOME);
});

test("a trailing slash is the same place", () => {
  assert.equal(pageFor("/incidents/", "/"), "Incidents");
  assert.equal(pageFor("/app/incidents/", "/app"), "Incidents");
});

test("the legacy ?watchlist entry point still opens the Watchlist", () => {
  // The tray menu inside every portable EXE already on a reader's disk loads
  // "/?watchlist=1", and the app has always tested for the parameter's presence
  // rather than its value. Both spellings are frozen.
  for (const search of [
    "?watchlist=1",
    "?watchlist",
    "?watchlist=0",
    "?a=1&watchlist=x",
  ]) {
    const at = placeFromLocation({ pathname: "/", search });
    assert.equal(at.page, "Watchlist", search);
    assert.equal(at.canonical, false, `${search} should be canonicalised away`);
  }
  assert.equal(placeFromLocation({ pathname: "/", search: "" }).page, HOME);
  assert.equal(
    placeFromLocation({ pathname: "/app/map", search: "" }).page,
    "Global map",
  );
  assert.equal(
    placeFromLocation({ pathname: "/app/map", search: "" }).canonical,
    true,
  );
});

test("exactly one module touches window.history", () => {
  // The whole design depends on there being one stack and one popstate listener.
  // A second writer anywhere would desync the screen from the history.
  const offenders = [];
  for (const file of [
    "src/App.jsx",
    "src/WorldMap.jsx",
    "src/FilterMenu.jsx",
    "src/LiveConsole.jsx",
    "src/InsightDetails.jsx",
    "src/SecurityLab.jsx",
    "src/IncidentInbox.jsx",
    "src/BackgroundSettings.jsx",
    "src/main.jsx",
  ]) {
    const body = read(file);
    if (/\b(pushState|replaceState)\s*\(/.test(body))
      offenders.push(`${file}: writes history`);
    if (/addEventListener\(\s*["']popstate/.test(body))
      offenders.push(`${file}: listens for popstate`);
  }
  assert.deepEqual(offenders, []);
  const nav = read("src/navigation.js");
  assert.equal((nav.match(/addEventListener\(\s*"popstate"/g) || []).length, 1);
});

test("the navigation policy is stated once, where the gate can read it", () => {
  assert.equal(NAV_POLICY, "linear");
  assert.match(read("scripts/check-navigation.mjs"), /NAV_POLICY/);
});

test("the APK's back press is dispatched, and decided in the web layer", () => {
  const activity = read(
    "android/app/src/main/java/app/pulse/status/MainActivity.java",
  );
  // Comments in this file discuss canGoBack() at length, so the code has to be
  // read without them -- matching the prose would pass for the wrong reason.
  const code = activity
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  // Targeting SDK 36 means predictive back is on by default, so the deprecated
  // onBackPressed() override is not the hook the platform calls.
  assert.match(code, /getOnBackPressedDispatcher\(\)\.addCallback/);
  assert.ok(
    !/void\s+onBackPressed\s*\(/.test(code),
    "must not override the deprecated onBackPressed",
  );
  // Measured on API 36: WebView.canGoBack() does not see history.pushState
  // entries, so reading it here would report nowhere to go while Pulse still had
  // a sheet open. The web layer reports and acts; this only dispatches.
  assert.ok(
    !/\.canGoBack\(\)/.test(code),
    "the Activity must not decide from canGoBack()",
  );
  assert.match(code, /PulseBackground\.dispatchBack\(\)/);
  assert.match(code, /void\s+syncBack\(boolean/);
  // BridgeActivity declares onResume public, and Java forbids narrowing an
  // inherited method, so this would not compile as protected.
  assert.ok(!/protected\s+void\s+onResume/.test(code));
  assert.match(code, /public\s+void\s+onResume/);
  const plugin = read(
    "android/app/src/main/java/app/pulse/status/PulseBackground.java",
  );
  assert.match(plugin, /setBackAvailable/);
  assert.match(plugin, /leaveApp/);
  // A press nobody was listening for must be dropped, never replayed later.
  assert.match(
    plugin,
    /notifyListeners\("backPressed",new JSObject\(\),false\)/,
  );
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
  assert.match(manifest, /android:launchMode="singleTask"/);
});

test("the EXE picks up the mouse's own back button and adds no menu", () => {
  const main = read("desktop/main.cjs");
  assert.match(main, /app-command/);
  assert.match(main, /browser-backward/);
  assert.match(main, /navigationHistory/);
  // Taking ownership of the menu would mean re-adding Electron's defaults and
  // risking a visible menu bar that moves the viewport every gate measures.
  assert.ok(!/setApplicationMenu/.test(main));
  assert.match(main, /autoHideMenuBar: true/);
  // The back wiring itself needed no IPC. The preload carries a third method now,
  // for the in-app update download, and the exact count is kept so a fourth is
  // also somebody's decision.
  assert.equal(
    read("desktop/preload.cjs").match(/ipcRenderer\.invoke/g).length,
    3,
  );
  assert.ok(!/pulse:back|pulse:navigate/.test(read("desktop/preload.cjs")));
});

test("no overlay is ever named in a URL", () => {
  // A shared link that opens a sheet over a page the reader did not choose is
  // neither a page nor a sheet, and a reload could resurrect chrome they
  // dismissed. Overlays are history entries with no URL, so the route table has
  // no slug for one.
  const kinds = [
    "provider",
    "monitor",
    "notifications",
    "settings",
    "methodology",
    "apps",
  ];
  for (const kind of kinds)
    assert.ok(
      !PLACES.some((p) => p.slug === kind),
      `${kind} must not be routable`,
    );
});
