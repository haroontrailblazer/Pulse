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
test("provider-wide incidents use the dedicated worldwide marker", () => {
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
  const worldwide = result.locations.find((location) => location.global);
  assert.equal(worldwide.status, "outage");
  assert.equal(worldwide.signals[0].name, "API errors");
  assert.equal(result.issues[0].evidence[0].kind, "Active incident");
});
test("official incident details add outage and degraded pins when they name a hub", () => {
  const result = buildAtlas(
    [
      provider({
        incidents: [
          {
            name: "London API disruption",
            impact: "major",
            status: "investigating",
            body: "The provider is investigating elevated errors.",
            components: ["London / API"],
          },
          {
            name: "San Francisco latency",
            impact: "minor",
            status: "monitoring",
            body: "The provider is monitoring recovery.",
          },
        ],
      }),
    ],
    now,
  );
  assert.equal(result.locations[2].status, "outage");
  assert.equal(result.locations[0].status, "degraded");
  assert.equal(result.locations[2].signals[0].kind, "Active incident");
});
test("live provider and component state outrank stale incident impact on the map", () => {
  const result = buildAtlas(
    [
      provider({
        id: "aws",
        status: "outage",
        components: [
          component("Multiple services / UAE", "major_outage"),
          component("Multiple services / Bahrain", "major_outage"),
        ],
        incidents: [
          {
            name: "Multiple services (UAE): Increased Error Rates",
            impact: "major",
            status: "investigating",
            components: ["Multiple services / UAE"],
          },
        ],
      }),
      provider({
        id: "anthropic",
        status: "degraded",
        components: [component("Claude Cowork", "degraded_performance")],
        incidents: [
          {
            name: "Degraded functionality for Claude Cowork on Windows",
            impact: "major",
            status: "identified",
            components: ["Claude Cowork"],
          },
        ],
      }),
    ],
    now,
  );
  const abuDhabi = result.locations.find(
    (location) => location.name === "Abu Dhabi",
  );
  const manama = result.locations.find(
    (location) => location.name === "Manama",
  );
  const worldwide = result.locations.find((location) => location.global);
  assert.equal(abuDhabi.status, "outage");
  assert.equal(manama.status, "outage");
  assert.equal(worldwide.status, "degraded");
  assert.equal(worldwide.signals[0].provider.id, "anthropic");
  assert.equal(worldwide.signals[0].status, "degraded");
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

// Fifty of the seventy-seven services publish components called "API",
// "Dashboard" and "Webhooks" and never name a place, so the only way onto this
// map used to be to break: a healthy service of that kind was drawn nowhere at
// all, and an outage moved it from nowhere to Worldwide. A map that draws a
// service only once it fails is not a map of the services.
//
// The rule that replaces it invents nothing. A service is drawn at the places
// its own reports name; a service whose reports name none is drawn at the
// marker whose stated meaning is "no regional scope stated". That marker is a
// statement about the feed, never a claim about where the service runs.
test("a service that never names a region is still on the map, at the marker that says so", () => {
  const result = buildAtlas(
    [
      provider({ id: "flat", components: [component("API", "operational")] }),
      provider({
        id: "regional",
        components: [component("London / API", "operational")],
      }),
    ],
    now,
  );
  const worldwide = result.locations.at(-1);
  assert.equal(worldwide.global, true);
  assert.deepEqual(
    worldwide.signals.map((s) => [s.provider.id, s.kind]),
    [["flat", "Provider status"]],
    "the service that named a place is drawn there and not also at Worldwide",
  );
  assert.equal(
    result.locations[2].signals.length,
    1,
    "and the one that named London is still at London",
  );
  // The reading is the provider's own published line, carried as published.
  assert.equal(worldwide.signals[0].status, "operational");
  assert.equal(
    result.issues.length,
    0,
    "being on the map is not being an issue",
  );
});

test("every service in the catalogue has a place on the map", async () => {
  const { providers } = await import("../shared/providers.js");
  const snapshot = providers.map((p) =>
    provider({
      id: p.id,
      name: p.name,
      components: [component("API", "operational")],
    }),
  );
  const result = buildAtlas(snapshot, now);
  const drawn = new Set(
    result.locations.flatMap((l) => l.signals.map((s) => s.provider.id)),
  );
  assert.equal(
    drawn.size,
    providers.length,
    `every service is drawn somewhere; missing: ${providers
      .filter((p) => !drawn.has(p.id))
      .map((p) => p.id)
      .join(", ")}`,
  );
});

// A feed that publishes no summary sentence must not drop its service off the
// map -- the sentence is what the row says, not whether the service exists.
test("a service with no published summary still takes its place", () => {
  const result = buildAtlas(
    [provider({ id: "quiet", name: "Quiet", description: undefined })],
    now,
  );
  assert.deepEqual(
    result.locations.at(-1).signals.map((s) => s.name),
    ["Quiet"],
  );
});

// Nothing below is new, but all three are the boundary this placement could
// have crossed: an unread feed is not a place on the map, a troubled service
// that names no region is placed once rather than twice, and a healthy
// component that names no region is still not a signal of its own.
test("placement cannot resurrect a feed that was never read", () => {
  const stale = provider({
    id: "stale",
    checkedAt: new Date(now - STALE_MS - 1000).toISOString(),
  });
  const unknown = provider({ id: "dark", status: "unknown" });
  const result = buildAtlas([stale, unknown], now);
  assert.deepEqual(result.locations.at(-1).signals, []);
  assert.equal(result.unavailable, 2);
});
test("a troubled service with no stated region is placed once, by its own trouble", () => {
  const result = buildAtlas(
    [
      provider({
        id: "down",
        status: "outage",
        components: [component("API", "major_outage")],
      }),
    ],
    now,
  );
  const worldwide = result.locations.at(-1);
  assert.deepEqual(
    worldwide.signals.map((s) => s.kind),
    ["Component"],
    "the component fallback already put it there; the provider reading must not double it",
  );
  assert.equal(worldwide.status, "outage");
});
