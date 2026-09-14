package app.pulse.status;

import org.json.*;
import java.util.*;

/**
 * Turns the stored watchlist readings into the rows and the insight line both
 * home-screen widgets draw. Kept free of android.* types so the selection,
 * ordering and copy stay covered by plain JVM unit tests.
 */
final class PulseReadings {
    /** A reading older than this is reported as unavailable rather than current. */
    static final long STALE_MS = 30 * 60 * 1000;
    interface Stored { String reading(String id); }

    private PulseReadings() {}

    /**
     * Watched services only, worst first, with the catalog order breaking ties.
     * Every watched provider is returned: the widgets scroll rather than crop.
     */
    static List<JSONObject> list(JSONArray catalog, Set<String> watchlist, Stored stored, long now) {
        List<JSONObject> readings = new ArrayList<>();
        if (catalog == null || watchlist == null) return readings;
        for (int n = 0; n < catalog.length(); n++) {
            JSONObject provider = catalog.optJSONObject(n);
            if (provider == null) continue;
            String id = provider.optString("id");
            if (id.isEmpty() || !watchlist.contains(id)) continue;
            JSONObject reading;
            try { reading = new JSONObject(stored.reading(id)); }
            catch (Exception error) { reading = new JSONObject(); }
            try {
                reading.put("id", id);
                reading.put("name", provider.optString("name", id));
                reading.put("color", provider.optString("color"));
                if (stale(reading, now)) reading.put("status", "unknown").put("stale", true);
            } catch (JSONException ignored) {}
            readings.add(reading);
        }
        readings.sort((a, b) -> Integer.compare(FeedReading.severity(b), FeedReading.severity(a)));
        return readings;
    }

    static boolean stale(JSONObject reading, long now) {
        try { return now - java.time.Instant.parse(reading.getString("checkedAt")).toEpochMilli() > STALE_MS; }
        catch (Exception error) { return false; }
    }

    static boolean issue(JSONObject reading) {
        String signature = FeedReading.signature(reading);
        return signature != null && !signature.isEmpty();
    }
    static boolean unavailable(JSONObject reading) { return FeedReading.signature(reading) == null; }

    static int issues(List<JSONObject> readings) {
        int total = 0;
        for (JSONObject reading : readings) if (issue(reading)) total++;
        return total;
    }
    static int unavailable(List<JSONObject> readings) {
        int total = 0;
        for (JSONObject reading : readings) if (unavailable(reading)) total++;
        return total;
    }

    /** The insight headline. Unchanged wording, so an existing widget reads the same. */
    static String summary(List<JSONObject> readings) {
        if (readings.isEmpty()) return "Your stack starts here";
        int issues = issues(readings);
        return issues > 0 ? issues + " watched services reported issues" : "Your latest watchlist readings";
    }

    static String subtitle(List<JSONObject> readings) {
        if (readings.isEmpty()) return "Add services in Pulse to start monitoring";
        return readings.size() + " watched · " + unavailable(readings) + " unavailable · tap to explore";
    }

    static String label(JSONObject reading) {
        int rank = FeedReading.severity(reading);
        String status = reading.optString("status", "unknown");
        if (rank == 4) return "Major issue";
        if (rank == 3) return "Degraded";
        if (status.equals("maintenance")) return "Maintenance";
        if (status.equals("operational")) return issue(reading) ? "Active issue" : "Operational";
        return "Unavailable";
    }

    /** Newest reading time across the watchlist, or 0 when nothing has been read. */
    static long checkedAt(List<JSONObject> readings) {
        long checked = 0;
        for (JSONObject reading : readings)
            try { checked = Math.max(checked, java.time.Instant.parse(reading.getString("checkedAt")).toEpochMilli()); }
            catch (Exception ignored) {}
        return checked;
    }

    static int tint(JSONObject reading) {
        return PulseTint.icon(FeedReading.severity(reading), PulseTint.parse(reading.optString("color"), PulseTint.FOREGROUND));
    }
    static int stateColor(JSONObject reading) { return PulseTint.status(FeedReading.severity(reading)); }

    static String describe(JSONObject reading) { return reading.optString("name") + ", " + label(reading); }
}
