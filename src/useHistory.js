import { useCallback, useEffect, useRef, useState } from "react";
import { signalState } from "../shared/monitor.js";
import {
  BUCKETS,
  bucketAt,
  decodeHistory,
  emptyHistory,
  encodeHistory,
  recordState,
} from "../shared/history.js";

// Writes what Pulse saw to localStorage, one key per provider.
//
// The key is a prefix plus the provider id and is read back by stripping that
// prefix, never by splitting on ":" - a custom provider's id is already
// `custom:<hash>` and contains one.
const PREFIX = "pulse-history:";

// A bucket only rolls every five minutes, so there is no reason to touch
// storage on every 30-second reading. Writes are coalesced and flushed when a
// bucket actually advances, when a state gets worse within the current bucket,
// or when the page goes away - the same shape as the desktop monitor's
// persistSoon, which exists because that file was being rewritten constantly.
const FLUSH_MS = 20_000;

function loadAll() {
  const found = new Map();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const entry = decodeHistory(localStorage.getItem(key));
      // decodeHistory returns null for a journal from another schema or bucket
      // size. Dropping it is deliberate: drawn on the wrong time axis it would
      // read as fact.
      if (entry) found.set(key.slice(PREFIX.length), entry);
    }
  } catch {
    // Storage unavailable. The strip is empty rather than wrong.
  }
  return found;
}

export default function useHistory(items) {
  const entries = useRef(null);
  if (entries.current === null) entries.current = loadAll();
  const dirty = useRef(new Set());
  const timer = useRef(null);
  // Bumped when the ring actually changes, so a consumer re-renders. The map
  // itself is a ref because it is written far more often than it is read.
  const [revision, setRevision] = useState(0);
  // A journal that silently stopped recording would be a strip that is
  // confidently wrong, so a failed write is surfaced rather than swallowed.
  const [degraded, setDegraded] = useState(false);

  const flush = useCallback(() => {
    if (!dirty.current.size) return;
    const ids = [...dirty.current];
    dirty.current.clear();
    try {
      for (const id of ids) {
        const entry = entries.current.get(id);
        if (entry) localStorage.setItem(PREFIX + id, encodeHistory(entry));
      }
      setDegraded(false);
    } catch {
      setDegraded(true);
    }
  }, []);

  useEffect(() => {
    if (!Array.isArray(items) || !items.length) return;
    const now = Date.now();
    let changed = false;
    for (const provider of items) {
      if (!provider?.id) continue;
      const before = entries.current.get(provider.id);
      const base = before || emptyHistory(provider.id, provider.name);
      // The name is refreshed on every pass so a renamed provider relabels its
      // own history, but it is still stored with the data rather than looked up.
      const named = base.name === provider.name ? base : { ...base, name: provider.name };
      const next = recordState(named, signalState(provider), now);
      if (next !== named || named !== base) {
        entries.current.set(provider.id, next);
        dirty.current.add(provider.id);
        changed = true;
      }
    }
    if (!changed) return;
    setRevision((r) => r + 1);
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      flush();
    }, FLUSH_MS);
  }, [items, flush]);

  useEffect(() => {
    // pagehide rather than unload: it is the one that fires on mobile Safari and
    // when a WebView is backgrounded, which is exactly when a phone reader stops
    // watching.
    const leave = () => flush();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [flush]);

  const historyFor = useCallback(
    (id) => entries.current.get(id) || null,
    // revision is the dependency on purpose: the map is mutated in place, so the
    // identity of this callback is what tells a consumer to read it again.
    [revision],
  );

  return { historyFor, degraded, buckets: BUCKETS, bucketAt };
}
