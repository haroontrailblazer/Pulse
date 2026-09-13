import {
  providers,
  normalizeFeed,
  feedUrl,
  unknownProvider,
} from "../shared/providers.js";
import { createMonitor } from "../shared/monitor.js";
export async function fetchProvider(provider) {
  if (provider.format === "source-only") return unknownProvider(provider);
  const started = Date.now();
  try {
    const response = await fetch(feedUrl(provider), {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "PulseStatus/1.0",
      },
    });
    if (!response.ok)
      throw new Error(`Official feed returned HTTP ${response.status}`);
    if (response.headers?.get("content-type")?.includes("text/html"))
      throw new Error(
        "Official URL returned a web page instead of a supported JSON feed",
      );
    const result = normalizeFeed(provider, await response.json());
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
