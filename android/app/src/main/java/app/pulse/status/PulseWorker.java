package app.pulse.status;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import org.json.*;
import java.net.*;
import java.io.*;

public class PulseWorker extends Worker {
    private static final java.util.concurrent.atomic.AtomicBoolean RUNNING=new java.util.concurrent.atomic.AtomicBoolean(false);
    public PulseWorker(@NonNull Context context,@NonNull WorkerParameters params) { super(context,params); }
    @NonNull @Override public Result doWork() {
        Context c=getApplicationContext();
        if(!PulseStore.needed(c)) return Result.success();
        if(!RUNNING.compareAndSet(false,true)) return Result.success();
        try {
            JSONArray catalog=PulseStore.catalog(c);
            for(int n=0;n<catalog.length();n++) {
                if(isStopped()||!PulseStore.needed(c)) break;
                JSONObject provider=catalog.getJSONObject(n);
                String id=provider.getString("id");
                if(!PulseStore.watchlist(c).contains(id)||provider.optString("format").equals("source-only")) continue;
                // A recent foreground sweep or another worker already supplied this feed.
                try { JSONObject saved=new JSONObject(PulseStore.prefs(c).getString("reading."+id,"{}"));
                    if(!saved.optBoolean("stale") && System.currentTimeMillis()-java.time.Instant.parse(saved.getString("checkedAt")).toEpochMilli()<120000) continue;
                } catch(Exception ignored) {}
                HttpURLConnection connection=null;
                try {
                    connection=(HttpURLConnection)new URL(provider.getString("url")).openConnection();
                    connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("User-Agent","PulseStatus/1.0");
                    if(connection.getResponseCode()!=200) throw new IOException("Feed unavailable");
                    String text;
                    try(InputStream in=connection.getInputStream();ByteArrayOutputStream buffer=new ByteArrayOutputStream()) {
                        byte[] chunk=new byte[8192];int length;
                        while((length=in.read(chunk))!=-1) { if(buffer.size()+length>5*1024*1024) throw new IOException("Feed too large");buffer.write(chunk,0,length); }
                        text=buffer.toString("UTF-8");
                    }
                    PulseStore.record(c,FeedReading.parse(provider,text));
                } catch(Exception error) {
                    JSONObject unavailable=new JSONObject().put("id",id).put("name",provider.getString("name")).put("status","unknown").put("stale",true).put("attemptedAt",java.time.Instant.now().toString());
                    PulseStore.record(c,unavailable);
                } finally { if(connection!=null) connection.disconnect(); }
            }
            PulseStore.prefs(c).edit().putLong("lastSweep",System.currentTimeMillis()).apply();
            PulseWidget.updateAll(c);
            return Result.success();
        } catch(Exception error) { return Result.failure(); }
        finally { RUNNING.set(false); }
    }
}
