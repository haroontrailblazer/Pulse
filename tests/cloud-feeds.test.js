import test from "node:test";
import assert from "node:assert/strict";
import { providers, normalizeFeed } from "../shared/providers.js";
import { decodeFeedBytes } from "../shared/cloud-feeds.js";
import { fetchProvider } from "../server/status.js";
const provider = (id) => providers.find((p) => p.id === id);
const awsEvent = (status) => ({
  arn: "event-1",
  service: "ec2-eu-west-1",
  service_name: "EC2",
  region_name: "Ireland",
  summary: "Errors",
  status,
  date: 1789300000,
  event_log: [
    { timestamp: 1789300100, status, message: "Latest update" },
    { timestamp: 1789300000, status: 1, message: "First update" },
  ],
});
const rss = (items = "") =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Azure Status</title><link>https://azure.status.microsoft/en-us/status/</link>${items}</channel></rss>`;
const item = (title) =>
  `<item><guid>incident-1</guid><title>${title}</title><pubDate>Sun, 13 Sep 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Investigating errors &amp; latency.</p>]]></description></item>`;

test("AWS preserves regional impact, latest update, and excludes resolved events", () => {
  for (const [code, expected] of [
    ["0", "operational"],
    ["1", "degraded"],
    ["2", "degraded"],
    ["3", "outage"],
  ]) {
    const result = normalizeFeed(provider("aws"), [awsEvent(code)]);
    assert.equal(result.status, expected);
    assert.equal(result.incidents.length, code === "0" ? 0 : 1);
    if (code !== "0") {
      assert.match(result.incidents[0].name, /Ireland/);
      assert.equal(result.incidents[0].body, "Latest update");
    }
  }
  assert.throws(() => normalizeFeed(provider("aws"), [awsEvent("4")]));
  assert.throws(() => normalizeFeed(provider("aws"), {}));
  assert.equal(normalizeFeed(provider("aws"), []).status, "operational");
});
test("Azure validates XML and distinguishes current notices from resolved notices and PIRs", () => {
  assert.equal(normalizeFeed(provider("azure"), rss()).status, "operational");
  const active = normalizeFeed(
    provider("azure"),
    rss(item("Storage - errors")),
  );
  assert.equal(active.status, "degraded");
  assert.equal(active.incidents[0].id, "incident-1");
  for (const title of [
    "Resolved - Storage errors",
    "[Mitigated] - Network errors",
    "Post Incident Review - Errors",
  ])
    assert.equal(
      normalizeFeed(provider("azure"), rss(item(title))).status,
      "operational",
    );
  for (const text of [
    "<html>error</html>",
    "<rss><channel>",
    rss("<item><title>Missing ID</title></item>"),
    '<!DOCTYPE rss [<!ENTITY x "value">]>' + rss(),
  ])
    assert.throws(() => normalizeFeed(provider("azure"), text));
});
test("Replicate is scoped to its component, not Cloudflare's aggregate or unrelated incidents", () => {
  const p = provider("replicate");
  const data = {
    status: { indicator: "major" },
    components: [
      { id: p.componentId, name: "Replicate", status: "operational" },
      { id: "other", status: "major_outage" },
    ],
    incidents: [
      {
        id: "unrelated",
        components: [{ id: "other" }],
        status: "investigating",
      },
    ],
  };
  assert.equal(normalizeFeed(p, data).status, "operational");
  assert.equal(normalizeFeed(p, data).incidents.length, 0);
  data.components[0].status = "major_outage";
  data.incidents.push({
    id: "replicate",
    status: "investigating",
    components: [{ id: p.componentId, name: "Replicate" }],
  });
  assert.equal(normalizeFeed(p, data).status, "outage");
  assert.equal(normalizeFeed(p, data).incidents[0].id, "replicate");
  assert.throws(() => normalizeFeed(p, { ...data, components: [] }));
});
test("Google outage severity and recovery work with nullable end dates and text responses", () => {
  const event = {
    id: "gcp",
    begin: "2026-09-13T10:00:00Z",
    end: null,
    updates: [],
    most_recent_update: { status: "SERVICE_OUTAGE" },
  };
  assert.equal(
    normalizeFeed(provider("googlecloud"), JSON.stringify([event])).status,
    "outage",
  );
  event.most_recent_update.status = "AVAILABLE";
  assert.equal(
    normalizeFeed(provider("googlecloud"), [event]).status,
    "operational",
  );
});
test("official response decoding accepts UTF-16BE, UTF-16LE and UTF-8 BOMs", () => {
  const text = JSON.stringify([awsEvent("3")]);
  const le = Buffer.from("\uFEFF" + text, "utf16le"),
    be = Buffer.from(le).swap16();
  for (const bytes of [le, be, Buffer.from("\uFEFF" + text)])
    assert.equal(decodeFeedBytes(bytes), text);
});
test("transient Google failure retries once and parses the successful response", async (t) => {
  let calls = 0;
  const spy = t.mock.method(globalThis, "fetch", async () =>
    ++calls === 1
      ? new Response("Unavailable", { status: 503 })
      : new Response("[]", { headers: { "content-type": "application/json" } }),
  );
  assert.equal(
    (await fetchProvider(provider("googlecloud"))).status,
    "operational",
  );
  assert.equal(spy.mock.callCount(), 2);
});
test("AWS UTF-16 response and Azure XML pass through the real fetch adapter", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) =>
    String(url).includes("amazon")
      ? new Response(
          Buffer.from(
            "\uFEFF" + JSON.stringify([awsEvent("3")]),
            "utf16le",
          ).swap16(),
          { headers: { "content-type": "application/json;charset=utf-16" } },
        )
      : new Response(rss(), { headers: { "content-type": "text/xml" } }),
  );
  assert.equal((await fetchProvider(provider("aws"))).status, "outage");
  assert.equal((await fetchProvider(provider("azure"))).status, "operational");
});

// Instatus publishes components and nothing else -- no page indicator, no
// incidents on this document -- so the overall reading is derived from the
// parts. The states are SCREAMINGCASE with no separators, and the mapping is
// total on purpose: a status page inventing good news is the one failure this
// product cannot have.
const instatus = (...states) =>
  JSON.stringify({
    components: states.map((status, n) => ({
      id: `c${n}`,
      name: `API ${n}`,
      status,
      group: { id: "g", name: "Edge Network" },
    })),
  });

test("an Instatus feed reads its overall status from the worst component", () => {
  const railway = provider("railway");
  const read = (...states) => normalizeFeed(railway, instatus(...states));

  assert.equal(read("OPERATIONAL", "OPERATIONAL").status, "operational");
  assert.equal(read("OPERATIONAL", "UNDERMAINTENANCE").status, "maintenance");
  assert.equal(read("OPERATIONAL", "DEGRADEDPERFORMANCE").status, "degraded");
  // PARTIALOUTAGE is Statuspage's "minor", which this product has always read
  // as degraded. The Android parser takes the same route, so the phone and the
  // website cannot disagree about one feed.
  assert.equal(read("OPERATIONAL", "PARTIALOUTAGE").status, "degraded");
  assert.equal(read("OPERATIONAL", "MAJOROUTAGE").status, "outage");
  // Worst wins, and maintenance does not outrank an outage.
  assert.equal(read("UNDERMAINTENANCE", "MAJOROUTAGE").status, "outage");
  assert.equal(read("MAJOROUTAGE", "DEGRADEDPERFORMANCE").status, "outage");
});

test("an Instatus feed carries its components through, named as a reader sees them", () => {
  const reading = normalizeFeed(
    provider("railway"),
    instatus("OPERATIONAL", "MAJOROUTAGE"),
  );
  assert.equal(reading.components.length, 2);
  // Instatus keeps the half a reader recognises -- "Edge Network" -- beside the
  // part rather than in its name.
  assert.equal(reading.components[0].name, "Edge Network / API 0");
  assert.deepEqual(
    reading.components.map((c) => c.status),
    ["operational", "major_outage"],
  );
  assert.match(reading.description, /1 of 2 components are not operational/);
  // None are claimed: Instatus keeps incidents on a document this feed is not.
  assert.deepEqual(reading.incidents, []);
  assert.ok(reading.checkedAt);
});

test("an Instatus feed refuses a state it does not recognise rather than reading it as healthy", () => {
  assert.throws(
    () => normalizeFeed(provider("railway"), instatus("MOSTLYFINE")),
    /Unrecognized Instatus component state/,
  );
  assert.throws(
    () =>
      normalizeFeed(provider("railway"), JSON.stringify({ components: [] })),
    /carried no components/,
  );
});

// Google publishes one incident feed for the whole of Google Cloud, so a
// provider that is a product inside it says which products it is. Without the
// filter that row would repeat every Compute Engine incident as its own, which
// is the inferred outage this product exists not to report.
const gcpIncident = (product, extra = {}) => ({
  id: `i-${product}`,
  begin: "2026-01-01T00:00:00Z",
  modified: "2026-01-02T00:00:00Z",
  external_desc: `${product} trouble`,
  severity: "high",
  updates: [
    { text: "looking", status: "SERVICE_OUTAGE", when: "2026-01-01T00:00:00Z" },
  ],
  most_recent_update: { text: "looking", status: "SERVICE_OUTAGE" },
  affected_products: [{ title: product, id: product }],
  ...extra,
});

test("a product-scoped Google feed ignores incidents that do not name its products", () => {
  const studio = provider("googleaistudio");
  const cloud = provider("googlecloud");
  const feed = [gcpIncident("Google Compute Engine")];

  // The unscoped Google Cloud row still reports it.
  assert.equal(normalizeFeed(cloud, JSON.stringify(feed)).status, "outage");
  // The scoped row does not, and says nothing is wrong with what it covers.
  const scoped = normalizeFeed(studio, JSON.stringify(feed));
  assert.equal(scoped.status, "operational");
  assert.deepEqual(scoped.incidents, []);
  // And it does not take its freshness from an incident it excluded.
  assert.equal(scoped.sourceUpdatedAt, null);
});

test("a product-scoped Google feed reports an incident that does name its products", () => {
  const studio = provider("googleaistudio");
  // Matched case-insensitively on a substring, because Google renames products
  // in place: "Vertex AI" has also shipped as "Vertex AI Online Prediction".
  for (const title of [
    "Gemini API",
    "Vertex AI Online Prediction",
    "google ai studio",
  ]) {
    const reading = normalizeFeed(studio, JSON.stringify([gcpIncident(title)]));
    assert.equal(reading.status, "outage", title);
    assert.equal(reading.incidents.length, 1, title);
    assert.equal(reading.sourceUpdatedAt, "2026-01-02T00:00:00Z", title);
  }
  assert.match(
    normalizeFeed(studio, JSON.stringify([])).description,
    /for Gemini and related products/,
  );
});

test("every catalogue entry declares a feed this build knows how to read", () => {
  const known = new Set([
    "aws",
    "google",
    "azure-rss",
    "betterstack",
    "component",
    "instatus",
    "source-only",
  ]);
  for (const p of providers) {
    if (p.format) assert.ok(known.has(p.format), `${p.id}: ${p.format}`);
    // A non-default format that reads somewhere other than the Statuspage
    // convention must say where, or feedUrl would silently invent a URL.
    if (p.format && !["source-only", "component"].includes(p.format))
      assert.ok(p.endpoint, `${p.id} declares ${p.format} but no endpoint`);
  }
});
