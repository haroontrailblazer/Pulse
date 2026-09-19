package app.pulse.status;

import android.content.Context;
import androidx.work.*;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Asks once each morning whether a newer Pulse has been published.
 *
 * Why a periodic request with a schedule override rather than a chain of one-time
 * requests: a one-time request that re-enqueues itself has no safe policy to do it
 * with. KEEP is declined while the existing row is enqueued or running, so an
 * on-open catch-up on the same name would silently do nothing; REPLACE cancels
 * uncompleted work of that name, and the worker asking for it is itself
 * uncompleted, so every run would cancel itself. A periodic request avoids both:
 * UPDATE from inside a running worker is legal, and the 24-hour period is only a
 * floor -- setNextScheduleTimeOverride is what actually places each run at the
 * next local 08:00, and a run the device slept through fires late rather than
 * being skipped.
 *
 * Always Result.success(), never retry. The override is honoured ahead of the
 * backoff, so a retry would be scheduled for tomorrow anyway; and a past override
 * makes the work eligible again at the 15-minute minimum, which against an
 * unreachable manifest is a quarter-hourly loop for as long as the network is
 * down. A check that could not happen is simply not recorded, so the next
 * morning -- or the next time the app is opened after 08:00 -- tries again.
 */
public final class PulseUpdateWorker extends Worker {
    /** Its own name, so arming it cannot disturb the watchlist monitor's work. */
    static final String WORK = "pulse-update-daily";
    /**
     * A second name for the catch-up, and that is not tidiness. Enqueuing a
     * catch-up under WORK with KEEP would be declined whenever the daily row is
     * already enqueued, which is always -- so the catch-up would never run.
     */
    static final String WORK_NOW = "pulse-update-now";
    private static final long BUDGET_MS = 15_000;

    public PulseUpdateWorker(Context context, WorkerParameters parameters) {
        super(context, parameters);
    }

    /**
     * Armed unconditionally, above the alerts-and-widgets gate the other work sits
     * behind: whether a reader wants watchlist notifications has nothing to do with
     * whether they want to know a new version exists.
     */
    static Operation arm(Context c) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                PulseUpdateWorker.class, 24, TimeUnit.HOURS)
            .setConstraints(new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build())
            .setNextScheduleTimeOverride(PulseUpdate.nextRunAt(Calendar.getInstance()))
            .build();
        return WorkManager.getInstance(c)
            .enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request);
    }

    /** The app was opened; if this morning's look has not happened yet, take it now. */
    static void catchUp(Context c) {
        WorkManager.getInstance(c).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.KEEP,
            new OneTimeWorkRequest.Builder(PulseUpdateWorker.class)
                .setConstraints(new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build());
    }

    @Override public Result doWork() {
        check(getApplicationContext());
        // Re-place the next run against the clock this run finished on, so a
        // timezone change or a daylight-saving shift moves 08:00 with the reader.
        // Blocked on rather than fired and forgotten: WorkManager reschedules the
        // periodic row as this worker returns, and it has to read the new override
        // rather than the spent one, or the next run lands 15 minutes away instead
        // of tomorrow morning. This is a worker thread, so waiting here is allowed.
        try {
            arm(getApplicationContext()).getResult().get();
        } catch (Throwable ignored) {
            // A failed re-arm is survivable: the 24-hour period is still in place, so
            // the run happens tomorrow either way, just not to the minute.
        }
        return Result.success();
    }

    /**
     * Synchronized because the daily run and the on-open catch-up can become
     * eligible in the same moment. Without the lock both would pass the due check
     * before either recorded the day, and the reader would get two notifications.
     */
    static synchronized void check(Context c) {
        Calendar now = Calendar.getInstance();
        String today = PulseUpdate.localDay(now);
        if (!PulseUpdate.dueFrom(PulseUpdate.prefs(c).getString("updateCheckedDay", ""),
                today, now.get(Calendar.HOUR_OF_DAY)))
            return;
        JSONObject manifest = fetch();
        // Nothing reachable, or nothing parseable. The day is left unrecorded so the
        // next morning tries again, and nothing is announced -- silence is the only
        // honest output of a look that did not happen.
        if (manifest == null) return;
        JSONObject update = PulseUpdate.readUpdate(manifest, "android", PulseUpdate.running(c));
        android.content.SharedPreferences.Editor edit = PulseUpdate.prefs(c).edit();
        edit.putString("updateCheckedDay", PulseUpdate.localDay(Calendar.getInstance()));
        edit.putString("update", update == null ? "" : update.toString());
        if (update != null) {
            String version = update.optString("version", "");
            // Once per release, not once per morning.
            if (!version.equals(PulseUpdate.prefs(c).getString("updateNotified", ""))) {
                edit.putString("updateNotified", version);
                edit.apply();
                PulseStore.announceUpdate(c, version);
                return;
            }
        }
        edit.apply();
    }

    private static JSONObject fetch() {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(PulseUpdate.MANIFEST).openConnection();
            // A manifest that can be redirected is a manifest that can be moved.
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout((int) BUDGET_MS);
            connection.setReadTimeout((int) BUDGET_MS);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "PulseStatus/1.0");
            if (connection.getResponseCode() != 200) return null;
            try (InputStream in = connection.getInputStream();
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[4096];
                int length;
                while ((length = in.read(chunk)) != -1) {
                    // A release manifest is under a kilobyte; anything large is not one.
                    if (out.size() + length > 64 * 1024) return null;
                    out.write(chunk, 0, length);
                }
                return new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            }
        } catch (Throwable error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
