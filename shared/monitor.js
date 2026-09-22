import { unknownProvider } from "./providers.js";

export const REFRESH_MS = 30_000;
export const STALE_MS = 300_000;
export const DESKTOP_REFRESH_MS = 30_000;
export const ANDROID_REFRESH_MS = 900_000;
export const SIGNAL_WINDOW_MS = 15 * 60_000;
export const SIGNAL_SLOTS = 12;
export const SIGNAL_SLOT_MS = SIGNAL_WINDOW_MS / SIGNAL_SLOTS;
// How many feeds one pass reads at once. It used to be the whole catalog, which
// at 77 providers meant 77 simultaneous TLS handshakes every thirty seconds.
// Measured against the shipped catalog: twelve connections read everything in
// 9.3s and twenty-four in 5.5s, with per-feed latency flat, so twelve keeps a
// pass comfortably inside REFRESH_MS without the thundering start.
export const FETCH_PARALLEL = 12;
// The floor between published snapshots during a pass. Publishing is the
// expensive half of a refresh -- every emit rebuilds a snapshot, the SSE layer
// diffs it against the previous one and serialises it, and the renderer
// re-renders the dashboard -- and this used to happen once per provider, so a
// 77-provider pass repainted the app 77 times. The first completion still
// publishes immediately, so progress never looks stalled.
export const PUBLISH_MS = 400;

const signalRanks = {
  unknown: 0,
  operational: 1,
  under_maintenance: 2,
  degraded_performance: 3,
  partial_outage: 3,
  major_outage: 4,
};
const providerSignalStates = {
  operational: "operational",
  maintenance: "under_maintenance",
  degraded: "degraded_performance",
  outage: "major_outage",
  unknown: "unknown",
};
const incidentSignalStates = {
  maintenance: "under_maintenance",
  minor: "degraded_performance",
  major: "major_outage",
  critical: "major_outage",
};

export function signalState(provider) {
  if (!provider.checkedAt || provider.stale || provider.status === "unknown")
    return "unknown";
  let state = providerSignalStates[provider.status] || "unknown";
  for (const component of provider.components || []) {
    const candidate = component.status;
    if ((signalRanks[candidate] || 0) > (signalRanks[state] || 0))
      state = candidate;
  }
  // Current provider and component states are more reliable than an incident
  // impact chosen when the incident was first opened.
  if ((signalRanks[state] || 0) >= signalRanks.degraded_performance)
    return state;
  for (const incident of provider.incidents || []) {
    if (
      ["resolved", "postmortem", "completed", "scheduled"].includes(
        incident.status,
      )
    )
      continue;
    const candidate = incidentSignalStates[incident.impact];
    if ((signalRanks[candidate] || 0) > (signalRanks[state] || 0))
      state = candidate;
  }
  return state;
}

export function appendSignal(previous, provider, observedAt = Date.now()) {
  const timestamp =
    typeof observedAt === "number" ? observedAt : Date.parse(observedAt);
  const now = Number.isFinite(timestamp) ? timestamp : Date.now();
  const earliestSlot = Math.floor((now - SIGNAL_WINDOW_MS) / SIGNAL_SLOT_MS);
  const slots = new Map();
  for (const signal of previous?.signals || []) {
    const at = Date.parse(signal.at);
    const slot = Math.floor(at / SIGNAL_SLOT_MS);
    if (
      Number.isFinite(at) &&
      slot >= earliestSlot &&
      signalRanks[signal.status] !== undefined
    )
      slots.set(slot, signal);
  }
  slots.set(Math.floor(now / SIGNAL_SLOT_MS), {
    at: new Date(now).toISOString(),
    status: signalState(provider),
  });
  return [...slots.entries()]
    .sort(([first], [second]) => first - second)
    .slice(-SIGNAL_SLOTS)
    .map(([, signal]) => signal);
}

export function signalWindow(provider, now = Date.now()) {
  const timestamp = typeof now === "number" ? now : Date.parse(now);
  const currentSlot = Math.floor(
    (Number.isFinite(timestamp) ? timestamp : Date.now()) / SIGNAL_SLOT_MS,
  );
  const readings = new Map(
    (provider.signals || [])
      .filter((signal) => signalRanks[signal.status] !== undefined)
      .map((signal) => [
        Math.floor(Date.parse(signal.at) / SIGNAL_SLOT_MS),
        signal,
      ]),
  );
  return Array.from({ length: SIGNAL_SLOTS }, (_, index) => {
    const slot = currentSlot - SIGNAL_SLOTS + index + 1;
    return readings.get(slot) || { status: "unknown", at: null };
  });
}
export function isFresh(provider, now = Date.now()) {
  return (
    !provider.stale &&
    !!provider.checkedAt &&
    now - Date.parse(provider.checkedAt) < STALE_MS
  );
}
export function failedReading(
  provider,
  previous,
  reason,
  now = new Date().toISOString(),
) {
  return {
    ...unknownProvider(provider),
    checkedAt: previous?.checkedAt || null,
    lastKnownStatus:
      previous?.lastKnownStatus ||
      (previous?.status !== "unknown" ? previous?.status : null),
    components: previous?.components || [],
    incidents: previous?.incidents || [],
    signals: previous?.signals || [],
    sourceUpdatedAt: previous?.sourceUpdatedAt || null,
    stale: !!previous?.checkedAt,
    attemptedAt: now,
    error: reason,
    responseMs: null,
  };
}
export function detectChanges(previous, next) {
  if (!next.checkedAt || next.stale || next.status === "unknown")
    return previous?.checkedAt && !previous.stale
      ? [
          {
            kind: "verification",
            text: "Feed unavailable; keeping the last verified reading.",
          },
        ]
      : [];
  if (!previous?.checkedAt)
    return [
      { kind: "baseline", text: `First verified reading: ${next.status}.` },
    ];
  const changes = [];
  if (previous.stale)
    changes.push({
      kind: "verification",
      text: "Official feed is reachable again.",
    });
  const previousStatus = previous.lastKnownStatus || previous.status;
  if (previousStatus !== next.status)
    changes.push({
      kind: "status",
      text: `Provider status: ${previousStatus} → ${next.status}.`,
    });
  for (const c of next.components) {
    const old = previous.components.find((p) => p.id === c.id);
    if (old && old.status !== c.status)
      changes.push({
        kind: "component",
        text: `${c.name}: ${old.status} → ${c.status}.`,
      });
  }
  for (const i of next.incidents) {
    const old = previous.incidents.find((p) => p.id === i.id);
    if (
      !old ||
      old.updatedAt !== i.updatedAt ||
      old.status !== i.status ||
      old.body !== i.body
    )
      changes.push({
        kind: "incident",
        text: `${old ? "Incident updated" : "New active incident"}: ${i.name}`,
        url: i.url,
      });
  }
  for (const i of previous.incidents)
    if (!next.incidents.some((p) => p.id === i.id))
      changes.push({
        kind: "incident",
        text: `No longer listed as active: ${i.name}`,
        url: i.url,
      });
  return changes;
}
export function createMonitor({
  catalog,
  fetcher,
  clock = Date.now,
  intervalMs = REFRESH_MS,
}) {
  let items = catalog.map(unknownProvider),
    history = [],
    flight = null,
    revision = 0;
  let startedAt = new Date(clock()).toISOString(),
    fetchedAt = null,
    nextCheckAt = null,
    lastStart = null;
  let refreshing = false,
    completedChecks = 0,
    timer;
  const listeners = new Set();
  // Passive observers receive each reading without keeping foreground polling alive.
  const readingListeners = new Set();
  const snapshot = () => ({
    providers: items,
    history,
    startedAt,
    fetchedAt,
    nextCheckAt,
    refreshing,
    completedChecks,
    revision,
    refreshSeconds: intervalMs / 1000,
  });
  const emit = () => {
    revision++;
    for (const listener of listeners) listener(snapshot());
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = null;
    if (listeners.size && !refreshing) {
      const delay = nextCheckAt
        ? Math.max(0, Date.parse(nextCheckAt) - clock())
        : intervalMs;
      timer = setTimeout(() => {
        timer = null;
        void refresh();
      }, delay);
      timer.unref?.();
    }
  };
  async function refresh({ force = false } = {}) {
    if (flight) {
      await flight;
      return snapshot();
    }
    if (
      lastStart !== null &&
      clock() - lastStart < (force ? 5_000 : intervalMs)
    )
      return snapshot();
    lastStart = clock();
    clearTimeout(timer);
    timer = null;
    refreshing = true;
    completedChecks = 0;
    emit();
    // One index and one working array, rather than a find and a full map per
    // provider: both of those were O(n) inside an O(n) loop, so a single pass
    // over 77 providers was scanning and rebuilding the array 77 times over.
    // Snapshots are still published as a fresh array with the untouched entries
    // identity-equal, because that is exactly what the stream diff compares.
    const working = items.slice();
    const at = new Map(working.map((p, index) => [p.id, index]));
    let dirty = false,
      publishTimer = null;
    const publishNow = () => {
      dirty = false;
      items = working.slice();
      emit();
    };
    const arm = () => {
      publishTimer = setTimeout(() => {
        publishTimer = null;
        if (dirty) {
          publishNow();
          arm();
        }
      }, PUBLISH_MS);
      publishTimer.unref?.();
    };
    const publish = () => {
      dirty = true;
      if (publishTimer) return;
      publishNow();
      arm();
    };
    const queue = catalog.slice();
    flight = Promise.all(
      Array.from(
        { length: Math.min(FETCH_PARALLEL, queue.length) },
        async () => {
          for (
            let provider = queue.shift();
            provider;
            provider = queue.shift()
          ) {
            const index = at.get(provider.id);
            const previous = index === undefined ? undefined : working[index];
            let result;
            try {
              result = await fetcher(provider);
            } catch (error) {
              result = { ...unknownProvider(provider), error: error.message };
            }
            if (!result.checkedAt)
              result = failedReading(
                provider,
                previous,
                result.error || result.description,
                new Date(clock()).toISOString(),
              );
            else result = { ...result, stale: false, lastKnownStatus: null };
            result = {
              ...result,
              signals: appendSignal(previous, result, clock()),
            };
            const events = detectChanges(previous, result).map((event, i) => ({
              ...event,
              id: `${revision}-${provider.id}-${i}`,
              providerId: provider.id,
              providerName: provider.name,
              observedAt: new Date(clock()).toISOString(),
            }));
            history = [...events, ...history].slice(0, 250);
            if (index !== undefined) working[index] = result;
            for (const listener of readingListeners) {
              try {
                listener(result);
              } catch {
                /* One consumer must not stop collection. */
              }
            }
            completedChecks++;
            publish();
          }
        },
      ),
    )
      .then(() => {
        fetchedAt = new Date(clock()).toISOString();
        nextCheckAt = new Date(lastStart + intervalMs).toISOString();
      })
      .finally(() => {
        clearTimeout(publishTimer);
        publishTimer = null;
        flight = null;
        refreshing = false;
        // The last word is always published, whatever the throttle was holding.
        items = working.slice();
        emit();
        schedule();
      });
    await flight;
    return snapshot();
  }
  function subscribe(listener) {
    listeners.add(listener);
    listener(snapshot());
    void refresh().then(schedule);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }
  return {
    snapshot,
    refresh,
    subscribe,
    observeReadings(listener) {
      readingListeners.add(listener);
      return () => readingListeners.delete(listener);
    },
  };
}
