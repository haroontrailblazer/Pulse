import { buildAtlas } from "./atlas.js";
import { collectIncidents } from "./incidents.js";
import { isFresh } from "./monitor.js";

const priority = {
  outage: 6,
  degraded: 5,
  unknown: 4,
  maintenance: 3,
  update: 2,
  operational: 1,
};
export function overviewSnapshot(items, watchlist, now) {
  const atlas = buildAtlas(items, now, { includeMaintenance: true });
  const conditions = new Map(atlas.issues.map((row) => [row.provider.id, row]));
  const incidents = collectIncidents(items, now);
  const updating = new Set(incidents.map((i) => i.provider.id));
  const services = items.map((provider) => {
    const current = isFresh(provider, now) && provider.status !== "unknown";
    const condition = conditions.get(provider.id);
    const status = !current
      ? "unknown"
      : condition?.status ||
        (updating.has(provider.id) ? "update" : provider.status);
    return { provider, status };
  });
  const watched = services
    .filter((row) => watchlist.includes(row.provider.id))
    .sort(
      (a, b) =>
        priority[b.status] - priority[a.status] ||
        a.provider.name.localeCompare(b.provider.name),
    );
  const disrupted = watched.filter((row) =>
    ["outage", "degraded"].includes(row.status),
  );
  return {
    services,
    watched,
    disrupted,
    incidents,
    unavailable: watched.filter((row) => row.status === "unknown"),
    maintenance: watched.filter((row) => row.status === "maintenance"),
    updates: watched.filter((row) => row.status === "update"),
    fresh: services.filter((row) => row.status !== "unknown").length,
    regionalIssues: atlas.locations.filter((h) =>
      ["outage", "degraded"].includes(h.status),
    ).length,
  };
}
