package app.pulse.status;

import android.content.*;

public final class PulseBoot extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        PulseStore.schedule(context);
        PulseStore.refresh(context);
    }
}
