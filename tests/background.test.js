import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import background from "../desktop/background.cjs";
import { createMonitor, REFRESH_MS, DESKTOP_REFRESH_MS } from "../shared/monitor.js";
import { providers } from "../shared/providers.js";
import { nextAlert } from "../shared/alerts.js";

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
    app: { getPath: () => dir }, Notification, powerMonitor: { on() {} }, open() {},
    services: [{ providers: catalog }, {
      monitor: { snapshot: () => ({ providers: [] }), observeReadings(fn) { listener = fn; return () => { detached = true; }; } },
      fetchProvider: async (p) => { if (p.id === catalog[0].id) throw Error("offline"); return reading(p); },
    }, { nextAlert }, { REFRESH_MS, DESKTOP_REFRESH_MS }],
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
