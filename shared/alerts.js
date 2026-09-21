import { providers } from "./providers.js";
// Alert only from successful official readings. Persist the last successful
// signature across unavailable checks so reconnects do not repeat an alert.
export function alertSignature(provider) {
  if (!provider.checkedAt || provider.stale || provider.status === "unknown")
    return null;
  const parts = [];
  if (["degraded", "outage", "maintenance"].includes(provider.status))
    parts.push(`status:${provider.status}`);
  for (const c of provider.components || [])
    if (
      [
        "degraded_performance",
        "partial_outage",
        "major_outage",
        "under_maintenance",
      ].includes(c.status)
    )
      parts.push(`component:${c.id}:${c.status}`);
  for (const i of provider.incidents || [])
    if (
      !["resolved", "postmortem", "completed", "scheduled"].includes(i.status)
    )
      parts.push(`incident:${i.id}:${i.impact || "minor"}`);
  return parts.sort().join("|");
}
export function nextAlert(previous, provider) {
  const signature = alertSignature(provider);
  if (signature === null) return { signature: previous, notify: false };
  const old = new Set((previous || "").split("|"));
  return {
    signature,
    notify: !!signature && signature.split("|").some((part) => !old.has(part)),
  };
}
// The default is the catalogue's own automated-feed count rather than a number
// copied out of it, so adding a provider cannot leave the budget describing a
// product that no longer exists.
export const automatedFeeds = providers.filter(
  (p) => p.format !== "source-only",
).length;
export function requestBudget(watched, feeds = automatedFeeds) {
  const androidIntervalSeconds = Math.min(300, Math.max(30, watched * 30));
  return {
    oldHourly: feeds * 120,
    foregroundHourly: feeds * 120,
    androidHourly: watched
      ? Math.ceil((watched * 3600) / androidIntervalSeconds)
      : 0,
    desktopHourly: watched * 120,
  };
}
