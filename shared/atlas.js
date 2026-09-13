import { isFresh } from "./monitor.js";

export const hubs = [
  {
    name: "San Francisco",
    region: "North America",
    label: "AI & developer platforms",
    coordinates: "37.8° N / 122.4° W",
    names: ["san francisco"],
  },
  {
    name: "Virginia",
    region: "North America",
    label: "Cloud infrastructure",
    coordinates: "38.0° N / 77.0° W",
    names: ["northern virginia", "n. virginia", "ashburn"],
  },
  {
    name: "London",
    region: "Europe",
    label: "Cloud & connectivity",
    coordinates: "51.5° N / 0.1° W",
    names: ["london"],
  },
  {
    name: "Frankfurt",
    region: "Europe",
    label: "European infrastructure",
    coordinates: "50.1° N / 8.7° E",
    names: ["frankfurt"],
  },
  {
    name: "Mumbai",
    region: "Asia Pacific",
    label: "Cloud & digital services",
    coordinates: "19.1° N / 72.9° E",
    names: ["mumbai"],
  },
  {
    name: "Singapore",
    region: "Asia Pacific",
    label: "Regional cloud infrastructure",
    coordinates: "1.4° N / 103.8° E",
    names: ["singapore"],
  },
  {
    name: "Tokyo",
    region: "Asia Pacific",
    label: "Cloud & connectivity",
    coordinates: "35.7° N / 139.7° E",
    names: ["tokyo"],
  },
  {
    name: "Sydney",
    region: "Asia Pacific",
    label: "Regional cloud infrastructure",
    coordinates: "33.9° S / 151.2° E",
    names: ["sydney"],
  },
  {
    name: "São Paulo",
    region: "South America",
    label: "Regional cloud infrastructure",
    coordinates: "23.5° S / 46.6° W",
    names: ["sao paulo"],
  },
];
export const severityRank = {
  unknown: 0,
  operational: 1,
  maintenance: 2,
  degraded: 3,
  outage: 4,
};
export const signalLabels = {
  unknown: "Status unavailable",
  operational: "Reported operational",
  maintenance: "Maintenance",
  degraded: "Degraded",
  outage: "Major issue",
};
const componentStates = {
  operational: "operational",
  degraded_performance: "degraded",
  partial_outage: "degraded",
  major_outage: "outage",
  under_maintenance: "maintenance",
};
const impactStates = { minor: "degraded", major: "outage", critical: "outage" };
const active = (status) => ["degraded", "outage"].includes(status);
const worst = (states) =>
  states.reduce(
    (a, b) => (severityRank[b] > severityRank[a] ? b : a),
    "unknown",
  );
const normalize = (name) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const matchers = hubs.map((h) =>
  h.names.map(
    (name) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`,
        "u",
      ),
  ),
);
export function componentLocations(name) {
  return matchers.flatMap((patterns, index) =>
    patterns.some((pattern) => pattern.test(normalize(name))) ? [index] : [],
  );
}

export function buildAtlas(
  providers,
  now = Date.now(),
  { includeMaintenance = false } = {},
) {
  const include = (status) =>
    active(status) || (includeMaintenance && status === "maintenance");
  const locations = hubs.map((hub, index) => ({
    ...hub,
    index,
    signals: [],
    status: "unknown",
  }));
  const issues = [];
  let fresh = 0;
  for (const provider of providers) {
    if (!isFresh(provider, now) || provider.status === "unknown") continue;
    fresh++;
    const evidence = [];
    for (const component of provider.components || []) {
      const status = componentStates[component.status] || "unknown";
      const matched = componentLocations(component.name);
      const signal = {
        provider,
        name: component.name,
        status,
        kind: "Component",
        locations: matched,
      };
      for (const index of matched) locations[index].signals.push(signal);
      if (include(status)) evidence.push(signal);
    }
    for (const incident of provider.incidents || []) {
      if (
        ["resolved", "postmortem", "completed", "scheduled"].includes(
          incident.status,
        )
      )
        continue;
      const status =
        impactStates[incident.impact] ||
        (includeMaintenance && incident.impact === "maintenance"
          ? "maintenance"
          : null);
      if (status) {
        // A provider-wide incident stays in the service list, but an official
        // component or incident title that names a map hub is useful regional
        // evidence. Update text can mention an unaffected city, so it never
        // assigns an incident to a map location by itself.
        const matchedLocations = [
          ...(incident.components || []),
          incident.name,
        ].flatMap(componentLocations);
        const signal = {
          provider,
          name: incident.name,
          status,
          kind: "Active incident",
          incident,
          locations: [...new Set(matchedLocations)],
        };
        for (const index of signal.locations) locations[index].signals.push(signal);
        evidence.push(signal);
      }
    }
    if (include(provider.status))
      evidence.unshift({
        provider,
        name: provider.description,
        status: provider.status,
        kind: "Provider status",
        locations: [],
      });
    if (evidence.length)
      issues.push({
        provider,
        status: worst(evidence.map((e) => e.status)),
        evidence,
      });
  }
  for (const location of locations) {
    const states = location.signals.map((s) => s.status);
    const highest = worst(states);
    location.status =
      highest === "operational" && states.includes("unknown")
        ? "unknown"
        : highest;
    location.signals.sort(
      (a, b) => severityRank[b.status] - severityRank[a.status],
    );
  }
  issues.sort(
    (a, b) =>
      severityRank[b.status] - severityRank[a.status] ||
      a.provider.name.localeCompare(b.provider.name),
  );
  return { locations, issues, fresh, unavailable: providers.length - fresh };
}

export const workflowHints = {
  "Package registries":
    "Check dependency installs, package publishing, and CI builds that fetch packages.",
  "Developer tools":
    "Check source control, build pipelines, deployments, and error-reporting delivery.",
  "AI & machine learning":
    "Check model API errors, inference jobs, and the retry limits in your application.",
  "Cloud & infrastructure":
    "Check hosting, DNS, network paths, and the regions used by your services.",
  "Security platforms":
    "Check security scans, advisory checks, and integration delivery.",
  Communication:
    "Check messaging, voice, notification delivery, and queued jobs.",
  Productivity:
    "Check workspace access, connected automations, and integration jobs.",
};
