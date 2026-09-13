import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import {
  providers,
  unknownProvider,
  feedUrl,
  normalizeFeed,
} from "../shared/providers.js";
import { createMonitor, isFresh, REFRESH_MS } from "../shared/monitor.js";

const native = Capacitor.isNativePlatform();
const base = import.meta.env.VITE_API_BASE_URL || "";
const initial = () => ({
  providers: providers.map(unknownProvider),
  history: [],
  fetchedAt: null,
  nextCheckAt: null,
  refreshing: true,
  completedChecks: 0,
});
export default function useLiveStatus(autoRefresh) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("connecting");
  const [now, setNow] = useState(Date.now);
  const [visible, setVisible] = useState(() => !document.hidden);
  const running = useRef(false);
  const nativeMonitor = useRef(null);
  if (native && !nativeMonitor.current)
    nativeMonitor.current = createMonitor({
      catalog: providers,
      fetcher: async (provider) => {
        if (provider.format === "source-only") return unknownProvider(provider);
        const start = Date.now();
        try {
          const response = await CapacitorHttp.get({
            url: feedUrl(provider),
            connectTimeout: 15000,
            readTimeout: 15000,
            headers: {
              Accept: "application/json",
              "Cache-Control": "no-cache",
            },
          });
          if (response.status !== 200)
            throw new Error(`Official feed returned HTTP ${response.status}`);
          const result = normalizeFeed(
            provider,
            typeof response.data === "string"
              ? JSON.parse(response.data)
              : response.data,
          );
          return {
            ...result,
            responseMs: Date.now() - start,
            attemptedAt: result.checkedAt,
            error: null,
          };
        } catch (e) {
          return {
            ...unknownProvider(provider),
            error: e.message,
            attemptedAt: new Date().toISOString(),
          };
        }
      },
    });
  const accept = useCallback((incoming) => {
    if (!Array.isArray(incoming.providers))
      throw new Error("Invalid monitoring response");
    setNow(Date.now());
    setData((previous) =>
      incoming.startedAt === previous.startedAt &&
      incoming.revision < previous.revision
        ? previous
        : {
            ...incoming,
            providers: incoming.partial
              ? previous.providers.map(
                  (p) => incoming.providers.find((n) => n.id === p.id) || p,
                )
              : incoming.providers,
          },
    );
    setError("");
  }, []);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setData((p) => ({ ...p, refreshing: true }));
    try {
      if (native) accept(await nativeMonitor.current.refresh({ force: true }));
      else {
        const response = await fetch(`${base}/api/status?refresh=1`, {
          cache: "no-store",
          signal: AbortSignal.timeout(25000),
        });
        if (!response.ok)
          throw new Error(`Monitor returned HTTP ${response.status}`);
        accept(await response.json());
      }
    } catch (e) {
      setError(
        `${e.message}. Retaining last readings; stale data is excluded from current health counts.`,
      );
    } finally {
      running.current = false;
      setData((p) => ({ ...p, refreshing: false }));
    }
  }, [accept]);
  useEffect(() => {
    const restore = () => {
      setVisible(!document.hidden);
      setNow(Date.now());
    };
    document.addEventListener("visibilitychange", restore);
    return () => document.removeEventListener("visibilitychange", restore);
  }, []);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [visible]);
  useEffect(() => {
    if (!visible) {
      setConnection("sleeping");
      return;
    }
    if (!autoRefresh) {
      setConnection("paused");
      void refresh();
      return;
    }
    if (native) {
      setConnection("native");
      return nativeMonitor.current.subscribe(accept);
    }
    let stream, fallback;
    const startFallback = () => {
      setConnection("polling");
      if (!fallback) {
        void refresh();
        fallback = setInterval(refresh, REFRESH_MS);
      }
    };
    if (
      import.meta.env.VITE_STATUS_TRANSPORT !== "poll" &&
      typeof EventSource !== "undefined"
    ) {
      stream = new EventSource(`${base}/api/status/stream`);
      stream.onmessage = (event) => {
        try {
          accept(JSON.parse(event.data));
          setConnection("streaming");
          clearInterval(fallback);
          fallback = null;
        } catch {
          startFallback();
        }
      };
      stream.onerror = startFallback;
    } else startFallback();
    const restore = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("online", restore);
    return () => {
      stream?.close();
      clearInterval(fallback);
      window.removeEventListener("online", restore);
    };
  }, [autoRefresh, visible, accept, refresh]);
  const items = data.providers.map((p) =>
    isFresh(p, now)
      ? p
      : {
          ...p,
          stale: !!p.checkedAt,
          lastKnownStatus:
            p.lastKnownStatus || (p.status !== "unknown" ? p.status : null),
          status: "unknown",
        },
  );
  return {
    items,
    loading: data.refreshing,
    fetchedAt: data.fetchedAt,
    error,
    refresh,
    now,
    connection,
    monitorData: data,
  };
}
