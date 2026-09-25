import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alertKeys, nextAlert, requestBudget, resolved } from "../shared/alerts.js";
import { providers } from "../shared/providers.js";
const reading = (status = "operational", extra = {}) => ({
  id: "openai",
  status,
  checkedAt: new Date().toISOString(),
  components: [],
  incidents: [],
  ...extra,
});
test("alerts report current issues once, survive failed checks, and notify after a new recurrence", () => {
  const first = nextAlert(undefined, reading("degraded"));
  assert.equal(first.notify, true);
  assert.equal(nextAlert(first.signature, reading("degraded")).notify, false);
  const failed = nextAlert(
    first.signature,
    reading("unknown", { stale: true }),
  );
  assert.equal(failed.signature, first.signature);
  assert.equal(failed.notify, false);
  assert.equal(nextAlert(failed.signature, reading("degraded")).notify, false);
  const clear = nextAlert(first.signature, reading());
  assert.equal(clear.notify, false);
  assert.equal(nextAlert(clear.signature, reading("degraded")).notify, true);
});
test("component issues and active incidents alert even with an operational aggregate", () => {
  const next = reading("operational", {
    components: [{ id: "api", status: "partial_outage" }],
    incidents: [{ id: "i", status: "investigating", impact: "major" }],
  });
  const first = nextAlert("", next);
  assert.equal(first.notify, true);
  assert.equal(
    nextAlert(first.signature, {
      ...next,
      incidents: [
        { ...next.incidents[0], status: "monitoring", updatedAt: "later" },
      ],
    }).notify,
    false,
  );
  assert.equal(
    nextAlert(first.signature, { ...next, incidents: [] }).notify,
    false,
  );
  assert.equal(
    nextAlert(first.signature, {
      ...next,
      incidents: [
        ...next.incidents,
        { id: "new", status: "investigating", impact: "minor" },
      ],
    }).notify,
    true,
  );
  assert.equal(
    nextAlert(
      "",
      reading("operational", {
        incidents: [{ id: "i", status: "resolved", impact: "major" }],
      }),
    ).notify,
    false,
  );
});
test("request budget uses feed count and watched services, not fictional battery percentages", () => {
  // Pinned to the arithmetic rather than to today's catalogue: the numbers
  // below are what 77 automated feeds cost, and a catalogue that grows has to
  // move them deliberately rather than quietly spending more of a reader's
  // battery and bandwidth.
  const count = providers.filter((p) => p.format !== "source-only").length;
  assert.equal(count, 77);
  assert.deepEqual(requestBudget(4, count), {
    oldHourly: 9240,
    foregroundHourly: 9240,
    androidHourly: 120,
    desktopHourly: 480,
  });
  assert.equal(requestBudget(0).androidHourly, 0);
});

test("a rotating component roster does not re-announce an incident that never changed", () => {
  // Measured against the shipped Windows build: one open Cloudflare incident
  // produced nineteen identical toasts over four hours, because Cloudflare
  // publishes a per-datacenter component for every location and their
  // maintenance and partial-outage windows rotate all day. Every rotation added
  // a component id the stored signature had not seen, which read as news, and
  // the toast body is the provider's first incident -- so the same sentence
  // arrived again and again.
  const datacenters = (n, status) =>
    Array.from({ length: n }, (_, i) => ({ id: `dc${i}`, status }));
  const open = { id: "warp", status: "investigating", impact: "minor" };
  const first = nextAlert(
    "",
    reading("degraded", {
      components: [
        ...datacenters(40, "under_maintenance"),
        { id: "ams", status: "partial_outage" },
      ],
      incidents: [open],
    }),
  );
  assert.equal(first.notify, true, "the incident itself is still news");
  // The same incident, the same severity, an entirely different roster of
  // datacenters carrying it.
  const rotated = nextAlert(
    first.signature,
    reading("degraded", {
      components: [
        ...datacenters(40, "under_maintenance").map((c) => ({
          ...c,
          id: `${c.id}-later`,
        })),
        { id: "sin", status: "partial_outage" },
      ],
      incidents: [open],
    }),
  );
  assert.equal(rotated.notify, false, "a rotated roster is not a new issue");

  // What must still get through: a component reaching a level the provider was
  // not already at, a new incident, and the service itself getting worse.
  assert.equal(
    nextAlert(
      rotated.signature,
      reading("degraded", {
        components: [{ id: "edge", status: "major_outage" }],
        incidents: [open],
      }),
    ).notify,
    true,
    "a worse component level is news",
  );
  assert.equal(
    nextAlert(
      rotated.signature,
      reading("degraded", {
        components: [{ id: "edge", status: "partial_outage" }],
        incidents: [
          open,
          { id: "new", status: "investigating", impact: "major" },
        ],
      }),
    ).notify,
    true,
    "a second incident is news",
  );
  assert.equal(
    nextAlert(
      rotated.signature,
      reading("outage", {
        components: [{ id: "edge", status: "partial_outage" }],
        incidents: [open],
      }),
    ).notify,
    true,
    "the service getting worse is news",
  );
});

test("planned maintenance is not an issue and never raises an alert", () => {
  const maintenance = nextAlert(
    "",
    reading("maintenance", {
      components: [{ id: "db", status: "under_maintenance" }],
    }),
  );
  assert.equal(maintenance.notify, false);
  // And it does not mask a real problem arriving afterwards.
  assert.equal(
    nextAlert(
      maintenance.signature,
      reading("outage", {
        components: [{ id: "db", status: "major_outage" }],
      }),
    ).notify,
    true,
  );
});

// --- the shared truth table ------------------------------------------------
// Read by this file and by FeedReadingTest.java, which npm run build:android
// runs. The two implementations of these decisions were hand-mirrored and had
// already drifted; this is what makes a disagreement a failed build.
const cases = JSON.parse(
  readFileSync(new URL("../shared/alert-cases.json", import.meta.url), "utf8"),
);

test("the shared alert table is actually populated", () => {
  // A renamed or emptied fixture must fail rather than pass by iterating
  // nothing. The Java mirror asserts the same floors for the same reason.
  assert.ok(cases.notify.length > 10, "notify rows");
  assert.ok(cases.resolved.length > 6, "resolved rows");
});

// nextAlert takes a reading, but every decision it makes is a comparison of two
// signatures, so the table is expressed in signatures and the comparison is
// exercised directly. Keeping the rows at that level is what lets Java assert
// the identical rows without building a JSONObject reading for each one.
const notifies = (previous, next) => {
  if (next === null) return false;
  const old = alertKeys(previous);
  return [...alertKeys(next)].some((key) => !old.has(key));
};

test("the notify decision matches the shared table", () => {
  for (const row of cases.notify)
    assert.equal(
      notifies(row.previous, row.next),
      row.notify,
      `${JSON.stringify(row.previous)} -> ${JSON.stringify(row.next)}: ${row.why}`,
    );
});

test("the recovery decision matches the shared table", () => {
  for (const row of cases.resolved)
    assert.equal(
      resolved(row.previous, row.next),
      row.resolved,
      `${JSON.stringify(row.previous)} -> ${JSON.stringify(row.next)}: ${row.why}`,
    );
});
