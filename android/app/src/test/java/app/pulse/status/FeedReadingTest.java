package app.pulse.status;
import org.junit.Test;
import org.json.*;
import static org.junit.Assert.*;
public class FeedReadingTest {
    JSONObject provider(String format) throws Exception { return new JSONObject().put("id","test").put("name","Test").put("format",format); }
    @Test public void statuspageAndDedup() throws Exception {
        JSONObject reading=FeedReading.parse(provider("statuspage"),"{\"status\":{\"indicator\":\"major\"},\"components\":[],\"incidents\":[]}");
        assertEquals("outage",reading.getString("status"));
        String signature=FeedReading.signature(reading);
        assertTrue(FeedReading.shouldNotify("",signature));assertFalse(FeedReading.shouldNotify(signature,signature));
        reading.put("stale",true);assertNull(FeedReading.signature(reading));assertFalse(FeedReading.shouldNotify(signature,null));
    }
    @Test public void componentAndIncidentSignals() throws Exception {
        JSONObject reading=FeedReading.parse(provider("statuspage"),"{\"status\":{\"indicator\":\"none\"},\"components\":[{\"id\":\"api\",\"status\":\"partial_outage\"}],\"incidents\":[{\"id\":\"old\",\"status\":\"resolved\",\"impact\":\"major\"}]}");
        assertEquals("component:api:partial_outage",FeedReading.signature(reading));
        assertEquals(3,FeedReading.severity(reading));
        reading.getJSONArray("components").getJSONObject(0).put("id","major-api");
        assertEquals(3,FeedReading.severity(reading));
        reading.getJSONArray("components").getJSONObject(0).put("id","api");
        assertFalse(FeedReading.shouldNotify("component:api:partial_outage|incident:x:major",FeedReading.signature(reading)));
    }
    @Test public void malformedFeedsNeverHealthy() throws Exception {
        for(String input:new String[]{"{}","<html>Error</html>","{\"status\":{\"indicator\":\"unexpected\"}}"}) {
            try { FeedReading.parse(provider("statuspage"),input);fail("Invalid response accepted"); }catch(JSONException expected){}
        }
    }
    @Test public void googleHistoryAndActive() throws Exception {
        assertEquals("operational",FeedReading.parse(provider("google"),"[]").getString("status"));
        JSONObject active=FeedReading.parse(provider("google"),"[{\"id\":\"i\",\"begin\":\"2026-09-13T00:00:00Z\",\"end\":null,\"updates\":[],\"severity\":\"high\"}]");
        assertEquals("degraded",active.getString("status"));assertTrue(FeedReading.signature(active).contains("incident:i:major"));
        assertEquals(4,FeedReading.severity(active));
    }
    @Test public void betterStack() throws Exception {
        JSONObject reading=FeedReading.parse(provider("betterstack"),"{\"data\":{\"attributes\":{\"aggregate_state\":\"downtime\"}},\"included\":[]}");
        assertEquals("outage",reading.getString("status"));
    }
}
