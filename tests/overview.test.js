import test from "node:test";
import assert from "node:assert/strict";
import { overviewSnapshot } from "../shared/overview.js";
import { STALE_MS } from "../shared/monitor.js";
const now = Date.parse("2026-09-13T10:00:00Z");
const provider = (id, extra = {}) => ({
  id,
  name: id,
  status: "operational",
  checkedAt: new Date(now).toISOString(),
  components: [],
  incidents: [],
  ...extra,
});

test("mobile summary prioritizes watched component and incident issues over healthy aggregates", () => {
  const snapshot = overviewSnapshot(
    [
      provider("healthy"),
      provider("component", {
        components: [{ name: "API", status: "partial_outage" }],
      }),
      provider("incident", {
        incidents: [
          {
            id: "issue",
            name: "Model errors",
            status: "investigating",
            impact: "major",
          },
        ],
      }),
      provider("unwatched", { status: "outage" }),
    ],
    ["healthy", "component", "incident"],
    now,
  );
  assert.deepEqual(
    snapshot.watched.map((row) => row.provider.id),
    ["incident", "component", "healthy"],
  );
  assert.equal(snapshot.disrupted.length, 2);
  assert.equal(
    snapshot.services.find((row) => row.provider.id === "unwatched").status,
    "outage",
  );
});
test("stale, maintenance and unspecified incident states cannot produce a mobile all-clear", () => {
  const snapshot = overviewSnapshot(
    [
      provider("stale", { checkedAt: new Date(now - STALE_MS).toISOString() }),
      provider("unknown", { status: "unknown" }),
      provider("maintenance", {
        components: [{ name: "London", status: "under_maintenance" }],
      }),
      provider("update", {
        incidents: [{ id: "note", status: "monitoring", impact: "none" }],
      }),
    ],
    ["stale", "unknown", "maintenance", "update"],
    now,
  );
  assert.equal(snapshot.unavailable.length, 2);
  assert.equal(snapshot.maintenance.length, 1);
  assert.equal(snapshot.updates.length, 1);
  assert.equal(snapshot.disrupted.length, 0);
  assert.equal(snapshot.fresh, 2);
  assert.equal(snapshot.regionalIssues, 0);
});
test("empty watchlists keep service search and network updates available", () => {
  const snapshot = overviewSnapshot(
    [
      provider("npm", {
        incidents: [
          { id: "registry", status: "investigating", impact: "minor" },
        ],
      }),
    ],
    [],
    now,
  );
  assert.equal(snapshot.watched.length, 0);
  assert.equal(snapshot.disrupted.length, 0);
  assert.equal(snapshot.services.length, 1);
  assert.equal(snapshot.incidents.length, 1);
});
