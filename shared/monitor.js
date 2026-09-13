import { unknownProvider } from "./providers.js";

export const REFRESH_MS = 30_000;
export const STALE_MS = 300_000;
export const DESKTOP_REFRESH_MS = 300_000;
export const ANDROID_REFRESH_MS = 900_000;
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
    flight = Promise.all(
      catalog.map(async (provider) => {
        const previous = items.find((p) => p.id === provider.id);
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
        const events = detectChanges(previous, result).map((event, i) => ({
          ...event,
          id: `${revision}-${provider.id}-${i}`,
          providerId: provider.id,
          providerName: provider.name,
          observedAt: new Date(clock()).toISOString(),
        }));
        history = [...events, ...history].slice(0, 250);
        items = items.map((p) => (p.id === provider.id ? result : p));
        for (const listener of readingListeners) {
          try { listener(result); } catch { /* One consumer must not stop collection. */ }
        }
        completedChecks++;
        emit();
      }),
    )
      .then(() => {
        fetchedAt = new Date(clock()).toISOString();
        nextCheckAt = new Date(lastStart + intervalMs).toISOString();
      })
      .finally(() => {
        flight = null;
        refreshing = false;
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
  return { snapshot, refresh, subscribe, observeReadings(listener) {
    readingListeners.add(listener);
    return () => readingListeners.delete(listener);
  } };
}
