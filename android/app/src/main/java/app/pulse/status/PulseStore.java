package app.pulse.status;

import android.app.*;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

final class PulseStore {
    static final String CHANNEL="pulse-watchlist", PERIODIC="pulse-periodic", ONCE="pulse-once";
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pulse-background",Context.MODE_PRIVATE); }
    static JSONArray catalog(Context c) throws Exception {
        try(java.io.InputStream in=c.getAssets().open("pulse-catalog.json"); java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()) {
            byte[] chunk=new byte[8192];int n;while((n=in.read(chunk))!=-1)out.write(chunk,0,n);
            return new JSONArray(out.toString("UTF-8"));
        }
    }
    static Set<String> watchlist(Context c) { return new HashSet<>(prefs(c).getStringSet("watchlist",Collections.emptySet())); }
    static boolean widgets(Context c) { return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,PulseWidget.class)).length>0; }
    static boolean needed(Context c) { return prefs(c).getBoolean("enabled",false)||widgets(c); }
    static void channel(Context c) {
        if(Build.VERSION.SDK_INT>=26) c.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Watched service issues",NotificationManager.IMPORTANCE_DEFAULT));
    }
    static boolean permission(Context c) {
        if(!NotificationManagerCompat.from(c).areNotificationsEnabled()) return false;
        if(Build.VERSION.SDK_INT>=26) { NotificationChannel channel=c.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL); return channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE; }
        return true;
    }
    static Constraints constraints() { return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build(); }
    static synchronized void schedule(Context c) {
        WorkManager manager=WorkManager.getInstance(c);
        if(!needed(c)||watchlist(c).isEmpty()) { manager.cancelUniqueWork(PERIODIC); manager.cancelUniqueWork(ONCE); return; }
        manager.enqueueUniquePeriodicWork(PERIODIC,ExistingPeriodicWorkPolicy.KEEP,new PeriodicWorkRequest.Builder(PulseWorker.class,15,TimeUnit.MINUTES).setConstraints(constraints()).build());
    }
    static synchronized void refresh(Context c) {
        if(!needed(c)||watchlist(c).isEmpty()) return;
        long now=System.currentTimeMillis();
        if(now-prefs(c).getLong("lastRequested",0)<60000) return;
        prefs(c).edit().putLong("lastRequested",now).apply();
        WorkManager.getInstance(c).enqueueUniqueWork(ONCE,ExistingWorkPolicy.KEEP,new OneTimeWorkRequest.Builder(PulseWorker.class).setConstraints(constraints()).build());
    }
    static PendingIntent open(Context c) {
        Intent intent=new Intent(c,MainActivity.class).putExtra("pulseWatchlist",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c,100,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
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
                channel(c);
                NotificationCompat.Builder alert=new NotificationCompat.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_pulse_notification).setContentTitle(reading.optString("name",id)+" · service issue").setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(open(c)).setAutoCancel(true);
                NotificationManagerCompat.from(c).notify(id.hashCode(),alert.build());
            }
            p.edit().putString("signature."+id,signature).apply();
        }
        p.edit().putString("reading."+id,reading.toString()).apply();
    }
}
