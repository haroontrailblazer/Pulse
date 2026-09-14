package app.pulse.status;

import android.appwidget.AppWidgetManager;
import android.content.*;
import android.os.Bundle;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONObject;
import java.util.*;

/** Feeds the watched services' brand marks to the icon widget grid. */
public class PulseIconService extends RemoteViewsService {
    /** Cell layouts, smallest first, parallel to PulseIconGrid.CELLS. */
    static final int[] LAYOUTS = {
        R.layout.pulse_icon_widget_cell_40, R.layout.pulse_icon_widget_cell_52,
        R.layout.pulse_icon_widget_cell_64, R.layout.pulse_icon_widget_cell_76,
    };
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Cells(getApplicationContext(),
            intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID));
    }

    static final class Cells implements RemoteViewsFactory {
        private final Context context;
        private final int widgetId;
        private volatile int layout=LAYOUTS[0];
        // The host calls onDataSetChanged and getViewAt on different binder
        // threads, so the snapshot has to be published, not mutated.
        private volatile List<JSONObject> readings=Collections.emptyList();
        Cells(Context context,int widgetId) { this.context=context;this.widgetId=widgetId; }
        @Override public void onCreate() {}
        @Override public void onDataSetChanged() {
            List<JSONObject> snapshot=Collections.unmodifiableList(PulseWidgets.readings(context));
            readings=snapshot;
            // A 5x6 launcher grid gives a far bigger box than a 4x5 one, so the
            // mark grows to use it instead of floating in dead space.
            layout=LAYOUTS[PulseIconGrid.fit(PulseWidgets.widthDp(context,widgetId),
                PulseWidgets.heightDp(context,widgetId),snapshot.size())];
        }
        @Override public void onDestroy() { readings=Collections.emptyList(); }
        @Override public int getCount() { return readings.size(); }
        // Rows are re-sorted by severity on every reading, so identity has to
        // come from the provider rather than from the position.
        @Override public long getItemId(int position) {
            List<JSONObject> snapshot=readings;
            return position<0||position>=snapshot.size()?position:snapshot.get(position).optString("id").hashCode();
        }
        @Override public boolean hasStableIds() { return true; }
        @Override public int getViewTypeCount() { return LAYOUTS.length; }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public RemoteViews getViewAt(int position) {
            RemoteViews cell=new RemoteViews(context.getPackageName(),layout);
            List<JSONObject> snapshot=readings;
            if(position<0||position>=snapshot.size()) return cell;
            JSONObject reading=snapshot.get(position);
            cell.setImageViewResource(R.id.cell_icon,PulseIcons.drawable(reading.optString("id")));
            cell.setInt(R.id.cell_icon,"setColorFilter",PulseReadings.tint(reading));
            cell.setContentDescription(R.id.cell_open,PulseReadings.describe(reading));
            cell.setOnClickFillInIntent(R.id.cell_open,new Intent());
            return cell;
        }
    }
}
