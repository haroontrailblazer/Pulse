import test from "node:test";
import assert from "node:assert/strict";
import {
  providers,
  normalizeSummary,
  normalizeFeed,
  unknownProvider,
} from "../shared/providers.js";
import { fetchProvider } from "../server/status.js";
import { createServer } from "../server/index.js";
const provider = providers[0];
test("invalid or missing upstream status must never become healthy", () => {
  for (const body of [
    null,
    {},
    { status: {} },
    { status: { indicator: "unexpected" } },
  ])
    assert.throws(() => normalizeSummary(provider, body));
  assert.equal(unknownProvider(provider).status, "unknown");
  assert.equal(unknownProvider(provider).checkedAt, null);
});
test("critical outages remain outages and closed incidents do not appear active", () => {
  const result = normalizeSummary(provider, {
    status: { indicator: "critical" },
    components: [
      { id: "group", group: true },
      { id: "api", name: "API", status: "major_outage" },
    ],
    incidents: [
      { id: "old", status: "resolved" },
      {
        id: "new",
        name: "API unavailable",
        status: "investigating",
        incident_updates: [{ body: "Investigating errors" }],
      },
    ],
  });
  assert.equal(result.status, "outage");
  assert.equal(result.incidents.length, 1);
  assert.equal(result.incidents[0].body, "Investigating errors");
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].status, "major_outage");
});
test("network failure is represented as unverified, with no fabricated component readings", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("network unavailable");
  });
  const result = await fetchProvider(provider);
  assert.equal(result.status, "unknown");
  assert.equal(result.checkedAt, null);
  assert.deepEqual(result.components, []);
});
test("upstream HTTP failure cannot be normalized as healthy", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503 }));
  assert.equal((await fetchProvider(provider)).status, "unknown");
});
test("source-only providers do not request a nonexistent status API", async (t) => {
  const spy = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("should not fetch");
  });
  const result = await fetchProvider(providers.find((p) => p.id === "aws"));
  assert.equal(spy.mock.callCount(), 0);
  assert.equal(result.status, "unknown");
  assert.match(result.description, /not configured/);
});
test("Google feed distinguishes ongoing incidents from resolved history", () => {
  const gcp = providers.find((p) => p.id === "googlecloud");
  const history = [
    { id: "past", begin: "2026-09-01", end: "2026-09-02", updates: [] },
  ];
  assert.equal(normalizeFeed(gcp, history).status, "operational");
  const active = normalizeFeed(gcp, [
    ...history,
    {
      id: "active",
      begin: "2026-09-13",
      updates: [],
      external_desc: "Regional service disruption",
    },
  ]);
  assert.equal(active.status, "degraded");
  assert.equal(active.incidents.length, 1);
  assert.equal(active.incidents[0].id, "active");
  assert.throws(() => normalizeFeed(gcp, {}));
});
test("production server serves the built app, assets, and missing file responses", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Pulse/);
    const icon = await fetch(`${base}/favicon.svg`);
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get("content-type"), /image\/svg/);
    const missing = await fetch(`${base}/missing.js`);
    assert.equal(missing.status, 404);
    const traversal = await fetch(`${base}/..%5cpackage.json`);
    assert.equal(traversal.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
