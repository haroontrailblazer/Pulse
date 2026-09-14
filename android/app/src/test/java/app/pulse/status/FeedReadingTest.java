package app.pulse.status;
import org.junit.Test;
import org.json.*;
import static org.junit.Assert.*;
public class FeedReadingTest {
    @Test public void awsEncodingAndActiveEvents() throws Exception {
        String json="[{\"arn\":\"event\",\"service\":\"ec2\",\"service_name\":\"EC2\",\"status\":\"3\",\"summary\":\"Errors\",\"event_log\":[]}]";
        byte[] bytes=("\uFEFF"+json).getBytes(java.nio.charset.StandardCharsets.UTF_16BE);
        assertEquals(json,OfficialFeed.decode(bytes));
        assertEquals("outage",FeedReading.parse(provider("aws"),OfficialFeed.decode(bytes)).getString("status"));
        assertEquals("operational",FeedReading.parse(provider("aws"),json.replace("\"3\"","\"0\"")).getString("status"));
        try { FeedReading.parse(provider("aws"),json.replace("\"3\"","\"8\""));fail("Unknown AWS state accepted"); }catch(JSONException expected){}
    }
    @Test public void azureRssAndInvalidResponses() throws Exception {
        String prefix="<rss><channel><title>Azure Status</title><link>https://azure.status.microsoft/en-us/status/</link>";
        String item="<item><guid>azure-event</guid><title>Storage errors</title><pubDate>Sun, 13 Sep 2026 10:00:00 GMT</pubDate></item>";
        assertEquals("operational",FeedReading.parse(provider("azure-rss"),prefix+"</channel></rss>").getString("status"));
        assertEquals("degraded",FeedReading.parse(provider("azure-rss"),prefix+item+"</channel></rss>").getString("status"));
        assertEquals("operational",FeedReading.parse(provider("azure-rss"),prefix+item.replace("Storage errors","Resolved - Storage errors")+"</channel></rss>").getString("status"));
        for(String invalid:new String[]{"<html>Unavailable</html>","<rss><channel>","<!DOCTYPE rss>"+prefix+"</channel></rss>"}) {
            try { FeedReading.parse(provider("azure-rss"),invalid);fail("Invalid XML accepted"); }catch(JSONException expected){}
        }
    }
    @Test public void replicateIgnoresUnrelatedCloudflareFailures() throws Exception {
        JSONObject p=provider("component").put("componentId","replicate");
        String json="{\"status\":{\"indicator\":\"major\"},\"components\":[{\"id\":\"replicate\",\"status\":\"operational\"}],\"incidents\":[{\"id\":\"unrelated\",\"status\":\"investigating\",\"components\":[{\"id\":\"workers\"}]}]}";
        JSONObject result=FeedReading.parse(p,json);
        assertEquals("operational",result.getString("status"));assertEquals(0,result.getJSONArray("incidents").length());
        assertEquals("outage",FeedReading.parse(p,json.replace("operational","major_outage")).getString("status"));
        try { FeedReading.parse(p,json.replace("replicate","missing"));fail("Missing component accepted"); }catch(JSONException expected){}
    }
    @Test public void anAllClearIsAnnouncedOnlyAfterSomethingWasWrong() throws Exception {
        String issue="status:degraded";
        // The transition that matters: something was reported, now nothing is.
        assertTrue(FeedReading.resolved(issue,""));
        // Nothing was wrong, so there is nothing to resolve.
        assertFalse(FeedReading.resolved("",""));
        assertFalse(FeedReading.resolved(null,""));
        // Still reporting something, even if different or less severe.
        assertFalse(FeedReading.resolved(issue,"status:outage"));
        assertFalse(FeedReading.resolved("status:outage","status:degraded"));
        // An unreachable feed has a null signature and must stay silent, or a
        // network blip would read as good news.
        assertFalse(FeedReading.resolved(issue,null));
        // Resolution and a new issue are mutually exclusive for the same pair.
        assertFalse(FeedReading.shouldNotify(issue,"")&&FeedReading.resolved(issue,""));
    }
    @Test public void aRealRecoveryRoundTripFiresExactlyOnce() throws Exception {
        JSONObject healthy=FeedReading.parse(provider("statuspage"),"{\"status\":{\"indicator\":\"none\"},\"components\":[],\"incidents\":[]}");
        JSONObject broken=FeedReading.parse(provider("statuspage"),"{\"status\":{\"indicator\":\"major\"},\"components\":[],\"incidents\":[]}");
        String clear=FeedReading.signature(healthy), down=FeedReading.signature(broken);
        assertEquals("",clear);
        assertFalse(down.isEmpty());
        // healthy -> broken notifies as an issue, not a recovery
        assertTrue(FeedReading.shouldNotify(clear,down));
        assertFalse(FeedReading.resolved(clear,down));
        // broken -> healthy notifies as a recovery, not an issue
        assertFalse(FeedReading.shouldNotify(down,clear));
        assertTrue(FeedReading.resolved(down,clear));
        // and staying healthy says nothing at all
        assertFalse(FeedReading.shouldNotify(clear,clear));
        assertFalse(FeedReading.resolved(clear,clear));
    }
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
        assertEquals(3,FeedReading.severity(active));
    }
    @Test public void currentStatusOutranksOlderIncidentImpact() throws Exception {
        JSONObject reading=FeedReading.parse(provider("statuspage"),"{\"status\":{\"indicator\":\"minor\"},\"components\":[{\"id\":\"cowork\",\"name\":\"Claude Cowork\",\"status\":\"degraded_performance\"}],\"incidents\":[{\"id\":\"incident\",\"status\":\"identified\",\"impact\":\"major\"}]}");
        assertEquals("degraded",reading.getString("status"));
        assertEquals(3,FeedReading.severity(reading));
    }
    @Test public void betterStack() throws Exception {
        JSONObject reading=FeedReading.parse(provider("betterstack"),"{\"data\":{\"attributes\":{\"aggregate_state\":\"downtime\"}},\"included\":[]}");
        assertEquals("outage",reading.getString("status"));
    }
}
