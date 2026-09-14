package app.pulse.status;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.net.Uri;
import android.os.Build;
import org.json.JSONObject;
import java.util.*;

/** Everything both home-screen widgets share: placement, readings and intents. */
final class PulseWidgets {
    static final String STACK_REFRESH = "app.pulse.status.WIDGET_REFRESH";
    // 100 is PulseStore.open; a template needs its own code so the two
    // PendingIntents cannot overwrite each other.
    private static final int STACK_REFRESH_CODE = 101, TEMPLATE = 104;

    private PulseWidgets() {}

    static int[] ids(Context c, Class<?> provider) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, provider));
    }
    /** Any Pulse widget on any launcher keeps background checks scheduled. */
    static int placed(Context c) { return ids(c, PulseWidget.class).length + ids(c, PulseIconWidget.class).length; }
    static void updateAll(Context c) { PulseWidget.updateAll(c); PulseIconWidget.updateAll(c); }

    static List<JSONObject> readings(Context c) {
        try {
            SharedPreferences prefs = PulseStore.prefs(c);
            return PulseReadings.list(PulseStore.catalog(c), PulseStore.watchlist(c),
                id -> prefs.getString("reading." + id, "{}"), System.currentTimeMillis());
        } catch (Exception error) { return new ArrayList<>(); }
    }

    /**
     * A collection item carries its click through a template plus a fill-in
     * intent, and a template has to stay mutable for that merge. The intent
     * names its component explicitly so nothing else can be redirected into it.
     */
    static PendingIntent template(Context c) {
        Intent intent = new Intent(c, MainActivity.class).putExtra("pulseWatchlist", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getActivity(c, TEMPLATE, intent, flags);
    }

    static PendingIntent refresh(Context c) {
        Intent intent = new Intent(c, PulseWidget.class).setAction(STACK_REFRESH);
        return PendingIntent.getBroadcast(c, STACK_REFRESH_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * setRemoteAdapter compares intents with filterEquals, so each widget needs
     * its own data URI or a second copy would share the first one's rows.
     */
    /**
     * Portrait bounds of a placed widget, in dp. MIN_WIDTH is the portrait width
     * and MAX_HEIGHT the portrait height; the other pair describes landscape.
     */
    static int widthDp(Context c, int widgetId) { return option(c, widgetId, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250); }
    static int heightDp(Context c, int widgetId) { return option(c, widgetId, AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110); }
    private static int option(Context c, int widgetId, String key, int fallback) {
        try {
            int value = AppWidgetManager.getInstance(c).getAppWidgetOptions(widgetId).getInt(key, 0);
            return value > 0 ? value : fallback;
        } catch (Exception error) { return fallback; }
    }

    static Intent adapter(Context c, Class<?> service, int widgetId) {
        Intent intent = new Intent(c, service).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        return intent.setData(Uri.parse(intent.toUri(Intent.URI_INTENT_SCHEME)));
    }
}
