package app.pulse.status;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import androidx.annotation.RequiresApi;
import org.json.JSONObject;

import java.util.List;

/**
 * The worst thing the reader's watchlist is doing, one swipe from anywhere.
 *
 * This computes nothing. PulseWidgets.readings already returns the watched
 * services worst-first from the same stored readings the widgets draw, and
 * FeedReading.severity already ranks them, so the tile is a third view of
 * numbers two other surfaces agree on rather than a fourth opinion about what
 * "bad" means.
 *
 * It is deliberately read-only. A quick-settings tile that toggled monitoring
 * would put "stop watching my infrastructure" one accidental tap from the torch,
 * and the reader has already made that decision in Settings. Tapping opens the
 * watchlist instead, reusing the same pulseWatchlist extra the widgets send, so
 * there is no new routing and nothing new for MainActivity to validate.
 *
 * Requires API 24, which is this app's minSdk, so it is available to every
 * supported device. The refinements are guarded individually rather than the
 * whole class being gated at a higher level.
 */
@RequiresApi(Build.VERSION_CODES.N)
public class PulseTile extends TileService {

    @Override public void onStartListening() {
        super.onStartListening();
        paint();
    }

    @Override public void onClick() {
        super.onClick();
        Intent intent = new Intent(this, MainActivity.class)
            .putExtra("pulseWatchlist", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        // API 34 forbids the Intent overload and requires a PendingIntent; below
        // it, the PendingIntent overload does not exist. Both are the same
        // gesture to the reader.
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(
                this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        } else {
            startActivityAndCollapse(intent);
        }
    }

    private void paint() {
        Tile tile = getQsTile();
        if (tile == null) return;
        try {
            List<JSONObject> readings = PulseWidgets.readings(this);
            if (readings.isEmpty()) {
                // No watchlist is not the same as everything being fine, and the
                // tile must not imply it is.
                tile.setState(Tile.STATE_INACTIVE);
                tile.setLabel("Pulse");
                subtitle(tile, "No watched services");
            } else {
                JSONObject worst = readings.get(0);
                int severity = FeedReading.severity(worst);
                tile.setState(severity >= 2 ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
                tile.setLabel(severity >= 2 ? worst.optString("name", "Pulse") : "Pulse");
                subtitle(tile, describe(readings, severity));
            }
            tile.setIcon(Icon.createWithResource(this, R.drawable.ic_pulse_notification_logo));
        } catch (Exception error) {
            // A tile that throws is a tile the platform stops listening to, and
            // the reader gets no way back except a reboot.
            tile.setState(Tile.STATE_INACTIVE);
            tile.setLabel("Pulse");
        }
        tile.updateTile();
    }

    /**
     * How many watched services are reporting something, not how many exist.
     * The wording never says "operational" on Pulse's own authority - a reading
     * Pulse could not take is counted as unavailable rather than as fine.
     */
    private String describe(List<JSONObject> readings, int worstSeverity) {
        int issues = 0, unavailable = 0;
        for (JSONObject reading : readings) {
            int severity = FeedReading.severity(reading);
            if (severity >= 2) issues++;
            else if (severity == 1) unavailable++;
        }
        if (issues > 0) return issues + (issues == 1 ? " service reporting" : " services reporting");
        if (unavailable > 0) return unavailable + (unavailable == 1 ? " feed unavailable" : " feeds unavailable");
        return readings.size() + (readings.size() == 1 ? " service clear" : " services clear");
    }

    /** setSubtitle arrived in API 29; below it the label carries everything. */
    private void subtitle(Tile tile, String text) {
        if (Build.VERSION.SDK_INT >= 29) tile.setSubtitle(text);
    }
}
