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
        if (format.equals("azure-rss")) {
            status = "operational";
            try {
                if (text.toUpperCase(Locale.ROOT).contains("<!DOCTYPE") || text.toUpperCase(Locale.ROOT).contains("<!ENTITY")) throw new Exception("Unsafe XML");
                javax.xml.parsers.DocumentBuilderFactory factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
                factory.setExpandEntityReferences(false);
                org.w3c.dom.Document doc = factory.newDocumentBuilder().parse(new org.xml.sax.InputSource(new java.io.StringReader(text)));
                org.w3c.dom.Element channel = (org.w3c.dom.Element) doc.getElementsByTagName("channel").item(0);
                if (!doc.getDocumentElement().getTagName().equals("rss") || channel == null || !xmlText(channel,"title").equals("Azure Status") || !xmlText(channel,"link").startsWith("https://azure.status.microsoft/")) throw new Exception("Unknown RSS");
                org.w3c.dom.NodeList items = channel.getElementsByTagName("item");
                for (int n=0; n<items.getLength(); n++) {
                    org.w3c.dom.Element item = (org.w3c.dom.Element) items.item(n);
                    String title=xmlText(item,"title"), id=xmlText(item,"guid");
                    if (id.isEmpty()) id=xmlText(item,"link");
                    if(title.isEmpty() || id.isEmpty()) throw new Exception("Invalid Azure incident");
                    java.time.ZonedDateTime.parse(xmlText(item,"pubDate"), java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME);
                    if(title.matches("(?i)^(?:\\[?(?:resolved|mitigated|completed)\\]?\\s*[-:–]|(?:final\\s+)?(?:pir|post[- ]incident review|root cause analysis)\\b).*$")) continue;
                    status="degraded";
                    incidents.put(new JSONObject().put("id",id).put("name",title).put("impact","minor").put("status","active"));
                }
            } catch(Exception error) { throw new JSONException("Invalid Azure RSS feed: " + error.getMessage()); }
        } else if (format.equals("aws")) {
            status="operational";
            JSONArray events=new JSONArray(text);
            for(int n=0; n<events.length(); n++) {
                JSONObject event=events.getJSONObject(n);
                String code=event.getString("status"), id=event.getString("arn"), service=event.getString("service"), name=event.getString("service_name");
                event.getJSONArray("event_log"); event.getString("summary");
                if(!Arrays.asList("0","1","2","3").contains(code)) throw new JSONException("Unknown AWS status");
                if(code.equals("0")) continue;
                if(code.equals("3")) status="outage"; else if(!status.equals("outage")) status="degraded";
                components.put(new JSONObject().put("id",service).put("name",name).put("status",code.equals("3")?"major_outage":"degraded_performance"));
                incidents.put(new JSONObject().put("id",id).put("name",name + ": " + event.getString("summary")).put("impact",code.equals("3")?"major":"minor").put("status","active"));
            }
        } else if (format.equals("component")) {
            JSONObject data = new JSONObject(text), component=null;
            JSONArray raw=data.getJSONArray("components");
            String target=provider.getString("componentId");
            for(int n=0;n<raw.length();n++) if(raw.getJSONObject(n).getString("id").equals(target) && !raw.getJSONObject(n).optBoolean("group")) component=raw.getJSONObject(n);
            if(component==null) throw new JSONException("Missing Replicate component");
            switch(component.getString("status")) {
                case "operational": status="operational"; break;
                case "degraded_performance": case "partial_outage": status="degraded"; break;
                case "major_outage": status="outage"; break;
                case "under_maintenance": status="maintenance"; break;
                default: throw new JSONException("Unknown component state");
            }
            components.put(component);
            raw=data.optJSONArray("incidents");
            if(raw!=null) for(int n=0;n<raw.length();n++) {
                JSONObject incident=raw.getJSONObject(n);
                if(Arrays.asList("resolved","postmortem","completed","scheduled").contains(incident.optString("status"))) continue;
                JSONArray affected=incident.optJSONArray("components");
                if(affected!=null) for(int j=0;j<affected.length();j++) {
                    Object entry=affected.get(j);
                    if(target.equals(entry instanceof JSONObject ? ((JSONObject)entry).optString("id") : entry.toString())) { incidents.put(incident);break; }
                }
            }
        } else if (format.equals("google")) {
            JSONArray data = new JSONArray(text);
            status = "operational";
            for (int n = 0; n < data.length(); n++) {
                JSONObject i = data.getJSONObject(n);
                i.getString("id"); i.getString("begin"); i.getJSONArray("updates");
                JSONObject latest = i.optJSONObject("most_recent_update");
                if (i.optString("end", "").isEmpty() && (latest == null || !latest.optString("status").equals("AVAILABLE"))) {
                    if(latest != null && latest.optString("status").equals("SERVICE_OUTAGE")) status="outage";
                    else if(!status.equals("outage")) status = "degraded";
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
        } else if (format.equals("instatus")) {
            // Instatus publishes components and nothing else: no page indicator
            // and no incidents document on this feed, so the overall reading is
            // derived from the parts. Mirrors normalizeInstatus in
            // shared/cloud-feeds.js -- the same states, the same worst-wins
            // ordering, the same refusal to read an unknown state as good news.
            JSONArray raw = new JSONObject(text).optJSONArray("components");
            if (raw == null || raw.length() == 0) throw new JSONException("Instatus feed carried no components");
            int worst = 0;
            for (int n=0; n<raw.length(); n++) {
                JSONObject c = raw.getJSONObject(n);
                String componentState;
                switch (c.optString("status")) {
                    case "OPERATIONAL": componentState="operational"; break;
                    case "UNDERMAINTENANCE": componentState="under_maintenance"; break;
                    case "DEGRADEDPERFORMANCE": componentState="degraded_performance"; break;
                    case "PARTIALOUTAGE": componentState="partial_outage"; break;
                    case "MAJOROUTAGE": componentState="major_outage"; break;
                    default: throw new JSONException("Unrecognized Instatus component state");
                }
                int rank = componentState.equals("operational") ? 0
                    : componentState.equals("under_maintenance") ? 1
                    : componentState.equals("degraded_performance") ? 2
                    : componentState.equals("partial_outage") ? 3 : 4;
                if (rank > worst) worst = rank;
                JSONObject group = c.optJSONObject("group");
                String name = group != null && !group.optString("name").isEmpty()
                    ? group.optString("name") + " / " + c.optString("name")
                    : c.optString("name");
                components.put(new JSONObject().put("id", c.optString("id")).put("name", name).put("status", componentState));
            }
            // Only a major outage reads as an outage. Instatus's PARTIALOUTAGE
            // maps to Statuspage's "minor" indicator, which this product has
            // always read as degraded -- and the JS normalizer takes the same
            // route, so the phone and the website cannot disagree about the
            // same feed.
            status = worst == 0 ? "operational" : worst == 1 ? "maintenance" : worst == 4 ? "outage" : "degraded";
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
    private static String xmlText(org.w3c.dom.Element element, String name) {
        org.w3c.dom.Node node=element.getElementsByTagName(name).item(0);
        return node==null?"":node.getTextContent().trim();
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
    /**
     * What is worth interrupting someone for, as opposed to what the signature is
     * worth remembering. Mirrors alertKeys in shared/alerts.js -- the same
     * collapse and the same exclusions, so the phone and the desktop cannot
     * disagree about whether something deserves a notification.
     *
     * Components are collapsed to their worst level rather than kept as
     * identities. Cloudflare publishes a component per datacenter, and their
     * maintenance and partial-outage windows rotate all day, so every rotation
     * introduced an id the stored signature had never seen and read as news.
     * Measured on the shipped Windows build, which carries the same rule: one
     * open Cloudflare incident produced nineteen identical notifications over
     * four hours. A service getting worse is news; a different datacenter
     * reaching the level the service was already at is not.
     *
     * Maintenance is planned, so it is not an issue at all -- not as an aggregate
     * state, not as a component, not as a maintenance incident.
     */
    static Set<String> alertKeys(String signature) {
        Set<String> keys=new HashSet<>();
        if(signature==null) return keys;
        int worst=0;
        for(String part:signature.split("\\|")) {
            if(part.isEmpty()||part.equals("status:maintenance")) continue;
            if(part.startsWith("status:")) keys.add(part);
            else if(part.startsWith("component:")) worst=Math.max(worst,componentRank(part.substring(part.lastIndexOf(':')+1)));
            else if(part.startsWith("incident:")&&!part.endsWith(":maintenance")) keys.add(part);
        }
        if(worst>0) keys.add("component:"+worst);
        return keys;
    }
    private static int componentRank(String state) {
        switch(state) {
            case "degraded_performance": return 1;
            case "partial_outage": return 2;
            case "major_outage": return 3;
            default: return 0;
        }
    }
    /**
     * True when a service that was reporting something has gone fully clear.
     * Deliberately narrow: a feed that merely drops from outage to degraded is
     * still a problem, and an unreachable feed has a null signature, so neither
     * is announced as resolved.
     */
    static boolean resolved(String previous, String next) {
        return next != null && !alertKeys(previous).isEmpty() && alertKeys(next).isEmpty();
    }
    static boolean shouldNotify(String previous, String next) {
        if(next==null) return false;
        Set<String> old=alertKeys(previous);
        for(String key:alertKeys(next)) if(!old.contains(key)) return true;
        return false;
    }
    static int currentSeverity(JSONObject reading) {
        String status=reading.optString("status");
        int rank=status.equals("outage")?4:status.equals("degraded")?3:0;
        JSONArray components=reading.optJSONArray("components");
        if(components!=null) for(int n=0;n<components.length();n++) {
            JSONObject component=components.optJSONObject(n); if(component==null) continue;
            String state=component.optString("status");
            if(state.equals("major_outage")) rank=Math.max(rank,4);
            else if(state.equals("degraded_performance")||state.equals("partial_outage")) rank=Math.max(rank,3);
        }
        return rank;
    }
    static int severity(JSONObject reading) {
        String signature=signature(reading);
        if(signature==null) return 1;
        int current=currentSeverity(reading);
        // An incident impact can remain major after the live provider or its
        // affected component has moved to degraded. Keep the widget current.
        if(current>=3) return current;
        int rank=signature.isEmpty()?0:2;
        for(String part:signature.split("\\|")) {
            String value=part.substring(part.lastIndexOf(':')+1);
            if(Arrays.asList("outage","major_outage","major","critical").contains(value)) return 4;
            if(Arrays.asList("degraded","degraded_performance","partial_outage","minor").contains(value)) rank=3;
        }
        return rank;
    }
}
