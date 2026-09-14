package app.pulse.status;

import android.content.*;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONObject;
import java.util.*;
import java.text.DateFormat;

/** Feeds every watched service to the "My stack" widget list. */
public class PulseListService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) { return new Rows(getApplicationContext()); }

    static final class Rows implements RemoteViewsFactory {
        private final Context context;
        // The host calls onDataSetChanged and getViewAt on different binder
        // threads, so the snapshot has to be published, not mutated.
        private volatile List<JSONObject> readings=Collections.emptyList();
        Rows(Context context) { this.context=context; }
        @Override public void onCreate() {}
        // Called on a binder thread with the host waiting: read the stored
        // readings here, never fetch a feed.
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
            RemoteViews row=new RemoteViews(context.getPackageName(),R.layout.pulse_widget_row);
            List<JSONObject> snapshot=readings;
            if(position<0||position>=snapshot.size()) return row;
            JSONObject reading=snapshot.get(position);
            row.setImageViewResource(R.id.row_icon,PulseIcons.drawable(reading.optString("id")));
            row.setInt(R.id.row_icon,"setColorFilter",PulseReadings.tint(reading));
            row.setTextViewText(R.id.row_name,name(reading));
            row.setTextViewText(R.id.row_state,PulseReadings.label(reading));
            row.setTextColor(R.id.row_state,PulseReadings.stateColor(reading));
            row.setContentDescription(R.id.row_open,PulseReadings.describe(reading));
            row.setOnClickFillInIntent(R.id.row_open,new Intent());
            return row;
        }
        private static String name(JSONObject reading) {
            String name=reading.optString("name");
            try { return name+" · "+DateFormat.getTimeInstance(DateFormat.SHORT).format(Date.from(java.time.Instant.parse(reading.getString("checkedAt")))); }
            catch(Exception error) { return name; }
        }
    }
}
