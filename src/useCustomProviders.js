import { useCallback, useEffect, useRef, useState } from "react";
import { feedUrl, normalizeFeed, unknownProvider } from "../shared/providers.js";
import { FETCH_PARALLEL, REFRESH_MS } from "../shared/monitor.js";
import {
  makeCustomProvider,
  normalizeCustomUrl,
  refuseUnusableFeed,
} from "../shared/custom-providers.js";

// Providers the reader added themselves.
//
// These are fetched HERE, in the browser, and not by /api/status. That is a real
// difference from the seventy-seven built-ins and it is deliberate: the hosted
// API is one shared, CDN-cached snapshot with s-maxage=30, so a per-reader
// provider list cannot go in it without making the cache per-reader. Statuspage
// serves `Access-Control-Allow-Origin: *` on its summary endpoint - measured, not
// assumed - so the browser can read these directly, which also means no
// user-supplied URL is ever fetched by the server and no SSRF surface is added
// to Vercel.
//
// The cost of that choice, stated rather than hidden: these only refresh while a
// tab or window is open. The Android background worker and the Windows tray
// monitor read their own catalogs and know nothing about this list, so a custom
// provider raises no alerts and appears in no widget yet.

const STORE = "pulse-custom-providers";

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    if (!Array.isArray(raw)) return [];
    // Rebuild through makeCustomProvider rather than trusting what was stored:
    // a list written by an older build, or hand-edited, must not be able to put
    // a provider missing `industries` into the interface, because two call sites
    // read it unguarded and would white-screen the Overview.
    return raw
      .map((p) => {
        try {
          return makeCustomProvider(p.url, { name: p.name, color: p.color });
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Fetch one custom feed. Mirrors what server/status.js does for the built-ins,
 * because the browser path inherits none of its guards.
 */
async function read(provider, signal) {
  const response = await fetch(feedUrl(provider), {
    signal,
    // No credentials to a third-party status page, ever.
    credentials: "omit",
    redirect: "follow",
  });
  const body = await response.text();
  refuseUnusableFeed({
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    bytes: body.length,
  });
  return normalizeFeed(provider, body);
}

export default function useCustomProviders(autoRefresh = true) {
  // Own visibility rather than taking it as a prop: useLiveStatus keeps its own
  // copy of this and App has none, so a parameter would have to be threaded
  // through from a value that does not exist there.
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  const [list, setList] = useState(load);
  const [readings, setReadings] = useState(() => list.map(unknownProvider));
  const listRef = useRef(list);
  listRef.current = list;

  useEffect(() => {
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify(list.map(({ url, name, color }) => ({ url, name, color }))),
      );
    } catch {
      // A reader with storage disabled still gets the providers for this
      // session; losing them on reload is better than refusing to add one.
    }
  }, [list]);

  const sweep = useCallback(async (signal) => {
    const queue = listRef.current.slice();
    if (!queue.length) {
      setReadings([]);
      return;
    }
    const done = new Map();
    // The same ceiling the shared monitor settled on. It is here for the same
    // reason recorded there: the catalog used to open one connection per
    // provider per pass, and twelve reads everything without the thundering
    // start. A reader's own list is usually short, but it is not bounded.
    const workers = Array.from(
      { length: Math.min(FETCH_PARALLEL, queue.length) },
      async () => {
        for (;;) {
          const provider = queue.shift();
          if (!provider || signal?.aborted) return;
          try {
            done.set(provider.id, await read(provider, signal));
          } catch (error) {
            // An unreadable feed is unavailable, never assumed healthy - the
            // same rule the rest of Pulse follows. The reason is kept so the
            // manage view can show it.
            done.set(provider.id, {
              ...unknownProvider(provider),
              description: error?.message || "Status unavailable",
            });
          }
        }
      },
    );
    await Promise.all(workers);
    if (signal?.aborted) return;
    setReadings(listRef.current.map((p) => done.get(p.id) || unknownProvider(p)));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void sweep(controller.signal);
    if (!autoRefresh || !visible) return () => controller.abort();
    const timer = setInterval(() => void sweep(controller.signal), REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [list, visible, autoRefresh, sweep]);

  const add = useCallback((input, options) => {
    // Throws with a reader-facing reason; the caller shows it.
    const provider = makeCustomProvider(input, options);
    setList((current) =>
      current.some((p) => p.id === provider.id)
        ? current.map((p) => (p.id === provider.id ? provider : p))
        : [...current, provider],
    );
    return provider;
  }, []);

  const remove = useCallback((id) => {
    setList((current) => current.filter((p) => p.id !== id));
    setReadings((current) => current.filter((p) => p.id !== id));
  }, []);

  return { list, readings, add, remove, normalizeCustomUrl };
}
