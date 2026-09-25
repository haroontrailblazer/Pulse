// A local journal of what Pulse actually saw, per provider.
//
// The product already had a time-bucketed ring - `appendSignal` in
// shared/monitor.js - computed on every reading, shipped inside every snapshot,
// and rendered by nothing. This is the same idea with the two properties that
// one lacks: it survives a restart, and it distinguishes "we were not looking"
// from "it was fine".
//
// Shape: one character per bucket, a fixed-length string. That is the whole
// trick. A bucket's timestamp is derived from its position relative to `end`
// rather than stored, so a month of history for one provider is a few kilobytes
// instead of a few hundred, and the whole journal fits in localStorage with an
// order of magnitude of headroom. localStorage rather than IndexedDB because
// every other store in this app is read synchronously at first render, and an
// async journal means a strip that flickers empty on every mount.

export const HISTORY_VERSION = 1;
export const BUCKET_MS = 5 * 60_000;
export const BUCKETS = (30 * 24 * 60 * 60 * 1000) / BUCKET_MS; // 30 days

// One character per state. `signalState()` in shared/monitor.js returns the six
// below; `unrecorded` is the seventh and the most important, because it is the
// one a strip must never draw as health.
const MARKS = {
  unrecorded: ".",
  unknown: "?",
  operational: "o",
  under_maintenance: "m",
  degraded_performance: "d",
  partial_outage: "p",
  major_outage: "x",
};
const STATES = Object.fromEntries(Object.entries(MARKS).map(([k, v]) => [v, k]));

// Worst-wins inside a bucket. Deliberately not the monitor's last-write-wins:
// at 75-second slots that is harmless, but at five minutes it would erase a
// four-minute outage entirely. A strip that reads slightly redder than a
// sampled truth is the right error to make.
const RANK = {
  unrecorded: -1,
  unknown: 0,
  operational: 1,
  under_maintenance: 2,
  degraded_performance: 3,
  partial_outage: 3,
  major_outage: 4,
};

export function bucketAt(when) {
  return Math.floor(when / BUCKET_MS);
}

export function emptyHistory(id, name) {
  return {
    id,
    // Denormalized on purpose: a month-long strip routinely outlives a custom
    // provider the reader deleted, and a catalog lookup would return nothing.
    name,
    end: 0,
    buckets: MARKS.unrecorded.repeat(BUCKETS),
  };
}

/**
 * Record one observed state at one moment.
 *
 * Returns a new entry. A timestamp older than the newest bucket is dropped
 * rather than rewriting the past, because a late or clock-corrected reading
 * must not silently redraw a strip a reader has already looked at.
 */
export function recordState(entry, state, when) {
  const mark = MARKS[state] || MARKS.unknown;
  const index = bucketAt(when);
  if (!entry.end) {
    // First ever write: place it at the end of the ring.
    const buckets = MARKS.unrecorded.repeat(BUCKETS - 1) + mark;
    return { ...entry, end: index, buckets };
  }
  if (index < entry.end) return entry;
  if (index === entry.end) {
    const current = STATES[entry.buckets.at(-1)] ?? "unrecorded";
    if (RANK[state] <= RANK[current]) return entry;
    return { ...entry, buckets: entry.buckets.slice(0, -1) + mark };
  }
  // Time has moved on. Everything between the old end and the new one went
  // unobserved, and is shifted in as gaps rather than carried forward.
  const advanced = index - entry.end;
  if (advanced >= BUCKETS)
    return { ...entry, end: index, buckets: MARKS.unrecorded.repeat(BUCKETS - 1) + mark };
  const buckets =
    entry.buckets.slice(advanced) + MARKS.unrecorded.repeat(advanced - 1) + mark;
  return { ...entry, end: index, buckets };
}

/** The ring as state names, oldest first. Always BUCKETS long. */
export function bucketStates(entry) {
  return [...entry.buckets].map((c) => STATES[c] ?? "unrecorded");
}

/** The wall-clock start of the bucket at `index` within bucketStates(). */
export function bucketTime(entry, index) {
  return (entry.end - (BUCKETS - 1 - index)) * BUCKET_MS;
}

export function encodeHistory(entry) {
  return JSON.stringify({
    v: HISTORY_VERSION,
    id: entry.id,
    name: entry.name,
    slotMs: BUCKET_MS,
    end: entry.end,
    b: entry.buckets,
  });
}

/**
 * Read a stored journal back, or null.
 *
 * Null for anything that is not exactly this schema at exactly this bucket size.
 * A journal recorded on a different time axis is worse than no journal: it would
 * be drawn on the wrong scale and read as fact.
 */
export function decodeHistory(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.v !== HISTORY_VERSION) return null;
  if (parsed.slotMs !== BUCKET_MS) return null;
  if (typeof parsed.b !== "string" || parsed.b.length !== BUCKETS) return null;
  if (typeof parsed.end !== "number" || !Number.isFinite(parsed.end)) return null;
  return {
    id: String(parsed.id ?? ""),
    name: String(parsed.name ?? ""),
    end: parsed.end,
    buckets: parsed.b,
  };
}

export { MARKS };
