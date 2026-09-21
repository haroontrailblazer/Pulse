import test from "node:test";
import assert from "node:assert/strict";
import {
  collectIncidents,
  incidentRevision,
  latestIncident,
} from "../shared/incidents.js";
import {
  explainIndustry,
  explainDisruptions,
  plainImpact,
} from "../shared/insights.js";
import { providers, categories } from "../shared/providers.js";
import { workflowHints } from "../shared/atlas.js";
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

test("disruption insights span industries and restrict evidence and coverage to the selected watchlist scope", () => {
  const items = [
    provider({ id: "ai", industries: ["AI products"], status: "degraded" }),
    provider({
      id: "commerce",
      industries: ["E-commerce"],
      components: [{ name: "Checkout", status: "major_outage" }],
    }),
    provider({ id: "maintenance", status: "maintenance" }),
    provider({ id: "healthy" }),
    provider({ id: "stale", status: "outage", stale: true }),
  ];
  const all = explainDisruptions(items, ["ai"], now);
  assert.deepEqual(
    all.issues.map((i) => i.provider.id),
    ["commerce", "ai"],
  );
  assert.equal(all.unavailable, 1);
  const watched = explainDisruptions(items, ["ai"], now, true);
  assert.deepEqual(
    watched.issues.map((i) => i.provider.id),
    ["ai"],
  );
  assert.equal(watched.unavailable, 0);
  assert.equal(watched.fresh, 1);
  assert.equal(explainDisruptions(items, [], now, true).issues.length, 0);
  assert.equal(
    explainDisruptions(items, ["healthy"], now, true).issues.length,
    0,
  );
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

// Both of these were bare lookups into closed maps keyed by `provider.category`.
// A category is data -- adding one to the catalogue is a content change -- so a
// missing sentence has to read as one sentence less, not as a broken one. Before
// the guard the insights page rendered "If you use the affected feature:" with
// nothing after the colon and copied "Could affect: undefined" to the clipboard.
test("a provider in an unwritten category still explains itself", () => {
  // `now` is milliseconds here: isFresh does `now - Date.parse(checkedAt)`, and
  // an ISO string makes that NaN, which reads as stale and drops the provider.
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const invented = {
    ...providers[0],
    id: "invented",
    name: "Invented",
    category: "A category nobody wrote a sentence for",
  };
  const reading = {
    ...invented,
    status: "outage",
    stale: false,
    checkedAt,
    sourceUpdatedAt: checkedAt,
    components: [{ id: "c", name: "API", status: "major_outage" }],
    incidents: [],
  };
  const [issue] = explainDisruptions([reading], [], now).issues;
  assert.ok(issue, "the provider still reaches the insights page");
  assert.equal(typeof issue.meaning, "string");
  assert.equal(typeof issue.action, "string");
  assert.ok(issue.meaning.length > 10, issue.meaning);
  assert.ok(issue.action.length > 10, issue.action);
  assert.doesNotMatch(`${issue.meaning} ${issue.action}`, /undefined/);
});

test("every category the catalogue ships has its own sentence, not the fallback", () => {
  // The fallback exists so nothing breaks; it is not meant to be what readers
  // usually get. A category that ships without its own line is an omission.
  for (const category of categories) {
    assert.ok(
      plainImpact[category],
      `${category} has no plain-English impact sentence`,
    );
    assert.ok(
      workflowHints[category],
      `${category} has no "what to check" hint`,
    );
  }
});
