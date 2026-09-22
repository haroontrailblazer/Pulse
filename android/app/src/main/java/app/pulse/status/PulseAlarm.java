package app.pulse.status;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.*;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * Keeps checks running while the screen is off.
 *
 * The foreground monitor drives itself with a Handler, whose delays are measured
 * on SystemClock.uptimeMillis() and waited on with an epoll timeout. Neither
 * counts nor wakes while the processor is suspended, and a foreground service
 * raises process importance without holding a wake lock - so that loop stalls
 * seconds after the screen goes off. An allow-while-idle alarm is the one
 * mechanism that wakes a suspended CPU without a restricted permission, so it
 * carries the watchlist overnight and repaints the widgets with it.
 */
public final class PulseAlarm extends BroadcastReceiver {
    static final String TICK = "app.pulse.status.SWEEP_TICK";
    /** 100 is PulseStore.open, 101 the stack refresh, 104 the collection template. */
    private static final int CODE = 103;
    /** The system throttles an idle device to roughly one of these every 9 minutes anyway. */
    static final long MIN_INTERVAL_MS = 5 * 60_000;
    // goAsync() holds a background broadcast open for roughly 60s before the
    // system files an ANR against the receiver, and Doze's temporary allowlist
    // for an alarm is shorter still. Finish well inside both; sweep() records
    // each reading as it lands, so a truncated pass still makes progress.
    private static final long WAKE_LOCK_MS = 45_000, SWEEP_BUDGET_MS = 30_000;

    static PendingIntent pending(Context c) {
        return PendingIntent.getBroadcast(c, CODE, new Intent(c, PulseAlarm.class).setAction(TICK),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static long interval(Context c) { return Math.max(PulseStore.FULL_SWEEP_MS, MIN_INTERVAL_MS); }

    static synchronized void schedule(Context c) {
        AlarmManager alarms = c.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        if (!PulseStore.needed(c) || PulseStore.watchlist(c).isEmpty()) { alarms.cancel(pending(c)); return; }
        // Inexact and allow-while-idle: fires in Doze, needs no permission.
        // Exact alarms would be throttled identically here and are Play-restricted.
        // ELAPSED_REALTIME_WAKEUP so a clock or timezone change cannot skew it.
        alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + interval(c), pending(c));
    }

    static void cancel(Context c) {
        AlarmManager alarms = c.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.cancel(pending(c));
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !TICK.equals(intent.getAction())) return;
        final Context c = context.getApplicationContext();
        final PendingResult pending = goAsync();
        PowerManager power = c.getSystemService(PowerManager.class);
        final PowerManager.WakeLock lock = power == null ? null
            : power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pulse:sweep");
        // The alarm only wakes the CPU long enough to deliver the broadcast; the
        // feeds outlive that, so the lock has to span the sweep. It carries a
        // timeout so a stuck read can never hold the device awake.
        if (lock != null) lock.acquire(WAKE_LOCK_MS);
        new Thread(() -> {
            long deadline = SystemClock.elapsedRealtime() + SWEEP_BUDGET_MS;
            PulseStore.Cancellation spent = () -> SystemClock.elapsedRealtime() > deadline;
            // The cheap pass first, and that ordering is the point. It finishes in
            // a few seconds, so every watched feed gets looked at on every tick.
            // A full pass alone used to run out of budget partway through and was
            // truncated in completion order, which quietly starved whichever
            // providers answer slowest -- overnight, the same ones every time.
            try { PulseProbe.tick(c, spent); } catch (Throwable ignored) {}
            try { PulseStore.sweep(c, spent); }
            catch (Throwable ignored) {}
            finally {
                // Re-armed in a finally: a chained alarm that throws once would
                // otherwise stop monitoring until the next reboot.
                try { schedule(c); } catch (Throwable ignored) {}
                try { if (lock != null && lock.isHeld()) lock.release(); } catch (Throwable ignored) {}
                pending.finish();
            }
        }, "pulse-alarm-sweep").start();
    }
}
