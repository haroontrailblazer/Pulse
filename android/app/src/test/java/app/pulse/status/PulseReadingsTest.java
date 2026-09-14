package app.pulse.status;
import org.junit.Test;
import org.json.*;
import java.util.*;
import static org.junit.Assert.*;
public class PulseReadingsTest {
    static final long NOW=java.time.Instant.parse("2026-09-14T12:00:00Z").toEpochMilli();
    JSONArray catalog() throws Exception {
        return new JSONArray()
            .put(new JSONObject().put("id","npm").put("name","npm").put("color","#cb3837"))
            .put(new JSONObject().put("id","openai").put("name","OpenAI").put("color","#222c29"))
            .put(new JSONObject().put("id","docker").put("name","Docker").put("color","#2496ed"))
            .put(new JSONObject().put("id","aws").put("name","AWS").put("color","#b5863d"));
    }
    String reading(String status,String minutesAgo) {
        return "{\"status\":\""+status+"\",\"checkedAt\":\""+java.time.Instant.ofEpochMilli(NOW-Long.parseLong(minutesAgo)*60000)+"\",\"components\":[],\"incidents\":[]}";
    }
    Map<String,String> store=new HashMap<>();
    PulseReadings.Stored stored() { return id->store.containsKey(id)?store.get(id):"{}"; }
    Set<String> watched(String... ids) { return new HashSet<>(Arrays.asList(ids)); }

    @Test public void onlyWatchedServicesAppearAndWorstComesFirst() throws Exception {
        store.put("npm",reading("operational","1"));
        store.put("openai",reading("degraded","1"));
        store.put("docker",reading("outage","1"));
        List<JSONObject> list=PulseReadings.list(catalog(),watched("npm","openai","docker"),stored(),NOW);
        assertEquals(3,list.size());
        assertEquals("docker",list.get(0).getString("id"));
        assertEquals("openai",list.get(1).getString("id"));
        assertEquals("npm",list.get(2).getString("id"));
        assertFalse(PulseReadings.list(catalog(),watched("npm"),stored(),NOW).toString().contains("aws"));
    }
    @Test public void everyWatchedServiceIsReturnedSoALargeWidgetCanShowThemAll() throws Exception {
        JSONArray catalog=new JSONArray();
        Set<String> watchlist=new HashSet<>();
        for(int n=0;n<28;n++) { String id="svc"+n;catalog.put(new JSONObject().put("id",id).put("name",id).put("color","#cb3837"));watchlist.add(id);store.put(id,reading("operational","1")); }
        assertEquals(28,PulseReadings.list(catalog,watchlist,stored(),NOW).size());
    }
    @Test public void tiesKeepCatalogOrder() throws Exception {
        for(String id:new String[]{"npm","openai","docker","aws"}) store.put(id,reading("operational","1"));
        List<JSONObject> list=PulseReadings.list(catalog(),watched("npm","openai","docker","aws"),stored(),NOW);
        assertEquals("npm",list.get(0).getString("id"));
        assertEquals("openai",list.get(1).getString("id"));
        assertEquals("docker",list.get(2).getString("id"));
        assertEquals("aws",list.get(3).getString("id"));
    }
    @Test public void anOldReadingIsReportedUnavailableRatherThanHealthy() throws Exception {
        store.put("npm",reading("operational","45"));
        JSONObject old=PulseReadings.list(catalog(),watched("npm"),stored(),NOW).get(0);
        assertEquals("unknown",old.getString("status"));
        assertTrue(old.getBoolean("stale"));
        assertEquals("Unavailable",PulseReadings.label(old));
        assertTrue(PulseReadings.unavailable(old));
        store.put("npm",reading("operational","25"));
        assertEquals("Operational",PulseReadings.label(PulseReadings.list(catalog(),watched("npm"),stored(),NOW).get(0)));
    }
    @Test public void aServiceWithNoStoredReadingStillListsAsUnavailable() throws Exception {
        List<JSONObject> list=PulseReadings.list(catalog(),watched("npm"),stored(),NOW);
        assertEquals(1,list.size());
        assertEquals("npm",list.get(0).getString("name"));
        assertEquals("Unavailable",PulseReadings.label(list.get(0)));
        assertEquals(0,PulseReadings.checkedAt(list));
    }
    @Test public void theInsightLineCountsIssuesAndUnavailableServices() throws Exception {
        assertEquals("Your stack starts here",PulseReadings.summary(new ArrayList<>()));
        assertEquals("Add services in Pulse to start monitoring",PulseReadings.subtitle(new ArrayList<>()));
        store.put("npm",reading("operational","1"));
        store.put("openai",reading("outage","1"));
        List<JSONObject> list=PulseReadings.list(catalog(),watched("npm","openai","docker"),stored(),NOW);
        assertEquals(1,PulseReadings.issues(list));
        assertEquals(1,PulseReadings.unavailable(list));
        assertEquals("1 watched services reported issues",PulseReadings.summary(list));
        assertEquals("3 watched · 1 unavailable · tap to explore",PulseReadings.subtitle(list));
        store.remove("openai");store.put("openai",reading("operational","1"));store.put("docker",reading("operational","1"));
        assertEquals("Your latest watchlist readings",PulseReadings.summary(PulseReadings.list(catalog(),watched("npm","openai","docker"),stored(),NOW)));
    }
    @Test public void labelsMatchTheStatusTheWidgetsShare() throws Exception {
        store.put("npm",reading("maintenance","1"));
        assertEquals("Maintenance",PulseReadings.label(PulseReadings.list(catalog(),watched("npm"),stored(),NOW).get(0)));
        store.put("npm",reading("degraded","1"));
        assertEquals("Degraded",PulseReadings.label(PulseReadings.list(catalog(),watched("npm"),stored(),NOW).get(0)));
        store.put("npm",reading("outage","1"));
        assertEquals("Major issue",PulseReadings.label(PulseReadings.list(catalog(),watched("npm"),stored(),NOW).get(0)));
    }
    @Test public void checkedAtReportsTheNewestReading() throws Exception {
        store.put("npm",reading("operational","20"));
        store.put("openai",reading("operational","3"));
        assertEquals(NOW-3*60000,PulseReadings.checkedAt(PulseReadings.list(catalog(),watched("npm","openai"),stored(),NOW)));
    }
    @Test public void iconTintUsesTheBrandColourUntilTheFeedReportsAProblem() throws Exception {
        store.put("npm",reading("operational","1"));
        store.put("openai",reading("operational","1"));
        store.put("docker",reading("degraded","1"));
        store.put("aws",reading("outage","1"));
        Map<String,JSONObject> byId=new HashMap<>();
        for(JSONObject r:PulseReadings.list(catalog(),watched("npm","openai","docker","aws"),stored(),NOW)) byId.put(r.getString("id"),r);
        assertEquals(0xFFCB3837,PulseReadings.tint(byId.get("npm")));
        assertEquals(PulseTint.DEGRADED,PulseReadings.tint(byId.get("docker")));
        assertEquals(PulseTint.OUTAGE,PulseReadings.tint(byId.get("aws")));
        // OpenAI's near-black mark is drawn in the widget ink, as its own brand does on dark.
        assertEquals(PulseTint.FOREGROUND,PulseReadings.tint(byId.get("openai")));
        assertEquals(PulseTint.UNKNOWN,PulseReadings.tint(PulseReadings.list(catalog(),watched("npm"),id->"{}",NOW).get(0)));
    }
    @Test public void descriptionsNameTheServiceAndItsState() throws Exception {
        store.put("openai",reading("outage","1"));
        assertEquals("OpenAI, Major issue",PulseReadings.describe(PulseReadings.list(catalog(),watched("openai"),stored(),NOW).get(0)));
    }
    @Test public void anEmptyOrBrokenCatalogNeverThrows() throws Exception {
        assertTrue(PulseReadings.list(null,watched("npm"),stored(),NOW).isEmpty());
        assertTrue(PulseReadings.list(catalog(),null,stored(),NOW).isEmpty());
        assertTrue(PulseReadings.list(catalog(),watched("npm"),id->"not json",NOW).size()==1);
    }
}
