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
    @Override public void load() { PulseStore.channel(getContext()); PulseStore.schedule(getContext()); if(PulseStore.continuous(getContext())) PulseStore.startContinuousMonitor(getContext()); }
    @PluginMethod public void status(PluginCall call) { call.resolve(state()); }
    private JSObject state() { return new JSObject().put("enabled",PulseStore.prefs(getContext()).getBoolean("enabled",false)).put("permission",PulseStore.permission(getContext())?"granted":"denied").put("lastCheckedAt",PulseStore.prefs(getContext()).getString("lastCheckedAt",null)).put("intervalSeconds",PulseStore.continuousInterval(getContext())/1000).put("continuous",PulseStore.continuous(getContext())); }
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
                    for(String old:PulseStore.watchlist(getContext())) if(!ids.contains(old)) { edit.remove("reading."+old);edit.remove("signature."+old); }
                    if(!PulseStore.watchlist(getContext()).containsAll(ids)) edit.remove("lastRequested");
                    edit.putStringSet("watchlist",ids);
                }
                Boolean enabled=call.getBoolean("enabled"); if(enabled!=null) { if(enabled&&!p.getBoolean("enabled",false)) edit.remove("lastRequested"); edit.putBoolean("enabled",enabled); }
                edit.apply();
            }
            PulseStore.schedule(getContext());PulseStore.refresh(getContext());if(PulseStore.continuous(getContext())) PulseStore.startContinuousMonitor(getContext()); else PulseStore.stopContinuousMonitor(getContext());PulseWidget.updateAll(getContext());call.resolve(state());
        } catch(Exception error) { call.reject("Could not save monitoring preferences",error); }
    }
    @PluginMethod public void record(PluginCall call) {
        try {
            JSArray readings=call.getArray("providers");
            if(readings!=null) for(int n=0;n<readings.length();n++) PulseStore.record(getContext(),readings.getJSONObject(n));
            PulseWidget.updateAll(getContext());call.resolve();
        } catch(Exception error) { call.reject("Could not update widget readings",error); }
    }
    @PluginMethod public void pinWidget(PluginCall call) {
        AppWidgetManager manager=AppWidgetManager.getInstance(getContext());
        boolean supported=Build.VERSION.SDK_INT>=26 && manager.isRequestPinAppWidgetSupported();
        if(supported) manager.requestPinAppWidget(new ComponentName(getContext(),PulseWidget.class),null,null);
        call.resolve(new JSObject().put("supported",supported));
    }
    @Override protected void handleOnResume() {
        PulseStore.schedule(getContext());
        if(PulseStore.continuous(getContext())) PulseStore.startContinuousMonitor(getContext());
        PulseStore.refresh(getContext());
        Intent intent=getActivity().getIntent();
        if(intent.getBooleanExtra("pulseWatchlist",false)) { intent.removeExtra("pulseWatchlist");notifyListeners("openWatchlist",new JSObject(),true); }
    }
    @Override protected void handleOnNewIntent(Intent intent) {
        if(intent.getBooleanExtra("pulseWatchlist",false)) { intent.removeExtra("pulseWatchlist");notifyListeners("openWatchlist",new JSObject(),true); }
    }
}
