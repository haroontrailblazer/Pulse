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
