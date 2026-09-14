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
    static final String CHANNEL="pulse-watchlist", MONITOR_CHANNEL="pulse-background-monitor", PERIODIC="pulse-periodic", ONCE="pulse-once";
    static final long FRESH_REUSE_MS=30_000, MIN_CONTINUOUS_MS=30_000, MAX_CONTINUOUS_MS=300_000;
    private static final AtomicBoolean SWEEP_RUNNING=new AtomicBoolean(false);
    interface Cancellation { boolean cancelled(); }

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
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Watched service issues",NotificationManager.IMPORTANCE_DEFAULT));
            manager.createNotificationChannel(new NotificationChannel(MONITOR_CHANNEL,"Pulse background monitoring",NotificationManager.IMPORTANCE_MIN));
        }
    }
    static boolean permission(Context c) {
        if(!NotificationManagerCompat.from(c).areNotificationsEnabled()) return false;
        if(Build.VERSION.SDK_INT>=26) { NotificationChannel channel=c.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL); return channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE; }
        return true;
    }
    static Constraints periodicConstraints() { return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build(); }
    static Constraints immediateConstraints() { return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(); }
    static synchronized void schedule(Context c) {
        WorkManager manager=WorkManager.getInstance(c);
        // The alarm is what survives the screen going off; WorkManager is the
        // floor that survives process death.
        PulseAlarm.schedule(c);
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
        if(continuous(c)) ContextCompat.startForegroundService(c,new Intent(c,PulseMonitorService.class));
    }
    static void stopContinuousMonitor(Context c) { c.stopService(new Intent(c,PulseMonitorService.class)); }
    static long continuousInterval(Context c) {
        int automated=0;
        try { JSONArray all=catalog(c); Set<String> watched=watchlist(c); for(int n=0;n<all.length();n++) if(watched.contains(all.getJSONObject(n).getString("id"))&&!all.getJSONObject(n).optString("format").equals("source-only")) automated++; }
        catch(Exception ignored) {}
        return Math.min(MAX_CONTINUOUS_MS,Math.max(MIN_CONTINUOUS_MS,automated*MIN_CONTINUOUS_MS));
    }
    static PendingIntent open(Context c) {
        Intent intent=new Intent(c,MainActivity.class).putExtra("pulseWatchlist",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c,100,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    // Notifications require a bitmap. Do not decode the adaptive launcher
    // resource here: some devices resolve it to a cached legacy app icon.
    static Bitmap notificationLogo(Context c) { return BitmapFactory.decodeResource(c.getResources(),R.drawable.ic_pulse_notification_large); }
    private static JSONObject reading(Context c,JSONObject provider) throws Exception {
        String id=provider.getString("id");
        try { JSONObject saved=new JSONObject(prefs(c).getString("reading."+id,"{}"));
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
            workers=Executors.newFixedThreadPool(Math.max(1,Math.min(4,selected.size())));
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
    private static void alert(Context c,String id,String title,String body) {
        channel(c);
        NotificationCompat.Builder alert=new NotificationCompat.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_pulse_notification_logo).setLargeIcon(notificationLogo(c)).setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(open(c)).setAutoCancel(true);
        NotificationManagerCompat.from(c).notify(id.hashCode(),alert.build());
    }
    static synchronized void record(Context c,JSONObject reading) throws JSONException {
        String id=reading.getString("id");
        if(!watchlist(c).contains(id)) return;
        SharedPreferences p=prefs(c);
        String signature=FeedReading.signature(reading);
        if(signature!=null) {
            JSONObject saved=new JSONObject(p.getString("reading."+id,"{}"));
            if(reading.optString("checkedAt").compareTo(saved.optString("checkedAt"))<0) return;
            p.edit().putString("lastCheckedAt",reading.optString("checkedAt")).apply();
        }
        String previous=p.getString("signature."+id,"");
        if(signature!=null && p.getBoolean("enabled",false) && permission(c)) {
            if(FeedReading.shouldNotify(previous,signature)) {
                JSONArray incidents=reading.optJSONArray("incidents");
                String body=incidents!=null&&incidents.length()>0?incidents.optJSONObject(0).optString("name","Service disruption"):"A watched service reports an issue. Open Pulse for current details.";
                alert(c,id,reading.optString("name",id)+" · service issue",body);
            }
            // The same notification id, so the all-clear replaces the issue it
            // resolves instead of stacking a second entry beside it.
            else if(FeedReading.resolved(previous,signature))
                alert(c,id,reading.optString("name",id)+" · back to normal","The reported issue is resolved. Its official feed is clear again.");
            p.edit().putString("signature."+id,signature).apply();
        }
        p.edit().putString("reading."+id,reading.toString()).apply();
    }
}
