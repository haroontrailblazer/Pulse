package app.pulse.status;

import android.appwidget.*;
import android.content.*;
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

    // The grid reflows its own column count from the measured width, so a
    // resize needs no repaint: there is no onAppWidgetOptionsChanged override.
    static void updateAll(Context c) {
        AppWidgetManager manager=AppWidgetManager.getInstance(c);
        for(int id:PulseWidgets.ids(c,PulseIconWidget.class)) {
            RemoteViews view=new RemoteViews(c.getPackageName(),R.layout.pulse_icon_widget);
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
