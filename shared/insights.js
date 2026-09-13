import { buildAtlas, workflowHints } from "./atlas.js";
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
};
export function explainIndustry(items, industry, watchlist, now) {
  const relevant = items.filter((p) => p.industries.includes(industry));
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
      meaning: plainImpact[issue.provider.category],
      action: workflowHints[issue.provider.category],
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
