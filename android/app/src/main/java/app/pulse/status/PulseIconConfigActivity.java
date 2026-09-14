package app.pulse.status;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.os.Bundle;

/**
 * Lets each placed icon widget choose whether it floats on the wallpaper or
 * paints the same dark card the stack widget uses. Shown when the widget is
 * placed, and reachable again from the host's widget settings.
 */
public class PulseIconConfigActivity extends Activity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        // A host discards the widget unless this activity reports success, so
        // the cancelled result has to stand before anything else can happen.
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent() == null ? null : getIntent().getExtras();
        if (extras != null)
            widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID || !ours(widgetId)) { finish(); return; }

        String current = PulseIconStyle.normalize(PulseStore.prefs(this).getString(PulseIconStyle.key(widgetId), null));
        final String[] chosen = { current };
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(R.string.widget_icons_background_title)
            .setSingleChoiceItems(
                new CharSequence[] {
                    getText(R.string.widget_icons_background_transparent),
                    getText(R.string.widget_icons_background_card),
                },
                PulseIconStyle.solid(current) ? 1 : 0,
                (dialog, which) -> chosen[0] = which == 1 ? PulseIconStyle.CARD : PulseIconStyle.TRANSPARENT)
            .setPositiveButton(R.string.widget_icons_background_save, (dialog, which) -> save(chosen[0]))
            .setNegativeButton(android.R.string.cancel, (dialog, which) -> finish())
            .setOnCancelListener(dialog -> finish())
            .show();
    }

    /** This activity is exported for the host, so only our own widget ids are accepted. */
    private boolean ours(int id) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(id);
        // A host may not publish the info until configuration succeeds; only a
        // definite mismatch is rejected.
        return info == null || info.provider == null
            || PulseIconWidget.class.getName().equals(info.provider.getClassName());
    }

    private void save(String style) {
        PulseStore.prefs(this).edit().putString(PulseIconStyle.key(widgetId), PulseIconStyle.normalize(style)).apply();
        // A first-time configuration has had no onUpdate yet: this is what binds
        // the collection adapter and paints the chosen background.
        PulseIconWidget.updateAll(this);
        PulseStore.schedule(this);
        PulseStore.refresh(this);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }
}
