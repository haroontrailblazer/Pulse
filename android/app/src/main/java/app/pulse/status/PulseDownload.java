package app.pulse.status;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/**
 * Fetches the new APK inside Pulse, instead of handing the reader to a browser.
 *
 * No foreground service, and that is a decision rather than an omission. The
 * release is about six megabytes -- 6,099,879 for 1.0.20 -- which is a couple of
 * seconds on anything but a stalled connection, and the reader has just tapped a
 * button and is watching the row. A foreground service would buy the right to
 * keep downloading after they leave, and would cost a startForeground call that
 * can throw on API 34+, a service type to justify, and a second claim on the
 * same budget PulseMonitorService already spends. If Pulse is killed mid-fetch
 * the partial file is swept on the next read and the reader taps again.
 *
 * The digest is computed while the bytes are written, not afterwards, so the
 * file is never read twice and a stream that lies about its length cannot slip
 * past by being re-read from disk. Nothing is renamed to its final name until
 * the size and the digest both match what the manifest promised; until then it
 * is a .part file that no other code path will look at.
 */
final class PulseDownload {
    /** One download at a time, and the flag is only trusted while this process lives. */
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);
    private static final int BUFFER = 64 * 1024;
    /** Generous: a slow connection is not a failure, a stalled one is. */
    private static final int TIMEOUT_MS = 30_000;

    private PulseDownload() {}

    interface Progress { void at(long received, long total); }

    static File folder(Context c) {
        File at = new File(c.getCacheDir(), "updates");
        at.mkdirs();
        return at;
    }

    static File file(Context c, String version) {
        return new File(folder(c), "pulse-" + version + ".apk");
    }

    static File partial(Context c, String version) {
        return new File(folder(c), "pulse-" + version + ".apk.part");
    }

    /**
     * The state the row should show. Sanitising rather than trusting: a stored
     * "downloading" with no download running means the process died mid-fetch, so
     * it is reported as idle and the partial file is swept. Without this the row
     * would sit at a frozen percentage until the reader cleared the app's data.
     */
    static synchronized JSONObject state(Context c) {
        SharedPreferences prefs = PulseUpdate.prefs(c);
        String stored = prefs.getString("download", "");
        JSONObject offered = PulseUpdate.offered(c);
        if (offered == null) {
            if (!stored.isEmpty()) prefs.edit().remove("download").apply();
            sweep(c, null);
            return null;
        }
        String version = offered.optString("version", "");
        JSONObject download;
        try { download = stored.isEmpty() ? new JSONObject() : new JSONObject(stored); }
        catch (org.json.JSONException error) { download = new JSONObject(); }
        // A record about a different version is about a release the reader is no
        // longer being offered.
        if (!version.equals(download.optString("version", version))) download = new JSONObject();
        String name = download.optString("state", "idle");
        if (("downloading".equals(name) || "verifying".equals(name)) && !RUNNING.get()) {
            sweep(c, version);
            download = new JSONObject();
            name = "idle";
        }
        if ("ready".equals(name) && !file(c, version).isFile()) {
            download = new JSONObject();
            name = "idle";
        }
        try { return download.put("state", name).put("version", version); }
        catch (org.json.JSONException error) { return null; }
    }

    /** Remove every partial file, and every finished file that is not this version. */
    static void sweep(Context c, String keep) {
        File[] all = folder(c).listFiles();
        if (all == null) return;
        String wanted = keep == null ? null : file(c, keep).getName();
        for (File at : all)
            if (at.getName().endsWith(".part") || wanted == null || !at.getName().equals(wanted))
                at.delete();
    }

    static synchronized void record(Context c, String version, String state, String error) {
        try {
            JSONObject at = new JSONObject().put("version", version).put("state", state);
            if (error != null) at.put("error", error);
            PulseUpdate.prefs(c).edit().putString("download", at.toString()).apply();
        } catch (org.json.JSONException ignored) {}
    }

    static boolean running() { return RUNNING.get(); }

    /**
     * Fetch, hashing as we write. Returns the verified file, or null -- and on null
     * nothing usable is left behind.
     */
    static File fetch(Context c, JSONObject update, Progress progress) {
        if (!RUNNING.compareAndSet(false, true)) return null;
        String version = update.optString("version", "");
        File part = partial(c, version), done = file(c, version);
        HttpURLConnection connection = null;
        try {
            record(c, version, "downloading", null);
            sweep(c, null);
            connection = (HttpURLConnection) new URL(update.getString("url")).openConnection();
            // A binary that can be redirected is a binary that can be substituted.
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("User-Agent", "PulseStatus/1.0");
            if (connection.getResponseCode() != 200) {
                record(c, version, "failed", "Download failed");
                return null;
            }
            long expected = update.optLong("bytes", -1);
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            long received = 0;
            try (InputStream in = connection.getInputStream();
                 FileOutputStream out = new FileOutputStream(part)) {
                byte[] chunk = new byte[BUFFER];
                int length;
                while ((length = in.read(chunk)) != -1) {
                    // Refuse to keep writing past what was promised rather than
                    // filling the device and finding out at the end.
                    if (received + length > expected) {
                        record(c, version, "failed", "Download failed");
                        return null;
                    }
                    out.write(chunk, 0, length);
                    sha.update(chunk, 0, length);
                    received += length;
                    if (progress != null) progress.at(received, expected);
                }
                out.getFD().sync();
            }
            record(c, version, "verifying", null);
            StringBuilder hex = new StringBuilder(64);
            for (byte b : sha.digest()) hex.append(Character.forDigit((b >> 4) & 0xf, 16)).append(Character.forDigit(b & 0xf, 16));
            if (received != expected || !hex.toString().equals(update.optString("sha256", ""))) {
                record(c, version, "failed", "The download did not match its checksum");
                return null;
            }
            // Only now does the file get the name anything else will look for.
            if (!part.renameTo(done)) {
                record(c, version, "failed", "Could not save the download");
                return null;
            }
            record(c, version, "ready", null);
            return done;
        } catch (Throwable error) {
            record(c, version, "failed", "Download failed");
            return null;
        } finally {
            if (connection != null) connection.disconnect();
            // Whatever happened, a .part file never survives this method.
            part.delete();
            RUNNING.set(false);
        }
    }
}
