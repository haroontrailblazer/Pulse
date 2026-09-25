package app.pulse.status;

import android.app.*;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.TimeUnit;

final class PulseStore {
    static final String CHANNEL="pulse-watchlist", ALERT_CHANNEL="pulse-watchlist-alerts", MONITOR_CHANNEL="pulse-background-monitor", UPDATE_CHANNEL="pulse-updates", PERIODIC="pulse-periodic", ONCE="pulse-once";
    static final long FRESH_REUSE_MS=30_000;
    /**
     * How often the fast tier asks every watched feed whether anything moved. This
     * is the number that decides how quickly an outage becomes a notification, and
     * PulseProbe is what makes it affordable: a pass costs about 26 KB, where a
     * full pass over the same 77 feeds costs 3.4 MB. Raise it to spend less radio.
     */
    static final long PROBE_MS=20_000;
    /**
     * How often every watched feed is read in full. The fast tier cannot see a new
     * incident that leaves the page indicator alone, and five providers publish no
     * small document at all, so this pass stays the authority. Unchanged: it is
     * what the ceiling of the old per-feed interval arithmetic already worked out to.
     */
    static final long FULL_SWEEP_MS=300_000;
    /**
     * Measured against the shipped 77-provider catalog: four connections wide a
     * full pass took 29.9s, twelve took 9.3s and twenty-four took 5.5s, with
     * per-feed latency flat throughout -- the pool was the whole bottleneck. Four
     * could not finish inside the 30s the screen-off alarm has to spend, so the
     * tail of the watchlist was being dropped every night.
     */
    static final int PARALLEL_FEEDS=16;
    private static final AtomicBoolean SWEEP_RUNNING=new AtomicBoolean(false);
    interface Cancellation { boolean cancelled(); }

    /**
     * The reader's quiet window, read against this device's own clock.
     *
     * Absent settings mean off: quietFrom and quietTo default to the same value
     * and FeedReading.quietNow treats equal bounds as disabled, so an install
     * that has never opened the setting behaves exactly as it did before.
     */
    static boolean quietHoursNow(SharedPreferences p) {
        int from=p.getInt("quietFrom",0), to=p.getInt("quietTo",0);
        return FeedReading.quietNow(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY),from,to);
    }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pulse-background",Context.MODE_PRIVATE); }
    static JSONArray catalog(Context c) throws Exception {
        try(java.io.InputStream in=c.getAssets().open("pulse-catalog.json"); java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()) {
            byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1)out.write(chunk,0,n);
            return new JSONArray(out.toString("UTF-8"));
        }
    }
    static Set<String> watchlist(Context c) { return new HashSet<>(prefs(c).getStringSet("watchlist",Collections.emptySet())); }
    static boolean widgets(Context c) { return PulseWidgets.placed(c)>0; }
    static boolean needed(Context c) { return prefs(c).getBoolean("enabled",false)||widgets(c); }
    static boolean continuous(Context c) { return prefs(c).getBoolean("enabled",false)&&!watchlist(c).isEmpty(); }
    static void channel(Context c) {
        if(Build.VERSION.SDK_INT>=26) {
            NotificationManager manager=c.getSystemService(NotificationManager.class);
            // An outage is an interruption and belongs on a channel that can make
            // one. Importance belongs to the reader once a channel exists and
            // cannot be raised afterwards, so this is a new channel rather than a
            // louder setting on the one that has shipped since 1.0.0 -- every
            // existing install would have kept the quieter behaviour otherwise.
            NotificationChannel issues=new NotificationChannel(ALERT_CHANNEL,"Watched service issues",NotificationManager.IMPORTANCE_HIGH);
            issues.setDescription("A watched service has started reporting an outage or a degradation.");
            issues.enableVibration(true);
            manager.createNotificationChannel(issues);
            // The original channel keeps the all-clear, which is news rather than
            // an interruption, and keeps whatever the reader had already set on it.
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Watched service recoveries",NotificationManager.IMPORTANCE_DEFAULT));
            manager.createNotificationChannel(new NotificationChannel(MONITOR_CHANNEL,"Pulse background monitoring",NotificationManager.IMPORTANCE_MIN));
            // Its own channel, so a reader who wants to know about a new version but
            // not about every watched service -- or the reverse -- can have that
            // without losing the other. LOW because a release is news, not an alarm.
            manager.createNotificationChannel(new NotificationChannel(UPDATE_CHANNEL,"Pulse updates",NotificationManager.IMPORTANCE_LOW));
        }
    }
    static boolean permission(Context c) {
        if(!NotificationManagerCompat.from(c).areNotificationsEnabled()) return false;
        // Either channel open is enough to keep recording signatures. A reader who
        // has muted recoveries but not issues, or the reverse, still gets the half
        // they kept; silencing both is what counts as denied.
        if(Build.VERSION.SDK_INT>=26) return channelOpen(c,ALERT_CHANNEL)||channelOpen(c,CHANNEL);
        return true;
    }
    private static boolean channelOpen(Context c,String id) {
        NotificationChannel channel=c.getSystemService(NotificationManager.class).getNotificationChannel(id);
        return channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    static Constraints periodicConstraints() { return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build(); }
    static Constraints immediateConstraints() { return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(); }
    static synchronized void schedule(Context c) {
        WorkManager manager=WorkManager.getInstance(c);
        // The alarm is what survives the screen going off; WorkManager is the
        // floor that survives process death.
        PulseAlarm.schedule(c);
        // Above the gate below, deliberately: whether a reader wants watchlist
        // alerts has nothing to do with whether they want to know a newer Pulse
        // exists, so the daily update look is armed for everyone and on its own
        // unique name.
        try { PulseUpdateWorker.arm(c); } catch(Throwable ignored) {}
        if(!needed(c)||watchlist(c).isEmpty()) { manager.cancelUniqueWork(PERIODIC); manager.cancelUniqueWork(ONCE); return; }
        manager.enqueueUniquePeriodicWork(PERIODIC,ExistingPeriodicWorkPolicy.UPDATE,new PeriodicWorkRequest.Builder(PulseWorker.class,15,TimeUnit.MINUTES).setConstraints(periodicConstraints()).build());
    }
    static void refresh(Context c) { refresh(c,false); }
    static synchronized void refresh(Context c,boolean userRequested) {
        if(!needed(c)||watchlist(c).isEmpty()) return;
        long now=System.currentTimeMillis();
        if(now-prefs(c).getLong("lastRequested",0)<(userRequested?5_000:FRESH_REUSE_MS)) return;
        prefs(c).edit().putLong("lastRequested",now).apply();
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(PulseWorker.class)
            .setConstraints(immediateConstraints())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build();
        WorkManager.getInstance(c).enqueueUniqueWork(ONCE,ExistingWorkPolicy.KEEP,request);
    }
    static void startContinuousMonitor(Context c) {
        if(!continuous(c)) return;
        // A foreground service cannot be started from the background on API 31+,
        // and PulseBoot runs in exactly that position. BOOT_COMPLETED does carry an
        // exemption, but Android 14 defers that broadcast for an app that is not
        // running and delivers it once something else wakes the process -- by which
        // time the exemption has expired. Measured on API 36: the start threw
        // ForegroundServiceStartNotAllowedException, the receiver died at that line,
        // and PulseStore.refresh below it never ran, so a rebooted phone monitored
        // nothing until someone opened Pulse. The alarm is the designed fallback for
        // a monitor that cannot run; PulseMonitorService.onTimeout falls back the
        // same way when the platform takes the service away.
        try { ContextCompat.startForegroundService(c,new Intent(c,PulseMonitorService.class)); }
        catch(Throwable refused) { PulseAlarm.schedule(c); }
    }
    static void stopContinuousMonitor(Context c) { c.stopService(new Intent(c,PulseMonitorService.class)); }
    /** Whether a full pass is owed. Zero on a fresh install, so the first tick reads everything. */
    static boolean sweepDue(Context c) { return System.currentTimeMillis()-prefs(c).getLong("lastSweep",0)>=FULL_SWEEP_MS; }
    static PendingIntent open(Context c) {
        Intent intent=new Intent(c,MainActivity.class).putExtra("pulseWatchlist",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c,100,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    // Notifications require a bitmap. Do not decode the adaptive launcher
    // resource here: some devices resolve it to a cached legacy app icon.
    static Bitmap notificationLogo(Context c) { return BitmapFactory.decodeResource(c.getResources(),R.drawable.ic_pulse_notification_large); }
    /**
     * A full read, ignoring the freshness window. PulseProbe calls this when an
     * indicator has just moved, and reusing a reading from thirty seconds ago is
     * precisely the answer it already knows is out of date.
     */
    static JSONObject read(Context c,JSONObject provider) throws Exception { return reading(c,provider,true); }
    private static JSONObject reading(Context c,JSONObject provider) throws Exception { return reading(c,provider,false); }
    private static JSONObject reading(Context c,JSONObject provider,boolean force) throws Exception {
        String id=provider.getString("id");
        if(!force) try { JSONObject saved=new JSONObject(prefs(c).getString("reading."+id,"{}"));
            if(!saved.optBoolean("stale") && System.currentTimeMillis()-java.time.Instant.parse(saved.getString("checkedAt")).toEpochMilli()<FRESH_REUSE_MS) return saved;
        } catch(Exception ignored) {}
        try { return FeedReading.parse(provider,OfficialFeed.read(provider)); }
        catch(Exception error) { return new JSONObject().put("id",id).put("name",provider.getString("name")).put("status","unknown").put("stale",true).put("attemptedAt",java.time.Instant.now().toString()); }
    }
    static void sweep(Context c,Cancellation cancellation) throws Exception {
        if(!needed(c)||!SWEEP_RUNNING.compareAndSet(false,true)) return;
        ExecutorService workers=null;
        try {
            JSONArray all=catalog(c);Set<String> watched=watchlist(c);List<JSONObject> selected=new ArrayList<>();
            for(int n=0;n<all.length();n++) { JSONObject provider=all.getJSONObject(n);if(watched.contains(provider.getString("id"))&&!provider.optString("format").equals("source-only")) selected.add(provider); }
            workers=Executors.newFixedThreadPool(Math.max(1,Math.min(PARALLEL_FEEDS,selected.size())));
            CompletionService<JSONObject> completed=new ExecutorCompletionService<>(workers);
            for(JSONObject provider:selected) completed.submit(()->reading(c,provider));
            for(int n=0;n<selected.size()&&!cancellation.cancelled();n++) {
                try { record(c,completed.take().get()); }
                catch(InterruptedException error) { Thread.currentThread().interrupt(); break; }
                catch(ExecutionException error) { /* One feed cannot stop the other watched checks. */ }
            }
            prefs(c).edit().putLong("lastSweep",System.currentTimeMillis()).apply();
            PulseWidgets.updateAll(c);
        } finally { if(workers!=null) workers.shutdownNow();SWEEP_RUNNING.set(false); }
    }
    /** A newer Pulse exists. Its own channel and its own request code, so it neither
     *  replaces a watchlist alert nor inherits one's content intent. The extra asks
     *  the app to open the navigation sheet, because that is where the row lives and
     *  landing on an unchanged screen would be a dead end. */
    static void announceUpdate(Context c,String version) {
        channel(c);
        Intent intent=new Intent(c,MainActivity.class).putExtra("pulseUpdate",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent open=PendingIntent.getActivity(c,102,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String body=c.getString(R.string.update_body);
        NotificationCompat.Builder alert=new NotificationCompat.Builder(c,UPDATE_CHANNEL).setSmallIcon(R.drawable.ic_pulse_notification_logo).setLargeIcon(notificationLogo(c)).setContentTitle(c.getString(R.string.update_title,version)).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(open).setAutoCancel(true);
        NotificationManagerCompat.from(c).notify(("pulse-update-"+version).hashCode(),alert.build());
    }
    /** Pulse has just replaced itself. One tap is the only way back; see PulseInstalled. */
    static void announceInstalled(Context c,String version) {
        channel(c);
        Intent intent=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent open=PendingIntent.getActivity(c,106,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String body=c.getString(R.string.installed_body);
        NotificationCompat.Builder alert=new NotificationCompat.Builder(c,UPDATE_CHANNEL).setSmallIcon(R.drawable.ic_pulse_notification_logo).setLargeIcon(notificationLogo(c)).setContentTitle(c.getString(R.string.installed_title,version)).setContentText(body).setContentIntent(open).setAutoCancel(true);
        NotificationManagerCompat.from(c).notify(("pulse-installed-"+version).hashCode(),alert.build());
    }
    private static void alert(Context c,String id,String title,String body,boolean urgent) {
        channel(c);
        NotificationCompat.Builder alert=new NotificationCompat.Builder(c,urgent?ALERT_CHANNEL:CHANNEL).setSmallIcon(R.drawable.ic_pulse_notification_logo).setLargeIcon(notificationLogo(c)).setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(open(c)).setAutoCancel(true)
            // Category and priority are what pre-26 devices read instead of the
            // channel, so an issue heads up on every release the APK supports.
            .setCategory(urgent?NotificationCompat.CATEGORY_ERROR:NotificationCompat.CATEGORY_STATUS)
            .setPriority(urgent?NotificationCompat.PRIORITY_HIGH:NotificationCompat.PRIORITY_DEFAULT);
        if(urgent) alert.setDefaults(NotificationCompat.DEFAULT_VIBRATE|NotificationCompat.DEFAULT_SOUND);
        NotificationManagerCompat.from(c).notify(id.hashCode(),alert.build());
    }
    /** True when the stored reading moved, so a caller knows whether to repaint the widgets. */
    static synchronized boolean record(Context c,JSONObject reading) throws JSONException {
        String id=reading.getString("id");
        if(!watchlist(c).contains(id)) return false;
        SharedPreferences p=prefs(c);
        JSONObject saved=new JSONObject(p.getString("reading."+id,"{}"));
        String signature=FeedReading.signature(reading);
        if(signature!=null) {
            if(reading.optString("checkedAt").compareTo(saved.optString("checkedAt"))<0) return false;
            p.edit().putString("lastCheckedAt",reading.optString("checkedAt")).apply();
        }
        String previous=p.getString("signature."+id,"");
        // Quiet hours suppress and HOLD: the signature is not advanced either,
        // so the first sweep after the window compares against what the reader
        // was last told and fires once if the issue is still there. Nothing is
        // queued, so nothing is lost to a quit, a crash or a truncated sweep.
        // An issue that both began and ended inside the window announces
        // nothing, because the held signature never gained an alert key and
        // FeedReading.resolved requires one. The reading itself is still
        // written below, so the widgets stay current while the phone is quiet.
        boolean quiet=quietHoursNow(p);
        if(signature!=null && !quiet && p.getBoolean("enabled",false) && permission(c)) {
            if(FeedReading.shouldNotify(previous,signature)) {
                JSONArray incidents=reading.optJSONArray("incidents");
                String body=incidents!=null&&incidents.length()>0?incidents.optJSONObject(0).optString("name","Service disruption"):"A watched service reports an issue. Open Pulse for current details.";
                alert(c,id,reading.optString("name",id)+" · service issue",body,true);
            }
            // The same notification id, so the all-clear replaces the issue it
            // resolves instead of stacking a second entry beside it.
            else if(FeedReading.resolved(previous,signature))
                alert(c,id,reading.optString("name",id)+" · back to normal","The reported issue is resolved. Its official feed is clear again.",false);
            p.edit().putString("signature."+id,signature).apply();
        }
        p.edit().putString("reading."+id,reading.toString()).apply();
        return !reading.optString("status").equals(saved.optString("status"))
            || FeedReading.severity(reading)!=FeedReading.severity(saved);
    }
}
