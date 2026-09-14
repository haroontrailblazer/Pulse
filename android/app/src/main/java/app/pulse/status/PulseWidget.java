package app.pulse.status;

import android.appwidget.*;
import android.content.*;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.util.*;
import java.text.DateFormat;

/**
 * "My stack": the insight header stays fixed while every watched service is
 * listed underneath, so a resized widget reveals more of the same watchlist
 * instead of a different, shorter one.
 */
public class PulseWidget extends AppWidgetProvider {
    static final String REFRESH = PulseWidgets.STACK_REFRESH;
    /**
     * Header decoration only appears once the list can still show the rows it
     * had without it: 97dp of fixed chrome, 17dp of subtitle, 23dp of eyebrow
     * and 31dp per row. Growing the widget must never cost a visible service.
     */
    private static final int EYEBROW_DP = 230, SUBTITLE_DP = 176;

    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids) { updateAll(c);PulseStore.schedule(c);PulseStore.refresh(c); }
    @Override public void onEnabled(Context c) { PulseStore.schedule(c);PulseStore.refresh(c); }
    @Override public void onDisabled(Context c) { PulseStore.schedule(c); }
    // The header is rebuilt from a fresh reading of the store, and staleness
    // is judged against the clock, so the rows have to be reloaded from the
    // same snapshot or the two can disagree.
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager manager,int id,Bundle options) { updateAll(c); }
    @Override public void onReceive(Context c,Intent intent) { super.onReceive(c,intent);if(REFRESH.equals(intent.getAction())) { PulseStore.refresh(c,true);updateAll(c); } }

    static void updateAll(Context c) {
        AppWidgetManager manager=AppWidgetManager.getInstance(c);
        int[] ids=PulseWidgets.ids(c,PulseWidget.class);
        if(ids.length==0) return;
        List<JSONObject> readings=PulseWidgets.readings(c);
        String summary=PulseReadings.summary(readings),subtitle=PulseReadings.subtitle(readings);
        long checked=PulseReadings.checkedAt(readings);
        String stamp=checked==0?c.getString(R.string.widget_awaiting)
            :"Snapshot · "+DateFormat.getDateTimeInstance(DateFormat.SHORT,DateFormat.SHORT).format(new Date(checked));
        for(int id:ids) {
            RemoteViews view=new RemoteViews(c.getPackageName(),R.layout.pulse_widget);
            view.setTextViewText(R.id.widget_summary,summary);
            view.setTextViewText(R.id.widget_subtitle,subtitle);
            view.setTextViewText(R.id.widget_time,stamp);
            int height=manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,0);
            view.setViewVisibility(R.id.widget_eyebrow,height>0&&height<EYEBROW_DP?View.GONE:View.VISIBLE);
            view.setViewVisibility(R.id.widget_subtitle,height>0&&height<SUBTITLE_DP?View.GONE:View.VISIBLE);
            // Everything except the refresh button opens the watchlist, so no
            // padding, footer or empty-state tap is dead.
            for(int target:new int[]{R.id.widget_root,R.id.widget_open,R.id.widget_empty,R.id.widget_time})
                view.setOnClickPendingIntent(target,PulseStore.open(c));
            view.setOnClickPendingIntent(R.id.widget_refresh,PulseWidgets.refresh(c));
            view.setRemoteAdapter(R.id.widget_list,PulseWidgets.adapter(c,PulseListService.class,id));
            view.setEmptyView(R.id.widget_list,R.id.widget_empty);
            view.setPendingIntentTemplate(R.id.widget_list,PulseWidgets.template(c));
            manager.updateAppWidget(id,view);
            // The adapter caches its rows: the list only reloads when the host
            // is told the data changed.
            manager.notifyAppWidgetViewDataChanged(id,R.id.widget_list);
        }
    }
}
