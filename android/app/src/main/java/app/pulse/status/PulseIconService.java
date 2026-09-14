package app.pulse.status;

import android.content.*;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONObject;
import java.util.*;

/** Feeds the watched services' brand marks to the icon widget grid. */
public class PulseIconService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) { return new Cells(getApplicationContext()); }

    static final class Cells implements RemoteViewsFactory {
        private final Context context;
        // The host calls onDataSetChanged and getViewAt on different binder
        // threads, so the snapshot has to be published, not mutated.
        private volatile List<JSONObject> readings=Collections.emptyList();
        Cells(Context context) { this.context=context; }
        @Override public void onCreate() {}
        @Override public void onDataSetChanged() { readings=Collections.unmodifiableList(PulseWidgets.readings(context)); }
        @Override public void onDestroy() { readings=Collections.emptyList(); }
        @Override public int getCount() { return readings.size(); }
        // Rows are re-sorted by severity on every reading, so identity has to
        // come from the provider rather than from the position.
        @Override public long getItemId(int position) {
            List<JSONObject> snapshot=readings;
            return position<0||position>=snapshot.size()?position:snapshot.get(position).optString("id").hashCode();
        }
        @Override public boolean hasStableIds() { return true; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public RemoteViews getViewAt(int position) {
            RemoteViews cell=new RemoteViews(context.getPackageName(),R.layout.pulse_icon_widget_cell);
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
