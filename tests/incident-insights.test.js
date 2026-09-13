import test from "node:test";
import assert from "node:assert/strict";
import {
  collectIncidents,
  incidentRevision,
  latestIncident,
} from "../shared/incidents.js";
import { explainIndustry } from "../shared/insights.js";
const now = Date.parse("2026-09-13T10:10:00Z");
const provider = (extra = {}) => ({
  id: "test",
  name: "Test",
  category: "Developer tools",
  industries: ["Developer tools"],
  status: "operational",
  checkedAt: new Date(now).toISOString(),
  incidents: [],
  components: [],
  ...extra,
});
test("inbox chooses the latest update body and sorts by source update with valid fallbacks", () => {
  const list = collectIncidents(
    [
      provider({
        incidents: [
          {
            id: "old",
            name: "Older",
            updatedAt: "invalid",
            startedAt: "2026-09-12T10:00:00Z",
          },
          {
            id: "new",
            name: "New",
            updatedAt: "2026-09-13T08:00:00Z",
            body: "Old body",
            updates: [
              { at: "2026-09-13T09:00:00Z", body: "Earlier" },
              { at: "2026-09-13T10:00:00Z", body: "Latest" },
            ],
          },
          { id: "missing", name: "No timestamp" },
        ],
      }),
    ],
    now,
  );
  assert.deepEqual(
    list.map((i) => i.id),
    ["new", "old", "missing"],
  );
  assert.equal(list[0].body, "Latest");
  assert.equal(list[0].updatedAt, "2026-09-13T10:00:00.000Z");
  assert.equal(list[1].updatedAt, "2026-09-12T10:00:00.000Z");
  assert.equal(list[2].updatedAt, null);
});
test("inbox includes unwatched providers, separates provider IDs, and excludes stale or closed incidents", () => {
  const i = {
    id: "same",
    status: "investigating",
    updatedAt: new Date(now).toISOString(),
  };
  const list = collectIncidents(
    [
      provider({
        incidents: [i, i, { ...i, id: "closed", status: "resolved" }],
      }),
      provider({ id: "other", incidents: [i] }),
      provider({ id: "stale", stale: true, incidents: [i] }),
    ],
    now,
  );
  assert.equal(list.length, 2);
  assert.deepEqual(
    new Set(list.map((i) => i.key)),
    new Set(["test:same", "other:same"]),
  );
});
test("a new update becomes unread even on the same incident; retrieval time alone does not", () => {
  const i = latestIncident({
    id: "i",
    status: "investigating",
    updatedAt: new Date(now).toISOString(),
    body: "Initial",
  });
  assert.equal(
    incidentRevision(i),
    incidentRevision({ ...i, checkedAt: "later" }),
  );
  assert.notEqual(
    incidentRevision(i),
    incidentRevision({ ...i, body: "New source update" }),
  );
});
test("plain insights include component and incident issues behind operational aggregates without fabricating exposure", () => {
  const items = [
    provider({
      components: [{ id: "api", name: "API", status: "major_outage" }],
    }),
    provider({
      id: "second",
      incidents: [
        { id: "i", name: "Incident", status: "investigating", impact: "major" },
      ],
    }),
    provider({
      id: "unavailable",
      status: "unknown",
      stale: true,
      components: [{ id: "api", name: "API", status: "major_outage" }],
    }),
  ];
  const result = explainIndustry(items, "Developer tools", ["second"], now);
  assert.equal(result.issues.length, 2);
  assert.equal(result.watchedIssues, 1);
  assert.equal(result.unavailable, 1);
  assert.equal(result.fresh, 2);
  assert.equal(result.issues[0].status, "outage");
  assert.match(result.issues[0].meaning, /could/);
  assert.match(result.issues[0].action, /Check/);
  assert.equal(explainIndustry(items, "Unrelated", [], now).relevant.length, 0);
});
