package app.pulse.status;

import android.app.*;
import android.content.Intent;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import java.util.concurrent.*;

public final class PulseMonitorService extends Service {
    private final android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile boolean stopped;
    /**
     * One cadence drives both tiers. Every tick asks the cheap question of every
     * watched feed; a tick that finds a full pass owed reads everything instead.
     *
     * The next tick is scheduled by subtracting the time this one spent, which is
     * the difference between a cadence and a delay between passes: at 77 watched
     * feeds a full pass takes long enough that the old post-sweep postDelayed was
     * adding it to every interval.
     */
    private final Runnable tick=new Runnable() { @Override public void run() {
        if(stopped||!PulseStore.continuous(getApplicationContext())) { stopSelf(); return; }
        worker.execute(()->{
            long started=android.os.SystemClock.elapsedRealtime();
            try {
                android.content.Context c=getApplicationContext();
                if(PulseStore.sweepDue(c)) PulseStore.sweep(c,()->stopped);
                else PulseProbe.tick(c,()->stopped);
            }
            catch(Exception ignored) {}
            if(!stopped) handler.postDelayed(this,Math.max(1_000,PulseStore.PROBE_MS-(android.os.SystemClock.elapsedRealtime()-started)));
        });
    }};
    @Override public void onCreate() {
        super.onCreate();PulseStore.channel(this);
        Notification notification=new NotificationCompat.Builder(this,PulseStore.MONITOR_CHANNEL)
            .setSmallIcon(R.drawable.ic_pulse_notification_logo).setLargeIcon(PulseStore.notificationLogo(this)).setContentTitle("Pulse is monitoring your watchlist")
            .setContentText("Background checks run while alerts are enabled.").setContentIntent(PulseStore.open(this)).setOngoing(true).setShowWhen(false).build();
        startForeground(4102,notification);
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId) { handler.removeCallbacks(tick);handler.post(tick);return START_STICKY; }
    // Android 15 caps a dataSync foreground service at roughly six hours a day.
    // Shutting down cleanly and leaning on the alarm beats being killed.
    @Override public void onTimeout(int startId,int fgsType) { PulseAlarm.schedule(getApplicationContext());stopped=true;stopSelf(); }
    @Override public void onDestroy() { stopped=true;handler.removeCallbacksAndMessages(null);worker.shutdownNow();super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
