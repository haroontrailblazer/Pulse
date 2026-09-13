import { isFresh } from "./monitor.js";
const time = (value) =>
  Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export function latestIncident(incident) {
  const updates = [...(incident.updates || [])].sort(
    (a, b) => time(b.at) - time(a.at),
  );
  const latest = updates[0];
  const timestamp = Math.max(
    time(incident.updatedAt),
    time(latest?.at),
    time(incident.startedAt),
  );
  return {
    ...incident,
    updates,
    updatedAt: timestamp ? new Date(timestamp).toISOString() : null,
    body:
      latest?.body ||
      incident.body ||
      "No update message was included in the feed.",
    components: incident.components || [],
  };
}
export function collectIncidents(providers, now = Date.now()) {
  const records = new Map();
  for (const provider of providers.filter((p) => isFresh(p, now)))
    for (const raw of provider.incidents || []) {
      if (
        ["resolved", "postmortem", "completed", "scheduled"].includes(
          raw.status,
        )
      )
        continue;
      const incident = {
        ...latestIncident(raw),
        provider,
        key: `${provider.id}:${raw.id}`,
      };
      const old = records.get(incident.key);
      if (!old || time(incident.updatedAt) >= time(old.updatedAt))
        records.set(incident.key, incident);
    }
  return [...records.values()].sort(
    (a, b) =>
      time(b.updatedAt) - time(a.updatedAt) || a.key.localeCompare(b.key),
  );
}
export function incidentRevision(incident) {
  return JSON.stringify([
    incident.updatedAt,
    incident.status,
    incident.impact,
    incident.name,
    incident.body,
  ]);
}
