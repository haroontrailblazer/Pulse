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
/**
 * Is the reader's quiet window open right now?
 *
 * Three integers and nothing else. No Date, no timezone, no locale - each tier
 * supplies the hour from its own calendar, exactly as the update check's
 * dueFrom takes `hourNow` so that shared/update-cases.json can assert the
 * decision without asserting a timezone. Android reads Calendar.getInstance(),
 * the desktop reads new Date().getHours(), and both travel with the reader.
 *
 * `from` is inclusive and `to` is exclusive, so 22 to 7 is quiet at 22:00 and
 * noisy again at 07:00. A window that wraps midnight is the normal case rather
 * than the edge case, which is why it is the thing the table covers most.
 * from === to means no quiet hours at all, not a 24-hour silence: the settings
 * UI cannot express "always" and a reader who set both to the same value meant
 * to turn it off.
 */
export function quietNow(hourNow, from, to) {
  if (!Number.isInteger(hourNow) || !Number.isInteger(from) || !Number.isInteger(to))
    return false;
  if (from === to) return false;
  return from < to ? hourNow >= from && hourNow < to : hourNow >= from || hourNow < to;
}
/**
 * Did a provider that was reporting a problem stop reporting one?
 *
 * This existed only in Java. FeedReading.resolved has been deciding it on the
 * phone since it shipped, and PulseStore posts "back to normal" from it; the
 * desktop had no counterpart and so never announced a recovery at all. The two
 * tiers are now the same function and shared/alert-cases.json is asserted by
 * both test suites, so they cannot drift apart again without a failed build.
 *
 * A null next signature means the feed could not be read. That is not evidence
 * of recovery, and saying it was would turn every network blip into good news.
 */
export function resolved(previous, next) {
  return next !== null && alertKeys(previous).size > 0 && alertKeys(next).size === 0;
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
