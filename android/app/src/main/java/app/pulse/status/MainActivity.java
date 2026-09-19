package app.pulse.status;

import android.os.Bundle;
import android.os.Build;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private OnBackPressedCallback back;
    /** The web layer last word on whether Pulse has anywhere to go back to. */
    private boolean webHasHistory;
    private long confirmedAt;

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PulseBackground.class);
        super.onCreate(savedInstanceState);
        // Added after super.onCreate so this outranks anything a plugin registers: the
        // dispatcher runs the last enabled callback first. Starts disabled, because at
        // boot Pulse is on its own front door and the press belongs to the system.
        back = new OnBackPressedCallback(PulseBack.armed(false, Build.VERSION.SDK_INT)) {
            @Override public void handleOnBackPressed() {
                if (webHasHistory) {
                    // The step itself belongs to the web layer. Measured on a device:
                    // WebView.canGoBack() does not see history.pushState entries, so
                    // deciding it here would close the app while Pulse still had a sheet
                    // open or a place to return to.
                    PulseBackground.dispatchBack();
                    return;
                }
                leave();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, back);
    }

    /** Nowhere left to go: background the task, announcing it where nothing else would. */
    void leave() {
        if (PulseBack.leaving(Build.VERSION.SDK_INT, System.currentTimeMillis(), confirmedAt)
                == PulseBack.CONFIRM) {
            confirmedAt = System.currentTimeMillis();
            Toast.makeText(this, R.string.back_confirm, Toast.LENGTH_SHORT).show();
            return;
        }
        PulseBack.leave(this);
    }

    /** Called whenever the web layer history changes, and on resume. */
    void syncBack(boolean hasHistory) {
        webHasHistory = hasHistory;
        if (back != null) back.setEnabled(PulseBack.armed(hasHistory, Build.VERSION.SDK_INT));
    }

    @Override public void onResume() {
        super.onResume();
        // A press that left the app disarmed the callback on the way out, so a warm
        // relaunch has to re-arm from what the web layer last reported, or back stops
        // working for the rest of the session.
        confirmedAt = 0L;
        syncBack(webHasHistory);
    }
}
