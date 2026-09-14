package app.pulse.status;

import android.appwidget.*;
import android.content.*;
import android.os.Bundle;
import android.widget.RemoteViews;

/**
 * "Service icons": only the watched services, each drawn in its own brand
 * colour while healthy and in the shared degraded or outage colour when its
 * official feed reports a problem.
 */
public class PulseIconWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids) { updateAll(c);PulseStore.schedule(c);PulseStore.refresh(c); }
    @Override public void onEnabled(Context c) { PulseStore.schedule(c);PulseStore.refresh(c); }
    @Override public void onDisabled(Context c) { PulseStore.schedule(c); }
    // Hosts reuse widget ids, so a deleted instance must not leave its
    // background choice behind for whatever is placed next.
    @Override public void onDeleted(Context c,int[] ids) {
        SharedPreferences.Editor edit=PulseStore.prefs(c).edit();
        for(int id:ids) edit.remove(PulseIconStyle.key(id));
        edit.apply();
    }

    // Resizing changes how large the marks can be drawn, so the grid has to be
    // rebuilt rather than left to reflow at a fixed cell size.
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager manager,int id,Bundle options) { updateAll(c); }

    static void updateAll(Context c) {
        AppWidgetManager manager=AppWidgetManager.getInstance(c);
        for(int id:PulseWidgets.ids(c,PulseIconWidget.class)) {
            RemoteViews view=new RemoteViews(c.getPackageName(),R.layout.pulse_icon_widget);
            // The layout declares no background, so every repaint states the
            // instance's choice outright rather than relying on what was there.
            view.setInt(R.id.icon_root,"setBackgroundResource",
                PulseIconStyle.solid(PulseStore.prefs(c).getString(PulseIconStyle.key(id),null))?R.drawable.widget_background:0);
            int count=PulseWidgets.readings(c).size();
            view.setInt(R.id.icon_grid,"setNumColumns",
                PulseIconGrid.columnsFor(PulseWidgets.widthDp(c,id),PulseWidgets.heightDp(c,id),count));
            view.setRemoteAdapter(R.id.icon_grid,PulseWidgets.adapter(c,PulseIconService.class,id));
            view.setEmptyView(R.id.icon_grid,R.id.icon_empty);
            view.setPendingIntentTemplate(R.id.icon_grid,PulseWidgets.template(c));
            // Padding and the empty state sit outside the grid and would
            // otherwise swallow taps.
            for(int target:new int[]{R.id.icon_root,R.id.icon_empty})
                view.setOnClickPendingIntent(target,PulseStore.open(c));
            manager.updateAppWidget(id,view);
            manager.notifyAppWidgetViewDataChanged(id,R.id.icon_grid);
        }
    }
}
