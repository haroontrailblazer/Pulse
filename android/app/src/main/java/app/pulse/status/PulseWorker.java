package app.pulse.status;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;

public class PulseWorker extends Worker {
    public PulseWorker(@NonNull Context context,@NonNull WorkerParameters params) { super(context,params); }
    @NonNull @Override public Result doWork() {
        try { PulseStore.sweep(getApplicationContext(),this::isStopped); return Result.success(); }
        catch(Exception error) { return Result.retry(); }
    }
}
