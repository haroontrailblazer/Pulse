import test from "node:test";
import assert from "node:assert/strict";
import {
  filterIssueRows,
  incidentSeverity,
  incidentDay,
} from "../shared/presentation.js";

test("maintenance is discoverable alongside a more severe issue without altering source evidence", () => {
  const rows = [
    {
      provider: { id: "cloud" },
      status: "outage",
      evidence: [
        { name: "API", status: "outage" },
        { name: "London", status: "maintenance" },
      ],
    },
  ];
  const maintenance = filterIssueRows(rows, "maintenance");
  assert.equal(maintenance.length, 1);
  assert.equal(maintenance[0].status, "maintenance");
  assert.deepEqual(
    maintenance[0].evidence.map((e) => e.name),
    ["London"],
  );
  assert.equal(rows[0].status, "outage");
  assert.equal(rows[0].evidence.length, 2);
  assert.deepEqual(filterIssueRows(rows, "degraded"), []);
  assert.equal(filterIssueRows(rows, "all"), rows);
});
test("notification severity uses incident impact without borrowing the provider's overall state", () => {
  assert.equal(incidentSeverity({ impact: "major" }), "outage");
  assert.equal(incidentSeverity({ impact: "critical" }), "outage");
  assert.equal(incidentSeverity({ impact: "minor" }), "degraded");
  assert.equal(incidentSeverity({ impact: "maintenance" }), "maintenance");
  assert.equal(
    incidentSeverity({ impact: "none", provider: { status: "outage" } }),
    "update",
  );
});
test("notification dates distinguish local calendar days and missing source times", () => {
  const now = new Date(2026, 8, 13, 0, 5).getTime();
  assert.equal(
    incidentDay(new Date(2026, 8, 13, 0, 1).toISOString(), now),
    "Today",
  );
  assert.equal(
    incidentDay(new Date(2026, 8, 12, 23, 59).toISOString(), now),
    "Yesterday",
  );
  assert.equal(incidentDay(null, now), "Update time unavailable");
  assert.equal(incidentDay("invalid", now), "Update time unavailable");
});
