package app.pulse.status;

import android.content.*;

public final class PulseBoot extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        // Posted notifications retain their original bitmap across an APK
        // replacement. Remove legacy artwork before recreating the monitor.
        if(Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))
            androidx.core.app.NotificationManagerCompat.from(context).cancelAll();
        PulseStore.schedule(context);
        PulseStore.startContinuousMonitor(context);
        PulseStore.refresh(context);
    }
}
