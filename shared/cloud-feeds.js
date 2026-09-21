import { XMLParser, XMLValidator } from "fast-xml-parser";

const iso = (seconds) => {
  const date = new Date(Number(seconds) * 1000);
  if (!seconds || !Number.isFinite(date.getTime()))
    throw new Error("Invalid incident timestamp");
  return date.toISOString();
};
const plain = (value = "") =>
  String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const closedTitle =
  /^(?:\[?(?:resolved|mitigated|completed)\]?\s*[-:–]|(?:final\s+)?(?:pir|post[- ]incident review|root cause analysis)\b)/i;

export function normalizeAzure(provider, text, now) {
  if (
    typeof text !== "string" ||
    /<!DOCTYPE|<!ENTITY/i.test(text) ||
    XMLValidator.validate(text) !== true
  )
    throw new Error("Invalid Azure RSS feed");
  const channel = new XMLParser({
    parseTagValue: false,
    isArray: (name) => name === "item",
  }).parse(text)?.rss?.channel;
  if (
    channel?.title !== "Azure Status" ||
    !channel.link?.startsWith("https://azure.status.microsoft/")
  )
    throw new Error("Unrecognized Azure RSS feed");
  const items = channel.item || [];
  if (
    items.some(
      (i) =>
        !i.title ||
        !(i.guid || i.link) ||
        !Number.isFinite(Date.parse(i.pubDate)),
    )
  )
    throw new Error("Invalid Azure incident");
  const incidents = items
    .filter((i) => !closedTitle.test(plain(i.title)))
    .map((i) => ({
      id: typeof i.guid === "object" ? i.guid["#text"] : i.guid || i.link,
      name: plain(i.title),
      status: "active",
      impact: "minor",
      startedAt: new Date(i.pubDate).toISOString(),
      updatedAt: new Date(i.pubDate).toISOString(),
      body: plain(i.description),
      url: /^https:\/\//.test(i.link) ? i.link : provider.url,
      components: [],
      updates: [
        {
          body: plain(i.description),
          status: "active",
          at: new Date(i.pubDate).toISOString(),
        },
      ],
    }));
  return {
    ...provider,
    status: incidents.length ? "degraded" : "operational",
    description: `${incidents.length ? "Active advisories reported" : "No active advisories reported"} in Azure’s public status feed. Account-specific incidents are available in Azure Service Health.`,
    checkedAt: now,
    sourceUpdatedAt: Number.isFinite(Date.parse(channel.lastBuildDate))
      ? new Date(channel.lastBuildDate).toISOString()
      : null,
    components: [],
    incidents,
  };
}

export function normalizeAws(provider, data, now) {
  if (
    !Array.isArray(data) ||
    data.some(
      (i) =>
        !i.arn ||
        !i.service ||
        !i.service_name ||
        !i.summary ||
        !["0", "1", "2", "3"].includes(String(i.status)) ||
        !Array.isArray(i.event_log),
    )
  )
    throw new Error("Unrecognized AWS current events feed");
  const active = data.filter((i) => String(i.status) !== "0");
  const incidents = active.map((i) => {
    const updates = i.event_log
      .map((u) => ({
        body: plain(u.message),
        status: String(u.status) === "0" ? "resolved" : "active",
        at: iso(u.timestamp),
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
    return {
      id: i.arn,
      name: `${i.service_name}${i.region_name ? ` (${i.region_name})` : ""}: ${i.summary}`,
      status: "active",
      impact: String(i.status) === "3" ? "major" : "minor",
      startedAt: iso(i.date),
      updatedAt: updates[0]?.at || iso(i.date),
      body: updates[0]?.body || "",
      url: provider.url,
      components: [
        i.service_name + (i.region_name ? ` / ${i.region_name}` : ""),
      ],
      updates: updates.slice(0, 12),
    };
  });
  return {
    ...provider,
    status: active.some((i) => String(i.status) === "3")
      ? "outage"
      : active.length
        ? "degraded"
        : "operational",
    description: `${active.length ? "Active regional events reported" : "No active events reported"} in AWS’s public Health Dashboard. This does not include account-specific events.`,
    checkedAt: now,
    sourceUpdatedAt:
      incidents
        .map((i) => i.updatedAt)
        .sort()
        .at(-1) || null,
    components: active.map((i) => ({
      id: i.service,
      name: i.service_name + (i.region_name ? ` / ${i.region_name}` : ""),
      status:
        String(i.status) === "3" ? "major_outage" : "degraded_performance",
    })),
    incidents,
  };
}

// Instatus publishes components and nothing else: /v2/components.json is a bare
// { components: [...] } with no page indicator and no incidents array, so the
// overall reading has to be derived from the parts rather than read off the top.
// That is the same shape normalizeComponent already works in, so this converts
// the payload into the Statuspage vocabulary and hands it to the one normalizer
// every other feed ends at -- one contract downstream, whatever the source.
//
// Instatus names its states in SCREAMINGCASE with no separators. The mapping is
// deliberately total: an unrecognised state is an error rather than a silent
// "operational", because a status page inventing good news is the one failure
// this product cannot have.
const INSTATUS_STATES = {
  OPERATIONAL: "operational",
  UNDERMAINTENANCE: "under_maintenance",
  DEGRADEDPERFORMANCE: "degraded_performance",
  PARTIALOUTAGE: "partial_outage",
  MAJOROUTAGE: "major_outage",
};
// Worst wins, and maintenance does not outrank an outage.
const INSTATUS_RANK = {
  operational: 0,
  under_maintenance: 1,
  degraded_performance: 2,
  partial_outage: 3,
  major_outage: 4,
};
const INSTATUS_INDICATOR = {
  operational: "none",
  under_maintenance: "maintenance",
  degraded_performance: "minor",
  partial_outage: "minor",
  major_outage: "major",
};
export function normalizeInstatus(provider, data, now, normalizeSummary) {
  const raw = data?.components;
  if (!Array.isArray(raw) || !raw.length)
    throw new Error("Instatus feed carried no components");
  const components = raw.map((component) => {
    const status = INSTATUS_STATES[component.status];
    if (!status)
      throw new Error(
        `Unrecognized Instatus component state: ${component.status}`,
      );
    return {
      id: String(component.id),
      // The group is the half a reader recognises -- "Builds", "Edge Network" --
      // and Instatus puts it beside the part rather than in the name.
      name: component.group?.name
        ? `${component.group.name} / ${component.name}`
        : component.name,
      status,
    };
  });
  const worst = components.reduce(
    (at, component) =>
      INSTATUS_RANK[component.status] > INSTATUS_RANK[at]
        ? component.status
        : at,
    "operational",
  );
  const hurt = components.filter((c) => c.status !== "operational").length;
  return normalizeSummary(
    provider,
    {
      status: {
        indicator: INSTATUS_INDICATOR[worst],
        description: hurt
          ? `${hurt} of ${components.length} components are not operational.`
          : `All ${components.length} components operational.`,
      },
      components,
      // Instatus keeps incidents on a separate document this feed does not
      // carry, so none are claimed rather than guessed at. The components are
      // the evidence, and the official page is one tap away.
      incidents: [],
    },
    now,
  );
}

export function normalizeComponent(provider, data, now, normalizeSummary) {
  const component = data?.components?.find(
    (c) => c.id === provider.componentId && !c.group,
  );
  const indicators = {
    operational: "none",
    degraded_performance: "minor",
    partial_outage: "minor",
    major_outage: "major",
    under_maintenance: "maintenance",
  };
  if (!component || !indicators[component.status])
    throw new Error(
      "Replicate component is missing or unrecognized in the official feed",
    );
  const incidents = (data.incidents || []).filter((i) =>
    i.components?.some(
      (c) => (typeof c === "string" ? c : c.id) === component.id,
    ),
  );
  return normalizeSummary(
    provider,
    {
      ...data,
      status: {
        indicator: indicators[component.status],
        description: `Replicate reports ${component.status.replaceAll("_", " ")}.`,
      },
      components: [component],
      incidents,
    },
    now,
  );
}

// AWS currently sends UTF-16BE JSON. Fetch.text() assumes UTF-8 regardless of charset.
export function decodeFeedBytes(bytes, contentType = "") {
  const encoding =
    bytes[0] === 0xfe && bytes[1] === 0xff
      ? "utf-16be"
      : bytes[0] === 0xff && bytes[1] === 0xfe
        ? "utf-16le"
        : /charset\s*=\s*utf-16be/i.test(contentType)
          ? "utf-16be"
          : /charset\s*=\s*utf-16/i.test(contentType)
            ? "utf-16le"
            : "utf-8";
  return new TextDecoder(encoding, { fatal: true })
    .decode(bytes)
    .replace(/^\uFEFF/, "");
}
