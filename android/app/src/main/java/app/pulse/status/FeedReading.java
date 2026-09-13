package app.pulse.status;

import org.json.*;
import java.time.Instant;
import java.util.*;

/** Small headless parser of the same official formats used by the foreground app. */
final class FeedReading {
    static String state(String value) throws JSONException {
        switch (value) {
            case "none": case "operational": return "operational";
            case "minor": case "degraded": return "degraded";
            case "major": case "critical": case "downtime": case "unavailable": return "outage";
            case "maintenance": return "maintenance";
            default: throw new JSONException("Unrecognized feed state");
        }
    }
    static JSONObject parse(JSONObject provider, String text) throws JSONException {
        JSONObject result = new JSONObject().put("id", provider.getString("id")).put("name", provider.getString("name"));
        String format = provider.optString("format");
        JSONArray components = new JSONArray(), incidents = new JSONArray();
        String status;
        if (format.equals("google")) {
            JSONArray data = new JSONArray(text);
            status = "operational";
            for (int n = 0; n < data.length(); n++) {
                JSONObject i = data.getJSONObject(n);
                i.getString("id"); i.getString("begin"); i.getJSONArray("updates");
                JSONObject latest = i.optJSONObject("most_recent_update");
                if (i.optString("end", "").isEmpty() && (latest == null || !latest.optString("status").equals("AVAILABLE"))) {
                    status = "degraded";
                    incidents.put(new JSONObject().put("id",i.getString("id")).put("name",i.optString("external_desc","Google Cloud incident")).put("impact",i.optString("severity").equals("high")?"major":"minor").put("status","active"));
                }
            }
        } else if (format.equals("betterstack")) {
            JSONObject data = new JSONObject(text);
            status = state(data.getJSONObject("data").getJSONObject("attributes").getString("aggregate_state"));
            JSONArray included = data.getJSONArray("included");
            for (int n=0; n<included.length(); n++) {
                JSONObject i=included.getJSONObject(n), a=i.getJSONObject("attributes");
                if (i.optString("type").equals("status_page_resource")) {
                    String raw=a.optString("status");
                    String componentState = raw.equals("degraded")?"degraded_performance":(raw.equals("downtime")||raw.equals("unavailable"))?"major_outage":raw.equals("maintenance")?"under_maintenance":raw;
                    components.put(new JSONObject().put("id",i.getString("id")).put("status",componentState));
                }
                if (i.optString("type").equals("status_report") && !a.optString("aggregate_state").equals("resolved")) {
                    try {
                        if (Instant.parse(a.getString("starts_at")).isAfter(Instant.now())) continue;
                    } catch (Exception e) { continue; }
                    incidents.put(new JSONObject().put("id",i.getString("id")).put("name",a.optString("title","Service issue")).put("impact",a.optString("report_type").equals("maintenance")?"maintenance":"minor").put("status",a.optString("aggregate_state")));
                }
            }
        } else {
            JSONObject data = new JSONObject(text);
            status = state(data.getJSONObject("status").getString("indicator"));
            JSONArray raw = data.optJSONArray("components");
            if (raw != null) for (int n=0;n<raw.length();n++) if (!raw.getJSONObject(n).optBoolean("group")) components.put(raw.getJSONObject(n));
            raw = data.optJSONArray("incidents");
            if (raw != null) for (int n=0;n<raw.length();n++) {
                JSONObject i=raw.getJSONObject(n);
                if (!Arrays.asList("resolved","postmortem","completed","scheduled").contains(i.optString("status"))) incidents.put(i);
            }
        }
        return result.put("status",status).put("checkedAt",Instant.now().toString()).put("components",components).put("incidents",incidents);
    }
    static String signature(JSONObject reading) {
        if (reading.optBoolean("stale") || reading.optString("status","unknown").equals("unknown") || reading.optString("checkedAt").isEmpty()) return null;
        List<String> parts=new ArrayList<>();
        String status=reading.optString("status");
        if (Arrays.asList("degraded","outage","maintenance").contains(status)) parts.add("status:"+status);
        JSONArray cs=reading.optJSONArray("components"), is=reading.optJSONArray("incidents");
        if(cs!=null) for(int n=0;n<cs.length();n++) { JSONObject c=cs.optJSONObject(n); if(c!=null && Arrays.asList("degraded_performance","partial_outage","major_outage","under_maintenance").contains(c.optString("status"))) parts.add("component:"+c.optString("id")+":"+c.optString("status")); }
        if(is!=null) for(int n=0;n<is.length();n++) { JSONObject i=is.optJSONObject(n); if(i!=null && !Arrays.asList("resolved","postmortem","completed","scheduled").contains(i.optString("status"))) parts.add("incident:"+i.optString("id")+":"+i.optString("impact","minor")); }
        Collections.sort(parts); return String.join("|",parts);
    }
    static boolean shouldNotify(String previous, String next) {
        if(next==null || next.isEmpty()) return false;
        Set<String> old=new HashSet<>(Arrays.asList(previous.split("\\|")));
        for(String part:next.split("\\|")) if(!old.contains(part)) return true;
        return false;
    }
    static int severity(JSONObject reading) {
        String signature=signature(reading);
        if(signature==null) return 1;
        int rank=signature.isEmpty()?0:2;
        for(String part:signature.split("\\|")) {
            String value=part.substring(part.lastIndexOf(':')+1);
            if(Arrays.asList("outage","major_outage","major","critical").contains(value)) return 4;
            if(Arrays.asList("degraded","degraded_performance","partial_outage","minor").contains(value)) rank=3;
        }
        return rank;
    }
}
