package app.pulse.status;

import android.content.Context;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The fast tier: how Pulse notices an outage in seconds instead of minutes.
 *
 * Reading all 77 watched feeds in full costs 3.4 MB and, four connections wide,
 * 30 seconds of wall clock on a desktop line. That is why the full sweep runs on
 * a five-minute cadence, and it is why a new outage used to wait up to five and a
 * half minutes for its notification.
 *
 * Statuspage publishes a second document beside the summary: /api/v2/status.json,
 * 262 bytes, carrying the same page indicator the summary carries. Measured
 * across the shipped catalog, all 70 statuspage feeds serve it, every one agreed
 * with its own summary, and the whole set costs 15.5 KB -- 180 times less than
 * the 2.8 MB those same feeds cost in full. So this tier asks only "did the
 * indicator move", every {@link PulseStore#PROBE_MS}, and pays for a full read
 * only for the one provider that moved. The full sweep still runs underneath it
 * and remains the authority: a new incident that never moves the page indicator,
 * and the five feeds below that publish no small document, are its to find.
 */
final class PulseProbe {
    /** A small sibling document stands in for the whole feed. */
    static final int INDICATOR = 1;
    /** No small document exists, but the feed is small enough to read every tick. */
    static final int DIRECT = 2;
    /** Too large for this cadence. The five-minute sweep owns it. */
    static final int SLOW = 3;

    private static final String SUMMARY = "/api/v2/summary.json";
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);
    /** A 262-byte document on a 20-second cadence has no business taking longer. */
    private static final long PROBE_BUDGET_MS = 6_000, PROBE_ATTEMPT_MS = 3_000;

    private PulseProbe() {}

    /**
     * Which cheap signal a format supports, decided from catalog data alone so
     * there is no runtime guessing about what an endpoint might return.
     *
     * The component format is deliberately slow: Replicate is read out of
     * Cloudflare's summary for one component id, and Cloudflare's page indicator
     * says nothing about that component. Probing it would be a confident wrong
     * answer, which is worse than a slower right one.
     */
    static int tier(String format, String url) {
        if ("statuspage".equals(format) && indicatorUrl(url) != null) return INDICATOR;
        if ("azure-rss".equals(format) || "instatus".equals(format)) return DIRECT;
        return SLOW;
    }

    /**
     * The documented sibling of a Statuspage v2 summary, or null. Same origin,
     * same directory, exact suffix: OfficialFeed accepts catalog URLs only, and
     * this is the one address derivable from one without inventing anything.
     */
    static String indicatorUrl(String url) {
        if (url == null || !url.startsWith("https://") || !url.endsWith(SUMMARY)) return null;
        return url.substring(0, url.length() - "summary.json".length()) + "status.json";
    }

    /** The page indicator, refusing any value this product cannot interpret. */
    static String indicator(String body) throws JSONException {
        String indicator = new JSONObject(body).getJSONObject("status").getString("indicator");
        FeedReading.state(indicator);
        return indicator;
    }

    /**
     * Whether a probe earns a full read. An empty stored value is a first
     * sighting, which seeds and stays quiet: the reading it would notify about
     * belongs to the full sweep, which runs when monitoring starts.
     */
    static boolean changed(String stored, String seen) {
        return stored != null && !stored.isEmpty()
            && seen != null && !seen.isEmpty()
            && !stored.equals(seen);
    }

    /**
     * One fast pass. Probes every watched feed that has a cheap signal, reads the
     * few small ones outright, and fully re-reads only what moved.
     */
    static void tick(Context c, PulseStore.Cancellation cancellation) throws Exception {
        if (!PulseStore.needed(c) || !RUNNING.compareAndSet(false, true)) return;
        ExecutorService workers = null;
        try {
            List<JSONObject> probes = new ArrayList<>(), direct = new ArrayList<>();
            JSONArray all = PulseStore.catalog(c);
            Set<String> watched = PulseStore.watchlist(c);
            for (int n = 0; n < all.length(); n++) {
                JSONObject provider = all.getJSONObject(n);
                if (!watched.contains(provider.getString("id"))) continue;
                int tier = tier(provider.optString("format"), provider.optString("url"));
                if (tier == INDICATOR) probes.add(provider);
                else if (tier == DIRECT) direct.add(provider);
            }
            int count = probes.size() + direct.size();
            if (count == 0) return;
            workers = Executors.newFixedThreadPool(Math.max(1, Math.min(PulseStore.PARALLEL_FEEDS, count)));
            List<Future<Boolean>> pending = new ArrayList<>();
            for (JSONObject provider : probes) pending.add(workers.submit(() -> probe(c, provider, cancellation)));
            for (JSONObject provider : direct) pending.add(workers.submit(() -> reread(c, provider)));
            boolean recorded = false;
            for (Future<Boolean> task : pending) {
                if (cancellation.cancelled()) break;
                // One unreachable feed cannot stop the other watched checks.
                try { recorded |= Boolean.TRUE.equals(task.get()); }
                catch (InterruptedException stop) { Thread.currentThread().interrupt(); break; }
                catch (ExecutionException ignored) {}
            }
            if (recorded) PulseWidgets.updateAll(c);
        } finally {
            if (workers != null) workers.shutdownNow();
            RUNNING.set(false);
        }
    }

    /** True when this provider's stored reading moved, so the widgets need repainting. */
    private static boolean probe(Context c, JSONObject provider, PulseStore.Cancellation cancellation) throws Exception {
        if (cancellation.cancelled()) return false;
        String id = provider.getString("id");
        String seen = indicator(OfficialFeed.read(indicatorUrl(provider.getString("url")),
            "application/json", PROBE_BUDGET_MS, PROBE_ATTEMPT_MS));
        String stored = PulseStore.prefs(c).getString("probe." + id, "");
        if (seen.equals(stored)) return false;
        // Read before storing. A re-read that fails throws from here, leaving the
        // old indicator in place so the next tick tries again rather than
        // treating the move as already handled.
        boolean moved = changed(stored, seen) && reread(c, provider);
        PulseStore.prefs(c).edit().putString("probe." + id, seen).apply();
        return moved;
    }

    /** Records a full read, or throws so the caller leaves its stored indicator alone. */
    private static boolean reread(Context c, JSONObject provider) throws Exception {
        JSONObject reading = PulseStore.read(c, provider);
        // A read that could not reach the feed comes back marked stale rather than
        // throwing. On this cadence that is a retry in twenty seconds, not a reason
        // to overwrite a good reading with "unknown" -- and not a reason to store
        // the indicator that led here, which would file the move as handled.
        if (reading.optBoolean("stale")) throw new java.io.IOException("Feed unreachable");
        return PulseStore.record(c, reading);
    }
}
