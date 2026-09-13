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
