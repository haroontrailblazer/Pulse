package app.pulse.status;

import android.content.*;

public final class PulseBoot extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        // Posted notifications retain their original bitmap across an APK
        // replacement. Remove legacy artwork before recreating the monitor.
        if(Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))
            androidx.core.app.NotificationManagerCompat.from(context).cancelAll();
        // The replacement may well BE the version the stored notice was offering, so
        // clear it and let the next morning decide again. Without this the sidebar
        // row would keep pointing at a download the reader has already installed
        // until that check ran.
        if(Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            String was=PulseStore.prefs(context).getString("updateNotified","");
            PulseStore.prefs(context).edit().remove("update").remove("updateNotified").remove("updateCheckedDay").remove("download").apply();
            PulseDownload.sweep(context,null);
            // The one reliable way back into Pulse after it has replaced itself.
            // Measured on API 36: starting the Activity from here is refused with
            // "Background activity launch blocked!" and result code 102, and
            // startActivity does not throw, so code that tries it only looks like
            // it works. A tapped notification is a system-sent PendingIntent, which
            // is the exemption that block record is itself quoting. Posted after
            // the cancelAll above, or it would cancel this too.
            if(!was.isEmpty()) PulseStore.announceInstalled(context,was);
        }
        // Hosts re-inflate the initial layout after a reboot or a package
        // replacement, so both widgets have to be repainted from the stored
        // readings before anything else is arranged.
        PulseWidgets.updateAll(context);
        PulseStore.schedule(context);
        PulseAlarm.schedule(context);
        PulseStore.startContinuousMonitor(context);
        PulseStore.refresh(context);
    }
}
