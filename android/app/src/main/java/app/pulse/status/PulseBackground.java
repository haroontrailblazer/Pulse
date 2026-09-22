package app.pulse.status;

import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.util.*;

@CapacitorPlugin(name="PulseBackground",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class PulseBackground extends Plugin {
    private final java.util.concurrent.ExecutorService feeds = java.util.concurrent.Executors.newFixedThreadPool(4);
    @PluginMethod public void fetchFeed(PluginCall call) {
        feeds.execute(() -> {
            try {
                JSONArray catalog = PulseStore.catalog(getContext());
                for (int n = 0; n < catalog.length(); n++) {
                    JSONObject provider = catalog.getJSONObject(n);
                    if (provider.getString("id").equals(call.getString("id")) && !provider.optString("format").equals("source-only")) {
                        call.resolve(new JSObject().put("text", OfficialFeed.read(provider))); return;
                    }
                }
                call.reject("Unknown status provider");
            } catch (Exception error) { call.reject("Official feed unavailable", error); }
        });
    }
    @Override protected void handleOnDestroy() { feeds.shutdownNow(); }
    @Override public void load() { current=this; try { PulseUpdateWorker.arm(getContext()); PulseUpdateWorker.catchUp(getContext()); } catch(Throwable ignored) {} PulseStore.channel(getContext()); PulseStore.schedule(getContext()); if(PulseStore.continuous(getContext())) PulseStore.startContinuousMonitor(getContext()); }
    /** The one live instance, so the Activity back callback can reach the web layer. */
    private static PulseBackground current;
    /** Ask the web layer to take one step back. It owns the stack; see PulseBack. */
    static void dispatchBack() { if(current!=null) current.notifyListeners("backPressed",new JSObject(),false); }
    private void withActivity(java.util.function.Consumer<MainActivity> action) {
        android.app.Activity activity=getActivity();
        if(activity instanceof MainActivity) activity.runOnUiThread(()->action.accept((MainActivity)activity));
    }
    /**
     * Pulse gives every destination and every open sheet a history.pushState entry, and
     * WebView.canGoBack() does not see those. Measured on API 36: it reported false while
     * the page reported history.length 2. So the web layer reports this whenever its
     * history changes, and it is the only source the Activity trusts.
     */
    @PluginMethod public void setBackAvailable(PluginCall call) {
        boolean available=Boolean.TRUE.equals(call.getBoolean("available",false));
        withActivity(activity->activity.syncBack(available));
        call.resolve();
    }
    /**
     * Fetch the offered update inside Pulse. Progress is pushed to the web layer as
     * it arrives so the row can show it; the install is a separate, deliberate
     * second call, because committing a session raises a system sheet and that has
     * to follow a tap rather than a download finishing.
     */
    @PluginMethod public void downloadUpdate(PluginCall call) {
        JSONObject update=PulseUpdate.offered(getContext());
        if(update==null) { call.reject("No update is offered"); return; }
        if(PulseDownload.running()) { call.resolve(); return; }
        feeds.execute(()->{
            java.io.File got=PulseDownload.fetch(getContext(),update,(received,total)->{
                JSObject at=new JSObject().put("state","downloading").put("version",update.optString("version",""));
                at.put("progress",total>0?(double)received/(double)total:0d);
                notifyListeners("updateDownload",at,false);
            });
            notifyListeners("updateDownload",new JSObject().put("version",update.optString("version","")).put("state",got==null?"failed":"ready"),false);
        });
        call.resolve();
    }
    /**
     * Hand the verified file to the platform installer. Only ever called from a tap
     * while Pulse is on screen: the sheet is an Activity, and an Activity started
     * from the background is refused on API 36.
     */
    @PluginMethod public void installUpdate(PluginCall call) {
        JSONObject update=PulseUpdate.offered(getContext());
        if(update==null) { call.reject("No update is offered"); return; }
        if(!PulseInstaller.allowed(getContext())) {
            getActivity().startActivity(PulseInstaller.permissionIntent(getContext()));
            call.resolve(new JSObject().put("state","blocked"));
            return;
        }
        java.io.File apk=PulseDownload.file(getContext(),update.optString("version",""));
        String failure=PulseInstaller.install(getContext(),update,apk);
        if(failure!=null) {
            PulseDownload.record(getContext(),update.optString("version",""),"failed",failure);
            call.resolve(new JSObject().put("state","failed").put("error",failure));
            return;
        }
        call.resolve(new JSObject().put("state","installing"));
    }
    /** The web layer found nothing left to unwind. Backgrounds the task, or asks first. */
    @PluginMethod public void leaveApp(PluginCall call) {
        withActivity(MainActivity::leave);
        call.resolve();
    }
    @PluginMethod public void status(PluginCall call) { call.resolve(state()); }
    // Every reply the bridge makes carries the offered update, and that is the one
    // wiring detail in this feature worth stating: the web layer calls configure()
    // on every boot and status() only when the settings sheet mounts, so a field
    // added anywhere but here would be missing until the reader opened Settings and
    // would be wiped again by the next watchlist edit. status(), configure() and
    // the permission callback all resolve this same object.
    private JSObject state() {
        JSObject state=new JSObject().put("enabled",PulseStore.prefs(getContext()).getBoolean("enabled",false)).put("permission",PulseStore.permission(getContext())?"granted":"denied").put("lastCheckedAt",PulseStore.prefs(getContext()).getString("lastCheckedAt",null)).put("intervalSeconds",PulseStore.PROBE_MS/1000).put("continuous",PulseStore.continuous(getContext()));
        org.json.JSONObject update=PulseUpdate.offered(getContext());
        if(update==null) return state;
        state.put("update",(Object)update);
        org.json.JSONObject download=PulseDownload.state(getContext());
        if(download!=null) state.put("download",(Object)download);
        // Whether the reader has allowed Pulse to install, so the row can ask before
        // it spends their data rather than after.
        return state.put("canInstall",PulseInstaller.allowed(getContext()));
    }
    @PluginMethod public void requestAlerts(PluginCall call) {
        if(Build.VERSION.SDK_INT>=33 && getPermissionState("notifications")!=PermissionState.GRANTED) requestPermissionForAlias("notifications",call,"permissionResult");
        else call.resolve(state());
    }
    @PermissionCallback private void permissionResult(PluginCall call) { call.resolve(state()); }
    @PluginMethod public void configure(PluginCall call) {
        try {
            synchronized(PulseStore.class) {
                SharedPreferences p=PulseStore.prefs(getContext()); SharedPreferences.Editor edit=p.edit();
                JSArray requested=call.getArray("watchlist");
                if(requested!=null) {
                    Set<String> allowed=new HashSet<>(); JSONArray catalog=PulseStore.catalog(getContext());
                    for(int n=0;n<catalog.length();n++) allowed.add(catalog.getJSONObject(n).getString("id"));
                    Set<String> ids=new HashSet<>(); for(int n=0;n<requested.length();n++) if(allowed.contains(requested.optString(n))) ids.add(requested.optString(n));
                    for(String old:PulseStore.watchlist(getContext())) if(!ids.contains(old)) { edit.remove("reading."+old);edit.remove("signature."+old);edit.remove("probe."+old); }
                    if(!PulseStore.watchlist(getContext()).containsAll(ids)) edit.remove("lastRequested");
                    edit.putStringSet("watchlist",ids);
                }
                Boolean enabled=call.getBoolean("enabled");
                if(enabled!=null) {
                    if(enabled&&!p.getBoolean("enabled",false)) {
                        edit.remove("lastRequested");
                        // Signatures only advance while alerts are on, so a stale
                        // one would read as a recovery that never happened. Probe
                        // indicators go with them: a stale one reads as "nothing
                        // moved" and would hold back the full read that notices an
                        // outage which began while alerts were off.
                        for(String key:p.getAll().keySet()) if(key.startsWith("signature.")||key.startsWith("probe.")) edit.remove(key);
                    }
                    edit.putBoolean("enabled",enabled);
                }
                edit.apply();
            }
            PulseStore.schedule(getContext());PulseStore.refresh(getContext());if(PulseStore.continuous(getContext())) PulseStore.startContinuousMonitor(getContext()); else PulseStore.stopContinuousMonitor(getContext());PulseWidgets.updateAll(getContext());call.resolve(state());
        } catch(Exception error) { call.reject("Could not save monitoring preferences",error); }
    }
    @PluginMethod public void record(PluginCall call) {
        try {
            JSArray readings=call.getArray("providers");
            if(readings!=null) for(int n=0;n<readings.length();n++) PulseStore.record(getContext(),readings.getJSONObject(n));
            PulseWidgets.updateAll(getContext());call.resolve();
        } catch(Exception error) { call.reject("Could not update widget readings",error); }
    }
    @PluginMethod public void pinWidget(PluginCall call) {
        AppWidgetManager manager=AppWidgetManager.getInstance(getContext());
        boolean supported=Build.VERSION.SDK_INT>=26 && manager.isRequestPinAppWidgetSupported();
        Class<?> widget="icons".equals(call.getString("widget"))?PulseIconWidget.class:PulseWidget.class;
        if(supported) manager.requestPinAppWidget(new ComponentName(getContext(),widget),null,null);
        call.resolve(new JSObject().put("supported",supported));
    }
    @Override protected void handleOnResume() {
        PulseStore.schedule(getContext());
        if(PulseStore.continuous(getContext())) PulseStore.startContinuousMonitor(getContext());
        PulseStore.refresh(getContext());
        Intent intent=getActivity().getIntent();
        if(intent.getBooleanExtra("pulseWatchlist",false)) { intent.removeExtra("pulseWatchlist");notifyListeners("openWatchlist",new JSObject(),true); }
        // Tapping the update notification has to land somewhere the notice is
        // visible. On a phone the row lives behind the More button, so opening the
        // app alone would show an unchanged screen; this asks the web layer to open
        // the navigation sheet where the row is.
        if(intent.getBooleanExtra("pulseUpdate",false)) { intent.removeExtra("pulseUpdate");notifyListeners("openUpdate",new JSObject(),true); }
    }
    @Override protected void handleOnNewIntent(Intent intent) {
        if(intent.getBooleanExtra("pulseWatchlist",false)) { intent.removeExtra("pulseWatchlist");notifyListeners("openWatchlist",new JSObject(),true); }
        // Tapping the update notification has to land somewhere the notice is
        // visible. On a phone the row lives behind the More button, so opening the
        // app alone would show an unchanged screen; this asks the web layer to open
        // the navigation sheet where the row is.
        if(intent.getBooleanExtra("pulseUpdate",false)) { intent.removeExtra("pulseUpdate");notifyListeners("openUpdate",new JSObject(),true); }
    }
}
