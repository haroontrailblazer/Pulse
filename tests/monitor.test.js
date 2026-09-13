import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  createMonitor,
  detectChanges,
  isFresh,
  failedReading,
  appendSignal,
  signalState,
  signalWindow,
  SIGNAL_SLOTS,
  SIGNAL_SLOT_MS,
  STALE_MS,
} from "../shared/monitor.js";
import {
  providers,
  normalizeFeed,
  normalizeSummary,
  unknownProvider,
} from "../shared/providers.js";
import { statusApi } from "../server/api.js";
const provider = providers[0];
const at = "2026-09-13T10:00:00.000Z";
test("next sweep is scheduled from its start, not delayed by feed response time", async () => {
  let now = Date.parse(at);
  const monitor = createMonitor({
    catalog: [provider],
    clock: () => now,
    fetcher: async () => {
      now += 12000;
      return reading();
    },
  });
  const snapshot = await monitor.refresh();
  assert.equal(snapshot.nextCheckAt, "2026-09-13T10:00:30.000Z");
});
function reading(p = provider, status = "none") {
  return normalizeSummary(
    p,
    {
      status: { indicator: status },
      components: [
        {
          id: "api",
          name: "API",
          status: status === "none" ? "operational" : "major_outage",
        },
      ],
      incidents: [],
    },
    at,
  );
}
test("unchanged checks create no fake events and stale readings are never fresh", () => {
  const good = reading();
  assert.deepEqual(
    detectChanges(good, { ...good, checkedAt: "2026-09-13T10:00:30Z" }),
    [],
  );
  assert.equal(isFresh(good, Date.parse(at) + STALE_MS - 1), true);
  assert.equal(isFresh(good, Date.parse(at) + STALE_MS), false);
  const failed = failedReading(provider, good, "Timeout", at);
  assert.equal(failed.status, "unknown");
  assert.equal(failed.lastKnownStatus, "operational");
  assert.deepEqual(failed.components, good.components);
  assert.equal(isFresh(failed, Date.parse(at)), false);
  assert.equal(detectChanges(good, failed)[0].kind, "verification");
  assert.equal(detectChanges(failed, good)[0].kind, "verification");
});
test("fixed signal windows are even for cloud feeds without component data", () => {
  const cloud = {
    ...reading(),
    id: "googlecloud",
    components: [],
    incidents: [],
  };
  const start = Date.parse(at);
  let signals = [];
  for (let index = 0; index < SIGNAL_SLOTS; index++)
    signals = appendSignal({ signals }, cloud, start + index * SIGNAL_SLOT_MS);
  const window = signalWindow(
    { ...cloud, signals },
    start + (SIGNAL_SLOTS - 1) * SIGNAL_SLOT_MS,
  );
  assert.equal(window.length, SIGNAL_SLOTS);
  assert.deepEqual(
    window.map((signal) => signal.status),
    Array(SIGNAL_SLOTS).fill("operational"),
  );
  assert.equal(
    signalState({
      ...cloud,
      components: [{ id: "api", status: "partial_outage" }],
    }),
    "partial_outage",
  );
  assert.equal(
    signalState({
      ...cloud,
      incidents: [{ id: "i", status: "investigating", impact: "major" }],
    }),
    "major_outage",
  );
});
test("fixed signal windows keep unmeasured slots visibly unavailable", () => {
  const time = Date.parse(at);
  const provider = { ...reading(), signals: [] };
  const window = signalWindow(provider, time);
  assert.equal(window.length, SIGNAL_SLOTS);
  assert.equal(
    window.filter((signal) => signal.status === "unknown").length,
    SIGNAL_SLOTS,
  );
});
test("observed provider, component and incident changes are captured", () => {
  const before = reading(),
    after = reading(provider, "major");
  after.incidents = [
    {
      id: "i",
      name: "API failure",
      status: "investigating",
      body: "Provider update",
      updatedAt: at,
    },
  ];
  assert.deepEqual(
    detectChanges(before, after).map((x) => x.kind),
    ["status", "component", "incident"],
  );
  assert.match(
    detectChanges(after, reading()).at(-1).text,
    /No longer listed as active/,
  );
  assert.equal(
    detectChanges(unknownProvider(provider), before)[0].kind,
    "baseline",
  );
});
test("monitor publishes fast providers before slow providers and shares an in-flight refresh", async () => {
  const catalog = providers.slice(0, 2),
    calls = [];
  let finish;
  const blocked = new Promise((resolve) => {
    finish = resolve;
  });
  const monitor = createMonitor({
    catalog,
    fetcher: async (p) => {
      calls.push(p.id);
      if (p.id === catalog[1].id) await blocked;
      return reading(p);
    },
  });
  const frames = [];
  const unsubscribe = monitor.subscribe((s) => frames.push(s));
  try {
    const concurrent = monitor.refresh({ force: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(
      frames.some(
        (s) =>
          s.completedChecks === 1 && s.refreshing && s.providers[0].checkedAt,
      ),
    );
    finish();
    const result = await concurrent;
    assert.equal(result.providers.length, 2);
    assert.equal(result.refreshing, false);
    assert.equal(calls.length, 2);
    assert.equal(result.history.length, 2);
    await monitor.refresh({ force: true });
    assert.equal(calls.length, 2, "manual retries must respect cooldown");
  } finally {
    finish();
    unsubscribe();
  }
});
test("failed refresh preserves incident context without claiming resolution", async () => {
  let now = Date.parse(at),
    fail = false;
  const initial = {
    ...reading(),
    incidents: [
      {
        id: "i",
        name: "Investigating API",
        status: "monitoring",
        updatedAt: at,
      },
    ],
  };
  const monitor = createMonitor({
    catalog: [provider],
    clock: () => now,
    fetcher: async () => {
      if (fail) throw Error("Network down");
      return initial;
    },
  });
  await monitor.refresh();
  now += 121000;
  fail = true;
  const result = await monitor.refresh();
  assert.equal(result.providers[0].incidents[0].id, "i");
  assert.equal(result.providers[0].stale, true);
  assert.equal(result.history.filter((x) => x.kind === "incident").length, 0);
});
test("Better Stack public feed supports components and excludes future maintenance", () => {
  const hf = providers.find((p) => p.id === "huggingface");
  const data = {
    data: { attributes: { aggregate_state: "operational", updated_at: at } },
    included: [
      {
        id: "api",
        type: "status_page_resource",
        attributes: { public_name: "Inference API", status: "operational" },
      },
      {
        id: "past",
        type: "status_report",
        attributes: { aggregate_state: "resolved", starts_at: at },
      },
      {
        id: "future",
        type: "status_report",
        attributes: { aggregate_state: "maintenance", starts_at: "2027-01-01" },
      },
    ],
  };
  const result = normalizeFeed(hf, data, at);
  assert.equal(result.status, "operational");
  assert.equal(result.components[0].name, "Inference API");
  assert.deepEqual(result.incidents, []);
  assert.throws(() =>
    normalizeFeed(
      hf,
      { data: { attributes: { aggregate_state: "unexpected" } }, included: [] },
      at,
    ),
  );
});
test("SSE sends a real snapshot then per-provider deltas, with cleanup on disconnect", async () => {
  let cleaned = false;
  let onCleanup;
  const cleanup = new Promise((resolve) => {
    onCleanup = resolve;
  });
  const snapshot = { providers: [unknownProvider(provider)], revision: 0 };
  const engine = {
    subscribe(listener) {
      listener(snapshot);
      listener({ ...snapshot, providers: [reading()], revision: 1 });
      return () => {
        cleaned = true;
        onCleanup();
      };
    },
  };
  const server = http.createServer(
    (req, res) => void statusApi(req, res, engine),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const controller = new AbortController();
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/status/stream`,
      { signal: controller.signal },
    );
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const reader = response.body.getReader();
    let text = "";
    while (text.split("\n\n").length < 3) {
      const { value } = await reader.read();
      text += new TextDecoder().decode(value);
    }
    const frames = text
      .trim()
      .split("\n\n")
      .map((x) => JSON.parse(x.slice(6)));
    assert.equal(frames[0].partial, undefined);
    assert.equal(frames[1].partial, true);
    assert.equal(frames[1].providers[0].status, "operational");
    await reader.cancel();
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await cleanup;
  assert.equal(cleaned, true);
});
