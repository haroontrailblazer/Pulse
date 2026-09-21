import { buildAtlas, generalHint, workflowHints } from "./atlas.js";
import { isFresh } from "./monitor.js";
import { latestIncident } from "./incidents.js";
export const plainImpact = {
  "AI & machine learning":
    "Chatbots, coding assistants, or other AI features could be slow or fail.",
  "Package registries":
    "Installing dependencies or publishing packages could fail, delaying builds and releases.",
  "Developer tools":
    "Code changes, builds, deployments, or error reporting could be delayed.",
  "Cloud & infrastructure":
    "Websites, APIs, sign-ins, or background jobs could be affected if they use the reported service or region.",
  Communication:
    "Messages, calls, meetings, or notifications could be delayed or unavailable.",
  "Security platforms":
    "Security scans and vulnerability workflows could be delayed.",
  Productivity:
    "Shared documents, team tools, or connected automations could be interrupted.",
  "Domains & hosting":
    "Domain renewals, DNS changes, control panels, or sites on shared hosting could be affected.",
};
// Read with no fallback until now, which meant a provider in a category nobody
// had written a sentence for rendered "If you use the affected feature:" with
// nothing after the colon, and copied "Could affect: undefined" to the reader's
// clipboard. A category is data; a missing sentence should read as one sentence
// less, not as a broken one.
export const generalImpact =
  "Features that depend on this provider could be slow or fail.";
export function explainIndustry(items, industry, watchlist, now) {
  const relevant = items.filter((p) => p.industries.includes(industry));
  return explainProviders(relevant, watchlist, now);
}
export function explainDisruptions(items, watchlist, now, onlyWatched = false) {
  const relevant = onlyWatched
    ? items.filter((p) => watchlist.includes(p.id))
    : items;
  const data = explainProviders(relevant, watchlist, now);
  return {
    ...data,
    issues: data.issues.filter((i) =>
      ["outage", "degraded"].includes(i.status),
    ),
  };
}
function explainProviders(relevant, watchlist, now) {
  const atlas = buildAtlas(relevant, now);
  const issues = atlas.issues.map((issue) => {
    const rank = { outage: 4, degraded: 3, maintenance: 2 };
    const specific = issue.evidence
      .filter((e) => e.kind !== "Provider status")
      .sort(
        (a, b) =>
          (rank[b.status] || 0) - (rank[a.status] || 0) ||
          Number(!!b.incident) - Number(!!a.incident),
      );
    const primary = specific[0] || issue.evidence[0];
    return {
      ...issue,
      watched: watchlist.includes(issue.provider.id),
      headline: primary?.name || issue.provider.description,
      sourceMessage: primary?.incident
        ? latestIncident(primary.incident).body
        : "",
      // Guarded. These were bare lookups into two closed maps keyed by
      // category, so adding a category to the catalogue -- which is data, not
      // code -- rendered a dangling "If you use the affected feature:" and put
      // "Could affect: undefined" on the reader's clipboard.
      meaning: plainImpact[issue.provider.category] || generalImpact,
      action: workflowHints[issue.provider.category] || generalHint,
    };
  });
  return {
    relevant,
    issues,
    fresh: relevant.filter((p) => isFresh(p, now) && p.status !== "unknown")
      .length,
    unavailable: atlas.unavailable,
    watchedIssues: issues.filter((i) => i.watched).length,
  };
}
