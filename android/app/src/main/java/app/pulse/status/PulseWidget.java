package app.pulse.status;

import android.app.PendingIntent;
import android.appwidget.*;
import android.content.*;
import android.graphics.Color;
import android.widget.RemoteViews;
import org.json.*;
import java.util.*;
import java.text.DateFormat;

public class PulseWidget extends AppWidgetProvider {
    static final String REFRESH="app.pulse.status.WIDGET_REFRESH";
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids) { updateAll(c);PulseStore.schedule(c);PulseStore.refresh(c); }
    @Override public void onEnabled(Context c) { PulseStore.schedule(c);PulseStore.refresh(c); }
    @Override public void onDisabled(Context c) { PulseStore.schedule(c); }
    @Override public void onReceive(Context c,Intent intent) { super.onReceive(c,intent);if(REFRESH.equals(intent.getAction())) { PulseStore.refresh(c,true);updateAll(c); } }
    static int rank(JSONObject r) { return FeedReading.severity(r); }
    static void updateAll(Context c) {
        AppWidgetManager manager=AppWidgetManager.getInstance(c);
        for(int id:manager.getAppWidgetIds(new ComponentName(c,PulseWidget.class))) {
            RemoteViews view=new RemoteViews(c.getPackageName(),R.layout.pulse_widget);
            List<JSONObject> readings=new ArrayList<>();int issues=0,unavailable=0;
            try {
                JSONArray catalog=PulseStore.catalog(c);
                for(int n=0;n<catalog.length();n++) {
                    JSONObject provider=catalog.getJSONObject(n);String providerId=provider.getString("id");
                    if(!PulseStore.watchlist(c).contains(providerId)) continue;
                    JSONObject reading=new JSONObject(PulseStore.prefs(c).getString("reading."+providerId,"{}"));
                    reading.put("name",provider.getString("name"));
                    try {
                        if(System.currentTimeMillis()-java.time.Instant.parse(reading.getString("checkedAt")).toEpochMilli()>30*60*1000) reading.put("status","unknown").put("stale",true);
                    } catch(Exception ignored) {}
                    String signature=FeedReading.signature(reading);
                    if(signature!=null && !signature.isEmpty()) issues++;
                    if(signature==null) unavailable++;
                    readings.add(reading);
                }
            } catch(Exception ignored) {}
            readings.sort((a,b)->Integer.compare(rank(b),rank(a)));
            view.setTextViewText(R.id.widget_summary,readings.isEmpty()?"Your stack starts here":issues>0?issues+" watched services reported issues":"Your latest watchlist readings");
            view.setTextViewText(R.id.widget_subtitle,readings.isEmpty()?"Add services in Pulse to start monitoring":readings.size()+" watched · "+unavailable+" unavailable · tap to explore");
            int[] names={R.id.widget_name_1,R.id.widget_name_2,R.id.widget_name_3},states={R.id.widget_state_1,R.id.widget_state_2,R.id.widget_state_3};
            for(int n=0;n<3;n++) {
                if(n>=readings.size()) { view.setTextViewText(names[n],n==0?"Open Pulse →":"");view.setTextViewText(states[n],"");continue; }
                JSONObject r=readings.get(n);String s=r.optString("status","unknown");
                String signature=FeedReading.signature(r);
                boolean issue=signature!=null&&!signature.isEmpty();
                String label=rank(r)==4?"Major issue":rank(r)==3?"Degraded":s.equals("maintenance")?"Maintenance":s.equals("operational")?(issue?"Active issue":"Operational"):"Unavailable";
                int color=rank(r)==4?Color.rgb(255,137,137):issue?Color.rgb(235,192,108):s.equals("operational")?Color.rgb(147,211,173):Color.rgb(163,163,163);
                String name=r.optString("name");
                try { name+=" · "+DateFormat.getTimeInstance(DateFormat.SHORT).format(Date.from(java.time.Instant.parse(r.getString("checkedAt")))); } catch(Exception ignored){}
                view.setTextViewText(names[n],name);view.setTextViewText(states[n],label);view.setTextColor(states[n],color);
            }
            long checked=0;
            for(JSONObject r:readings) try { checked=Math.max(checked,java.time.Instant.parse(r.getString("checkedAt")).toEpochMilli()); }catch(Exception ignored){}
            String stamp=checked==0?"Awaiting official readings":"Snapshot · "+DateFormat.getDateTimeInstance(DateFormat.SHORT,DateFormat.SHORT).format(new Date(checked));
            view.setTextViewText(R.id.widget_time,stamp);
            view.setOnClickPendingIntent(R.id.widget_open,PulseStore.open(c));
            Intent refresh=new Intent(c,PulseWidget.class).setAction(REFRESH);
            view.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(c,101,refresh,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
            manager.updateAppWidget(id,view);
        }
    }
}
