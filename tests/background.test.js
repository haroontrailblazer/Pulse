import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import background from "../desktop/background.cjs";
import { createMonitor, REFRESH_MS, DESKTOP_REFRESH_MS } from "../shared/monitor.js";
import { providers } from "../shared/providers.js";
import { nextAlert } from "../shared/alerts.js";
import * as updates from "../shared/updates.js";

const reading = (p, status = "degraded") => ({ ...p, status, checkedAt: new Date().toISOString(), components: [], incidents: [] });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("passive alert observers receive fast REST readings before a slow feed without starting polling", async () => {
  let finish;
  const slow = new Promise((resolve) => { finish = resolve; });
  const catalog = providers.slice(0, 2);
  let calls = 0;
  const monitor = createMonitor({ catalog, fetcher: async (p) => {
    calls++;
    if (p.id === catalog[1].id) await slow;
    return reading(p);
  } });
  const received = [];
  const detach = monitor.observeReadings((p) => received.push(p));
  assert.equal(calls, 0);
  const refresh = monitor.refresh();
  await tick();
  assert.equal(received.length, 1);
  assert.equal(monitor.snapshot().refreshing, true);
  finish();
  await refresh;
  detach();
  assert.equal(received.length, 2);
  assert.equal(monitor.snapshot().refreshSeconds, 30);
});

test("desktop isolates failed feeds, alerts newly watched services, deduplicates and detaches", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-alert-test-"));
  const catalog = providers.slice(0, 3);
  let listener, detached = false;
  const notifications = [];
  class Notification {
    static isSupported() { return true; }
    constructor(options) { this.options = options; }
    on() {}
    show() { notifications.push(this.options); }
  }
  const controller = await background({
    app: { getPath: () => dir, getVersion: () => "1.0.20" }, Notification, powerMonitor: { on() {} }, open() {},
    // This test is about the watchlist monitor, so the daily update check is
    // pinned off rather than left to reach the network from a unit test. The
    // check has its own test below.
    services: [{ providers: catalog }, {
      monitor: { snapshot: () => ({ providers: [] }), observeReadings(fn) { listener = fn; return () => { detached = true; }; } },
      fetchProvider: async (p) => { if (p.id === catalog[0].id) throw Error("offline"); return reading(p); },
    }, { nextAlert }, { REFRESH_MS, DESKTOP_REFRESH_MS }, { ...updates, dueFrom: () => false }],
  });
  t.after(() => { controller.stop(); rmSync(dir, { recursive: true, force: true }); });
  controller.configure({ enabled: true, watchlist: catalog.slice(0, 2).map((p) => p.id) });
  await tick();
  assert.equal(notifications.length, 1, "a failed provider must not skip subsequent alerts");
  controller.configure({ watchlist: catalog.map((p) => p.id) });
  await tick();
  assert.equal(notifications.length, 2, "newly watched services are checked immediately");
  listener(reading(catalog[2]));
  assert.equal(notifications.length, 2, "foreground and background checks share deduplication");
  listener(reading(catalog[2], "outage"));
  assert.equal(notifications.length, 3, "a new severity alerts as soon as its feed arrives");
  assert.ok(controller.status().lastCheckedAt);
  controller.stop();
  assert.equal(detached, true);
});

test("the desktop update check notifies once per release, reaches the renderer, and stays quiet when it cannot look", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-update-test-"));
  const notifications = [];
  class Notification {
    static isSupported() { return true; }
    constructor(options) { this.options = options; }
    on() {}
    show() { notifications.push(this.options); }
  }
  const manifest = (version) => ({
    version,
    checksums: `https://pulse-status-zeta.vercel.app/downloads/v${version}/SHA256SUMS.txt`,
    assets: {
      windows: {
        name: `Pulse-${version}-Windows.exe`,
        bytes: 105191649,
        sha256: "d75232f4226c7727deffdae217c70d5dc1e64d8a5a8b1f95c28ee5b6f68c9b7d",
        url: `https://pulse-status-zeta.vercel.app/downloads/v${version}/Pulse-${version}-Windows.exe`,
      },
    },
  });
  let answer = { ok: true, json: async () => manifest("1.0.21") };
  let asked = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    asked += 1;
    // The absolute origin matters: a relative URL would resolve to the app's own
    // bundled copy of its build metadata and report "up to date" forever.
    assert.equal(url, updates.latestManifestUrl);
    assert.equal(options.redirect, "error");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  t.after(() => { globalThis.fetch = realFetch; rmSync(dir, { recursive: true, force: true }); });

  // Always due, so the test does not depend on the hour it runs at; the hour
  // arithmetic itself is covered by tests/updates.test.js.
  const services = (due = true) => [
    { providers: providers.slice(0, 1) },
    { monitor: { snapshot: () => ({ providers: [] }), observeReadings: () => () => {} },
      fetchProvider: async (p) => reading(p, "operational") },
    { nextAlert },
    { REFRESH_MS, DESKTOP_REFRESH_MS },
    { ...updates, dueFrom: () => due },
  ];
  const boot = () => background({
    app: { getPath: () => dir, getVersion: () => "1.0.20" },
    Notification, powerMonitor: { on() {} }, open() {}, services: services(),
  });

  let controller = await boot();
  await tick(); await tick();
  assert.equal(notifications.length, 1, "a newer release is announced once");
  assert.match(notifications[0].title, /1\.0\.21/);
  assert.equal(controller.status().update.version, "1.0.21");
  // The row reaches the renderer through configure(), which is the only bridge
  // call the app makes on every boot.
  assert.equal(controller.configure({}).update.version, "1.0.21");
  controller.stop();

  // A second run on the same machine must not announce the same version again --
  // once per release, not once per morning.
  const before = notifications.length;
  controller = await boot();
  await tick(); await tick();
  assert.equal(notifications.length, before, "the same version is not announced twice");
  assert.equal(controller.status().update.version, "1.0.21", "but the row stays");
  controller.stop();

  // Having installed it, the row disappears by itself: status() re-derives from
  // the running version rather than trusting what was written to disk.
  const updated = await background({
    app: { getPath: () => dir, getVersion: () => "1.0.21" },
    Notification, powerMonitor: { on() {} }, open() {}, services: services(false),
  });
  assert.equal(updated.status().update, null);
  updated.stop();

  // And a check that could not happen says nothing and offers nothing.
  rmSync(dir, { recursive: true, force: true });
  const quietDir = mkdtempSync(join(tmpdir(), "pulse-update-quiet-"));
  for (const failure of [new Error("offline"), { ok: false, status: 500 }, { ok: true, json: async () => { throw new Error("not json"); } }]) {
    answer = failure;
    const quiet = await background({
      app: { getPath: () => quietDir, getVersion: () => "1.0.20" },
      Notification, powerMonitor: { on() {} }, open() {}, services: services(),
    });
    await tick(); await tick();
    assert.equal(quiet.status().update, null, String(failure));
    quiet.stop();
  }
  assert.equal(notifications.length, before, "a failed look never notifies");
  assert.ok(asked > 3, "and it really did try");
  rmSync(quietDir, { recursive: true, force: true });
});
