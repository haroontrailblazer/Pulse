import { isFresh } from "./monitor.js";

// Every hub carries its own longitude and latitude, and scripts/generate-map.mjs
// projects the pins straight from this list. It used to keep a second array of
// coordinates in that script which had to stay index-aligned with this one by
// hand: add a hub here and forget there, and every pin after it silently moved
// to the wrong place on the map, with nothing to catch it. One list, one order,
// one source.
//
// `coordinates` is the string a reader sees and `lonlat` is what is drawn from;
// a test asserts they describe the same point, so the label cannot drift from
// the pin either.
//
// `names` are matched whole-word against component and incident names, so a
// pattern has to be a token a provider would really write. Bare airport codes
// and short slugs are avoided where they collide with ordinary words -- "arn"
// is Stockholm's airport and also every AWS resource name, so Stockholm is
// matched by its city and its region slug instead.
export const hubs = [
  {
    name: "San Francisco",
    lonlat: [-122.4, 37.8],
    region: "North America",
    label: "AI & developer platforms",
    coordinates: "37.8° N / 122.4° W",
    names: ["san francisco"],
  },
  {
    name: "Virginia",
    lonlat: [-77, 38],
    region: "North America",
    label: "Cloud infrastructure",
    coordinates: "38.0° N / 77.0° W",
    names: ["northern virginia", "n. virginia", "ashburn"],
  },
  {
    name: "London",
    lonlat: [-0.1, 51.5],
    region: "Europe",
    label: "Cloud & connectivity",
    coordinates: "51.5° N / 0.1° W",
    names: ["london"],
  },
  {
    name: "Frankfurt",
    lonlat: [8.7, 50.1],
    region: "Europe",
    label: "European infrastructure",
    coordinates: "50.1° N / 8.7° E",
    names: ["frankfurt"],
  },
  {
    name: "Mumbai",
    lonlat: [72.9, 19.1],
    region: "Asia Pacific",
    label: "Cloud & digital services",
    coordinates: "19.1° N / 72.9° E",
    names: ["mumbai"],
  },
  {
    name: "Singapore",
    lonlat: [103.8, 1.4],
    region: "Asia Pacific",
    label: "Regional cloud infrastructure",
    coordinates: "1.4° N / 103.8° E",
    names: ["singapore"],
  },
  {
    name: "Tokyo",
    lonlat: [139.7, 35.7],
    region: "Asia Pacific",
    label: "Cloud & connectivity",
    coordinates: "35.7° N / 139.7° E",
    names: ["tokyo"],
  },
  {
    name: "Sydney",
    lonlat: [151.2, -33.9],
    region: "Asia Pacific",
    label: "Regional cloud infrastructure",
    coordinates: "33.9° S / 151.2° E",
    names: ["sydney"],
  },
  {
    name: "São Paulo",
    lonlat: [-46.6, -23.5],
    region: "South America",
    label: "Regional cloud infrastructure",
    coordinates: "23.5° S / 46.6° W",
    names: ["sao paulo"],
  },
  {
    name: "Abu Dhabi",
    lonlat: [54.4, 24.5],
    region: "Asia Pacific",
    label: "Middle East cloud infrastructure",
    coordinates: "24.5° N / 54.4° E",
    names: [
      "abu dhabi",
      "uae",
      "united arab emirates",
      "middle east (uae)",
      "me-central-1",
    ],
  },
  {
    name: "Manama",
    lonlat: [50.6, 26.2],
    region: "Asia Pacific",
    label: "Middle East cloud infrastructure",
    coordinates: "26.2° N / 50.6° E",
    names: ["manama", "bahrain", "middle east (bahrain)", "me-south-1"],
  },
  {
    name: "Amsterdam",
    lonlat: [4.9, 52.4],
    region: "Europe",
    label: "European cloud & connectivity",
    coordinates: "52.4° N / 4.9° E",
    names: ["amsterdam", "ams2", "ams3"],
  },
  {
    name: "Paris",
    lonlat: [2.4, 48.9],
    region: "Europe",
    label: "European cloud infrastructure",
    coordinates: "48.9° N / 2.4° E",
    names: ["paris", "eu-west-3", "cdg"],
  },
  {
    name: "Dublin",
    lonlat: [-6.3, 53.3],
    region: "Europe",
    label: "Irish cloud infrastructure",
    coordinates: "53.3° N / 6.3° W",
    names: ["dublin", "eu-west-1", "ireland"],
  },
  {
    name: "Stockholm",
    lonlat: [18.1, 59.3],
    region: "Europe",
    label: "Nordic cloud infrastructure",
    coordinates: "59.3° N / 18.1° E",
    names: ["stockholm", "eu-north-1"],
  },
  {
    name: "Seattle",
    lonlat: [-122.3, 47.6],
    region: "North America",
    label: "US West cloud infrastructure",
    coordinates: "47.6° N / 122.3° W",
    names: ["seattle", "us-west-2", "oregon"],
  },
  {
    name: "Ohio",
    lonlat: [-83, 40],
    region: "North America",
    label: "US East cloud infrastructure",
    coordinates: "40.0° N / 83.0° W",
    names: ["ohio", "us-east-2", "columbus"],
  },
  {
    name: "Toronto",
    lonlat: [-79.4, 43.7],
    region: "North America",
    label: "Canadian cloud infrastructure",
    coordinates: "43.7° N / 79.4° W",
    names: ["toronto", "ca-central-1"],
  },
  {
    name: "Hong Kong",
    lonlat: [114.2, 22.3],
    region: "Asia Pacific",
    label: "East Asian connectivity",
    coordinates: "22.3° N / 114.2° E",
    names: ["hong kong", "ap-east-1", "hkg"],
  },
  {
    name: "Seoul",
    lonlat: [127, 37.6],
    region: "Asia Pacific",
    label: "Korean cloud infrastructure",
    coordinates: "37.6° N / 127.0° E",
    names: ["seoul", "ap-northeast-2", "icn"],
  },
  {
    name: "Cape Town",
    lonlat: [18.4, -33.9],
    region: "Africa",
    label: "African cloud infrastructure",
    coordinates: "33.9° S / 18.4° E",
    names: ["cape town", "af-south-1", "johannesburg"],
  },
  {
    name: "Worldwide",
    lonlat: [0, 0],
    region: "Global",
    label: "Service-wide official reports",
    coordinates: "No regional scope stated",
    names: [],
    global: true,
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
const incidentState = (provider, incident) => {
  const affected = new Set(incident.components || []);
  const componentState = worst(
    (provider.components || [])
      .filter(
        (component) =>
          affected.has(component.id) || affected.has(component.name),
      )
      .map((component) => componentStates[component.status] || "unknown"),
  );
  // Statuspage incident impact is set when the incident is opened and can
  // outlive the live component recovery state. Prefer the current affected
  // component, then the live provider state, before using that fallback.
  if (active(componentState)) return componentState;
  if (active(provider.status)) return provider.status;
  return impactStates[incident.impact] || null;
};
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
  const worldwide = locations.find((location) => location.global);
  const issues = [];
  let fresh = 0;
  for (const provider of providers) {
    if (!isFresh(provider, now) || provider.status === "unknown") continue;
    fresh++;
    const evidence = [];
    const placed = new Set();
    for (const component of provider.components || []) {
      const status = componentStates[component.status] || "unknown";
      const named = componentLocations(component.name);
      // A component that is in trouble and names no place still happened
      // somewhere, and until now it happened nowhere on this map. Most
      // providers never publish a region at component level -- they publish
      // "API", "Dashboard", "Webhooks" -- so a degraded API was simply absent
      // from the map while an incident with the same missing scope was already
      // being drawn at Worldwide. Same evidence, two different answers.
      //
      // So a component in trouble falls back the way an incident does: to the
      // hub whose whole meaning is "no regional scope stated". Only in trouble,
      // and only when nothing was named -- pushing healthy components there
      // would turn the one honest global marker into every provider's
      // switchboard and tell the reader nothing.
      const matched =
        named.length || !include(status) || !worldwide
          ? named
          : [worldwide.index];
      const signal = {
        provider,
        name: component.name,
        status,
        kind: "Component",
        locations: matched,
      };
      for (const index of matched) {
        locations[index].signals.push(signal);
        placed.add(index);
      }
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
        incidentState(provider, incident) ||
        (includeMaintenance && incident.impact === "maintenance"
          ? "maintenance"
          : null);
      if (status) {
        // Official component and incident names can name a map hub. Update
        // text can mention an unaffected city, so it never assigns an
        // incident to a map location by itself. When no regional scope is
        // published, show a clearly labelled worldwide signal instead of
        // inventing a city location.
        const regionalLocations = [
          ...(incident.components || []),
          incident.name,
        ].flatMap(componentLocations);
        const matchedLocations = regionalLocations.length
          ? regionalLocations
          : worldwide
            ? [worldwide.index]
            : [];
        const signal = {
          provider,
          name: incident.name,
          status,
          kind: "Active incident",
          incident,
          locations: [...new Set(matchedLocations)],
        };
        for (const index of signal.locations) {
          locations[index].signals.push(signal);
          placed.add(index);
        }
        evidence.push(signal);
      }
    }
    // Where a service goes when its own feed never says where it runs.
    //
    // Most status pages publish components called "API", "Dashboard",
    // "Webhooks" and nothing geographic at all, so until now a healthy service
    // of that kind was simply absent from the map -- fifty of the seventy-seven
    // were, and the only way onto it was to break. A map that draws a service
    // only once it fails is not a map of the services.
    //
    // So the provider's own reading is placed too, at the hub whose stated
    // meaning is "no regional scope stated", and only when nothing the provider
    // published has already put it somewhere. A service that names its regions
    // is drawn at them; a service that names none is drawn at the one marker
    // that says so. Nothing is invented: the hub is a statement about the feed,
    // not a claim about where the service runs.
    const reading = {
      provider,
      // The provider's own summary line, and its name when a feed publishes
      // none -- a missing sentence must not be what decides whether a service
      // is on the map at all.
      name: provider.description || provider.name,
      status: provider.status,
      kind: "Provider status",
      locations: placed.size || !worldwide ? [] : [worldwide.index],
    };
    for (const index of reading.locations)
      locations[index].signals.push(reading);
    if (include(provider.status)) evidence.unshift(reading);
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
  "Domains & hosting":
    "Check domain renewals, DNS records, nameserver changes, and control-panel access.",
  "Payments & commerce":
    "Check checkout, payment capture, payouts, webhooks, and order sync.",
};
// The map page already falls back when a category has no hint; the insights
// page did not. Naming the fallback once means both read the same sentence.
export const generalHint =
  "Compare your application errors and the provider's own components before changing anything.";
