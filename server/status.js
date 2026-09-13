import {
  providers,
  normalizeFeed,
  feedUrl,
  unknownProvider,
} from "../shared/providers.js";
import { createMonitor } from "../shared/monitor.js";
import { decodeFeedBytes } from "../shared/cloud-feeds.js";
export async function fetchProvider(provider) {
  if (provider.format === "source-only") return unknownProvider(provider);
  const started = Date.now();
  try {
    // One bounded retry for transient network / upstream failures; no extra polling.
    let response, body;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(feedUrl(provider), {
          signal: AbortSignal.timeout(
            Math.min(8000, Math.max(1, 15000 - (Date.now() - started))),
          ),
          cache: "no-store",
          headers: {
            Accept:
              provider.format === "azure-rss"
                ? "application/rss+xml, application/xml, text/xml"
                : "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "PulseStatus/1.0",
          },
        });
        if (response.ok) {
          body = await response.arrayBuffer();
          break;
        }
        if (response.status < 500 || attempt === 1) break;
        await response.body?.cancel();
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    if (!response.ok)
      throw new Error(`Official feed returned HTTP ${response.status}`);
    if (response.headers?.get("content-type")?.includes("text/html"))
      throw new Error(
        "Official URL returned a web page instead of a supported status feed",
      );
    const result = normalizeFeed(
      provider,
      decodeFeedBytes(
        new Uint8Array(body),
        response.headers?.get("content-type"),
      ),
    );
    return {
      ...result,
      attemptedAt: result.checkedAt,
      responseMs: Date.now() - started,
      error: null,
    };
  } catch (error) {
    return {
      ...unknownProvider(provider),
      attemptedAt: new Date().toISOString(),
      error:
        error.name === "TimeoutError"
          ? "Official feed timed out after 15 seconds"
          : error.cause?.code || error.message,
    };
  }
}
export const monitor = createMonitor({
  catalog: providers,
  fetcher: fetchProvider,
});
export const getStatuses = (options) => monitor.refresh(options);
