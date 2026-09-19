package app.pulse.status;

import android.app.Activity;

/**
 * The back-press decision, kept free of Android so the JVM test task can prove it.
 *
 * Capacitor 8 ships no back handling of any kind, so before this the Activity default
 * ran and Pulse closed from wherever the reader happened to be -- mid-sheet, mid-page,
 * it made no difference.
 *
 * The obvious mechanism does not work, and this was measured on a device rather than
 * assumed. Pulse gives every destination and every open sheet a history.pushState
 * entry, and on API 36 with WebView 133 the WebView reported canGoBack() == false at a
 * moment when the page itself reported history.length == 2. Same-document entries are
 * not in the WebBackForwardList that canGoBack() consults, so a native read of it
 * concludes Pulse has nowhere to go and closes the app -- which is the bug, not the
 * fix. So the web layer owns the question, reports the answer whenever its history
 * changes, and takes the step itself. What is left here is only what to do when there
 * is nowhere left to go.
 *
 * And that depends on the platform. Predictive back previews the launcher on the press
 * that leaves, which is warning enough -- but it exists only from API 34, and this app
 * ships to API 24. Below 34 there is nothing to see, so an unannounced exit is exactly
 * the complaint this change exists to fix, and the press is confirmed instead.
 */
final class PulseBack {
    static final int CONFIRM = 1;
    static final int LEAVE = 2;
    /** How long a confirmation stands. Long enough to read, short enough not to trap. */
    static final long CONFIRM_MS = 2200L;

    private PulseBack() {}

    /** Whether the platform will preview the launcher for us on the leaving press. */
    static boolean previews(int sdk) {
        return sdk >= 34;
    }

    /**
     * Whether our callback should be registered at all. Androidx registers the platform
     * callback only while some callback is enabled, so being disabled at the root is the
     * only way to let the system play its own animation -- and on the levels with no
     * animation to protect, staying armed is the only way to warn.
     */
    static boolean armed(boolean webHasHistory, int sdk) {
        return webHasHistory || !previews(sdk);
    }

    static int leaving(int sdk, long now, long confirmedAt) {
        if (previews(sdk)) return LEAVE;
        return now - confirmedAt > CONFIRM_MS ? CONFIRM : LEAVE;
    }

    /**
     * Not finish(). Since Android 12 the platform back on a task root activity
     * backgrounds the task rather than destroying it, which keeps the process warm and
     * returns the reader to the place they left. finish(), which is what the App plugin
     * exitApp() calls, forces a cold start instead.
     */
    static void leave(Activity activity) {
        activity.moveTaskToBack(true);
    }
}
