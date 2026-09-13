import test from "node:test";
import assert from "node:assert/strict";
import { buildAtlas, componentLocations } from "../shared/atlas.js";
import { STALE_MS } from "../shared/monitor.js";
const now = Date.parse("2026-09-13T12:00:00Z");
const provider = (extra = {}) => ({
  id: "test",
  name: "Test",
  status: "operational",
  checkedAt: new Date(now).toISOString(),
  components: [],
  incidents: [],
  ...extra,
});
const component = (name, status) => ({ id: name, name, status });

test("map colors follow the worst matching regional component, not provider headquarters", () => {
  const result = buildAtlas(
    [
      provider({
        status: "outage",
        components: [
          component("London / Compute", "partial_outage"),
          component("London / Storage", "major_outage"),
          component("Tokyo / API", "operational"),
        ],
      }),
    ],
    now,
  );
  assert.equal(result.locations[2].status, "outage");
  assert.equal(result.locations[6].status, "operational");
  assert.equal(result.locations[0].status, "unknown");
  assert.equal(result.issues[0].status, "outage");
});
test("provider-wide incidents stay visible without inventing geographic pins", () => {
  const result = buildAtlas(
    [
      provider({
        incidents: [
          {
            name: "API errors",
            impact: "major",
            status: "monitoring",
            body: "London unaffected",
          },
        ],
      }),
    ],
    now,
  );
  assert.equal(result.issues[0].status, "outage");
  assert.ok(result.locations.every((h) => h.status === "unknown"));
  assert.equal(result.issues[0].evidence[0].kind, "Active incident");
});
test("stale or failed feeds cannot keep regional outage pins or count as healthy", () => {
  const bad = provider({
    components: [component("Mumbai", "major_outage")],
    status: "outage",
  });
  for (const value of [
    { ...bad, stale: true },
    { ...bad, status: "unknown" },
    { ...bad, checkedAt: new Date(now - STALE_MS).toISOString() },
  ]) {
    const result = buildAtlas([value], now);
    assert.equal(result.fresh, 0);
    assert.equal(result.unavailable, 1);
    assert.equal(result.issues.length, 0);
    assert.equal(result.locations[4].status, "unknown");
  }
});
test("location matching respects word boundaries, accents, and avoids broad inferred regions", () => {
  assert.deepEqual(componentLocations("São Paulo (GRU) / Edge"), [8]);
  assert.deepEqual(componentLocations("Ashburn / Compute"), [1]);
  assert.deepEqual(componentLocations("Londonderry API"), []);
  assert.deepEqual(componentLocations("West Virginia"), []);
  assert.deepEqual(componentLocations("US East / API"), []);
  assert.deepEqual(componentLocations("London / Singapore network"), [2, 5]);
});
test("maintenance stays separate and unknown components prevent an all-clear", () => {
  const result = buildAtlas(
    [
      provider({
        components: [
          component("Sydney / Edge", "under_maintenance"),
          component("Frankfurt / API", "operational"),
          component("Frankfurt / Storage", "unknown"),
        ],
      }),
    ],
    now,
  );
  assert.equal(result.locations[7].status, "maintenance");
  assert.equal(result.locations[3].status, "unknown");
  assert.equal(result.issues.length, 0);
});
test("a recovered component clears its pin on the next snapshot", () => {
  const before = buildAtlas(
    [
      provider({
        components: [component("Singapore / API", "degraded_performance")],
      }),
    ],
    now,
  );
  const after = buildAtlas(
    [provider({ components: [component("Singapore / API", "operational")] })],
    now,
  );
  assert.equal(before.locations[5].status, "degraded");
  assert.equal(after.locations[5].status, "operational");
  assert.equal(after.issues.length, 0);
});
test("resolved and scheduled incidents do not create live issues", () => {
  const result = buildAtlas(
    [
      provider({
        incidents: ["resolved", "postmortem", "completed", "scheduled"].map(
          (status) => ({ impact: "major", name: "Old incident", status }),
        ),
      }),
    ],
    now,
  );
  assert.equal(result.issues.length, 0);
});
test("providers are counted once across multiple affected components and incidents", () => {
  const result = buildAtlas(
    [
      provider({
        status: "degraded",
        components: [
          component("London", "partial_outage"),
          component("Tokyo", "major_outage"),
        ],
        incidents: [
          {
            name: "Current incident",
            impact: "major",
            status: "investigating",
          },
        ],
      }),
    ],
    now,
  );
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].status, "outage");
  assert.equal(result.issues[0].evidence.length, 4);
  assert.deepEqual(buildAtlas([], now).issues, []);
});

test("map optionally exposes maintenance evidence while disruption-only consumers stay unchanged", () => {
  const data = [
    provider({
      components: [
        component("London", "under_maintenance"),
        component("Tokyo", "major_outage"),
      ],
    }),
    provider({ id: "maintenance-only", status: "maintenance", components: [] }),
  ];
  const ordinary = buildAtlas(data, now);
  assert.equal(ordinary.issues.length, 1);
  assert.equal(
    ordinary.issues[0].evidence.some((e) => e.status === "maintenance"),
    false,
  );
  const map = buildAtlas(data, now, { includeMaintenance: true });
  assert.equal(map.issues.length, 2);
  assert.equal(
    map.issues[0].evidence.some((e) => e.status === "maintenance"),
    true,
  );
  assert.equal(map.locations[2].status, "maintenance");
});
