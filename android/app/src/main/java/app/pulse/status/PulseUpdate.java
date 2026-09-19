package app.pulse.status;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Calendar;
import org.json.JSONObject;

/**
 * Whether a newer Pulse has been published, asked once each morning.
 *
 * The decisions here are the same decisions shared/updates.js makes, and they are
 * written twice because they have to be: the 08:00 run happens with no WebView
 * alive, so nothing JavaScript can reach is available to make them. What keeps
 * the two honest is shared/update-cases.json, one truth table that both
 * tests/updates.test.js and PulseUpdateTest read -- and `npm run build:android`
 * runs the JVM tests, so a disagreement is a failed build rather than something a
 * reader discovers.
 *
 * The calendar arithmetic is deliberately NOT in that table. "The next 08:00" is
 * a wall-clock question and each side should ask its own calendar rather than
 * reimplement one; Calendar here, Date there. What is shared is the decision the
 * calendar feeds: given the day a check last ran and the clock now, is one due.
 */
final class PulseUpdate {
    /** The hour, in the reader's own timezone, that the daily check runs at. */
    static final int CHECK_HOUR = 8;
    /**
     * Absolute, and that is load-bearing. The WebView serves the app from
     * https://localhost, and the packaged assets include the site's own build
     * metadata, so a relative URL would compare this build against itself and
     * report "up to date" forever.
     */
    static final String MANIFEST = "https://www.pulses4u.in/latest.json";

    private PulseUpdate() {}

    /** "1.0.20" -> {1, 0, 20}; null for anything this side cannot order. */
    static int[] parseVersion(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return null;
        String[] parts = trimmed.split("\\.", -1);
        if (parts.length > 4) return null;
        int[] out = new int[parts.length];
        for (int n = 0; n < parts.length; n++) {
            if (parts[n].isEmpty()) return null;
            for (int c = 0; c < parts[n].length(); c++)
                if (parts[n].charAt(c) < '0' || parts[n].charAt(c) > '9') return null;
            try { out[n] = Integer.parseInt(parts[n]); }
            catch (NumberFormatException error) { return null; }
            if (out[n] < 0) return null;
        }
        return out;
    }

    /**
     * Strictly newer, never merely different. A reader on a build newer than the
     * published one must never be told to install an older Pulse.
     */
    static boolean newerVersion(String candidate, String running) {
        int[] a = parseVersion(candidate), b = parseVersion(running);
        if (a == null || b == null) return false;
        for (int n = 0; n < Math.max(a.length, b.length); n++) {
            int left = n < a.length ? a[n] : 0, right = n < b.length ? b[n] : 0;
            if (left != right) return left > right;
        }
        return false;
    }

    /** The reader's local date as YYYY-MM-DD, which is the unit "once a day" means. */
    static String localDay(Calendar now) {
        return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d",
            now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
    }

    /**
     * Due once the local day has changed AND the clock has reached the hour, which
     * is what makes this both "every morning at 08:00" and "or the first moment
     * after, if the device was asleep or switched off then".
     */
    static boolean dueFrom(String lastCheckedDay, String today, int hourNow) {
        if (today == null || today.isEmpty()) return false;
        if (hourNow < 0 || hourNow > 23) return false;
        if (hourNow < CHECK_HOUR) return false;
        // No record is a fresh install: it waits for its first 08:00 rather than
        // telling the reader to install the app they have just installed.
        if (lastCheckedDay == null || lastCheckedDay.isEmpty()) return true;
        return lastCheckedDay.compareTo(today) < 0;
    }

    /**
     * What to show, read out of a fetched manifest, or null for anything that
     * cannot be fully trusted -- the failure a reader must never see is a download
     * that leads nowhere.
     */
    static JSONObject readUpdate(JSONObject manifest, String platform, String running) {
        if (manifest == null) return null;
        String version = manifest.optString("version", "");
        if (!newerVersion(version, running)) return null;
        JSONObject assets = manifest.optJSONObject("assets");
        JSONObject asset = assets == null ? null : assets.optJSONObject(platform);
        if (asset == null) return null;
        String url = asset.optString("url", ""), name = asset.optString("name", "");
        if (!url.startsWith("https://")) return null;
        if (!name.contains(version)) return null;
        // opt() and an integer check rather than optLong, which would quietly
        // coerce a JSON 1.5 to 1 where the JavaScript side rejects it. Agreeing on
        // good manifests and disagreeing on malformed ones is exactly the drift a
        // shared case table exists to catch.
        Object bytes = asset.opt("bytes");
        if (!(bytes instanceof Integer) && !(bytes instanceof Long)) return null;
        long size = ((Number) bytes).longValue();
        if (size <= 0) return null;
        String sha = asset.optString("sha256", "");
        if (sha.length() != 64) return null;
        for (int n = 0; n < 64; n++) {
            char c = sha.charAt(n);
            if ((c < '0' || c > '9') && (c < 'a' || c > 'f')) return null;
        }
        try {
            return new JSONObject().put("version", version).put("name", name)
                .put("bytes", size).put("sha256", sha).put("url", url)
                .put("checksums", manifest.optString("checksums", ""));
        } catch (org.json.JSONException error) { return null; }
    }

    /** The next local 08:00 as a wall-clock instant, today's if it is still ahead. */
    static long nextRunAt(Calendar now) {
        Calendar at = (Calendar) now.clone();
        at.set(Calendar.HOUR_OF_DAY, CHECK_HOUR);
        at.set(Calendar.MINUTE, 0);
        at.set(Calendar.SECOND, 0);
        at.set(Calendar.MILLISECOND, 0);
        // A day, not 24 hours: where a timezone gains or loses an hour those are
        // different instants, and the reader means the clock.
        if (at.getTimeInMillis() <= now.getTimeInMillis()) at.add(Calendar.DAY_OF_MONTH, 1);
        return at.getTimeInMillis();
    }

    /** The version of the build actually installed, asked of the platform. */
    static String running(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception error) { return ""; }
    }

    static SharedPreferences prefs(Context c) { return PulseStore.prefs(c); }

    /** What the web layer is told, so the sidebar row and the notification agree. */
    static JSONObject offered(Context c) {
        String stored = prefs(c).getString("update", "");
        if (stored.isEmpty()) return null;
        try {
            JSONObject update = new JSONObject(stored);
            // Re-checked on every read rather than trusted from storage, so the row
            // disappears by itself once the reader has installed the build it names.
            return newerVersion(update.optString("version", ""), running(c)) ? update : null;
        } catch (org.json.JSONException error) { return null; }
    }
}
