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
const componentRank = {
  degraded_performance: 1,
  partial_outage: 2,
  major_outage: 3,
};
/**
 * What is worth interrupting someone for, as opposed to what is worth
 * remembering. The signature stays the full picture; this is the part of it that
 * may raise an alert.
 *
 * Components are collapsed to their worst level rather than kept as identities.
 * A provider like Cloudflare publishes a component per datacenter, and their
 * maintenance and partial-outage windows rotate all day, so every rotation used
 * to introduce an id the stored signature had never seen and therefore read as
 * news. Measured on the shipped Windows build: one open incident produced
 * nineteen identical toasts across four hours, every one of them carrying that
 * same incident's text, because the body is the provider's first incident. A
 * service getting worse is news; a different datacenter reaching the level the
 * service was already at is not.
 *
 * Maintenance is planned, so it is not an issue at all -- not as an aggregate
 * state, not as a component, not as a maintenance incident.
 */
export function alertKeys(signature) {
  const keys = new Set();
  let worst = 0;
  for (const part of (signature || "").split("|")) {
    if (!part || part === "status:maintenance") continue;
    if (part.startsWith("status:")) keys.add(part);
    else if (part.startsWith("component:"))
      worst = Math.max(
        worst,
        componentRank[part.slice(part.lastIndexOf(":") + 1)] || 0,
      );
    else if (part.startsWith("incident:") && !part.endsWith(":maintenance"))
      keys.add(part);
  }
  if (worst) keys.add(`component:${worst}`);
  return keys;
}
export function nextAlert(previous, provider) {
  const signature = alertSignature(provider);
  if (signature === null) return { signature: previous, notify: false };
  const old = alertKeys(previous);
  return {
    signature,
    notify: [...alertKeys(signature)].some((key) => !old.has(key)),
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
