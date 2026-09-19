package app.pulse.status;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/**
 * What the platform installer says back.
 *
 * STATUS_PENDING_USER_ACTION is the sheet the reader was promised: the installer
 * hands us an Intent to start, and starting it is what puts "Do you want to
 * update this app?" on screen. It is started here rather than being posted for
 * later because this broadcast arrives while Pulse is the foreground app -- the
 * install is only committed from a tap -- and an Activity started from the
 * background is exactly what API 36 refuses.
 *
 * There is no STATUS_SUCCESS branch that restarts Pulse, and that is not an
 * oversight. Measured on the API 36 emulator: an activity start from the fresh
 * process after a self-replace is refused with
 *
 *   Background activity launch blocked! goo.gle/android-bal
 *   [callingPackage: app.pulse.status; callingPackageTargetSdk: 36;
 *    callingUidProcState: FOREGROUND_SERVICE; isPendingIntent: false]
 *   START ... app.pulse.status/.MainActivity (BAL_BLOCK) result code=102
 *
 * and startActivity returned WITHOUT throwing, so code that tries it looks like
 * it worked. A foreground service process state buys no exemption, and the same
 * record reports resultIfPiSenderAllowsBal: BAL_BLOCK, so routing it through a
 * PendingIntent does not help either. The reader comes back with one tap: the
 * installer's own "Open" button, or the notification PulseBoot posts.
 */
public final class PulseInstalled extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !PulseInstaller.ACTION_STATUS.equals(intent.getAction())) return;
        Context c = context.getApplicationContext();
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE);
        JSONVersion version = new JSONVersion(c);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { c.startActivity(confirm); PulseDownload.record(c, version.name, "installing", null); return; }
                catch (Throwable ignored) {}
            }
            PulseDownload.record(c, version.name, "failed", "Could not open the installer");
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            // Rarely reached: this process is usually gone by now, replaced by the
            // very install it is reporting. PulseBoot handles the arrival of the
            // new version instead, and clears this record with it.
            PulseDownload.record(c, version.name, "idle", null);
            return;
        }
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        PulseDownload.record(c, version.name, "failed",
            status == PackageInstaller.STATUS_FAILURE_ABORTED
                ? "Install cancelled"
                : message != null && message.contains("INCOMPATIBLE")
                    ? "This build was signed with a different key"
                    : "The install did not finish");
    }

    /** The version the record is about, read once so a failure path cannot lose it. */
    private static final class JSONVersion {
        final String name;
        JSONVersion(Context c) {
            org.json.JSONObject offered = PulseUpdate.offered(c);
            name = offered == null ? "" : offered.optString("version", "");
        }
    }
}
