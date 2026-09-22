package app.pulse.status;
import org.junit.Test;
import org.json.*;
import static org.junit.Assert.*;

/**
 * The fast tier stands or falls on three things: that it only ever derives a
 * probe URL it is entitled to derive, that it reads the indicator out of the
 * small document correctly, and that it treats a first sighting as a seed
 * rather than as news.
 */
public class PulseProbeTest {
    static final String SUMMARY="https://www.githubstatus.com/api/v2/summary.json";
    static final String STATUS="https://www.githubstatus.com/api/v2/status.json";
    static String body(String indicator) {
        return "{\"page\":{\"id\":\"kctbh9vrtdwd\",\"name\":\"GitHub\",\"updated_at\":\"2026-09-22T02:25:18.586Z\"},"
            +"\"status\":{\"indicator\":\""+indicator+"\",\"description\":\"All Systems Operational\"}}";
    }

    @Test public void statuspageFeedsAreProbedThroughTheirSmallSiblingDocument() {
        assertEquals(PulseProbe.INDICATOR,PulseProbe.tier("statuspage",SUMMARY));
        assertEquals(STATUS,PulseProbe.indicatorUrl(SUMMARY));
    }

    @Test public void aProbeUrlIsNeverInventedForAFeedThatPublishesNoSuchDocument() {
        // Only the documented sibling of a Statuspage v2 summary is derivable.
        // Anything else has to keep the URL the catalog vouched for, or the fast
        // tier would be reaching for addresses nobody published.
        assertNull(PulseProbe.indicatorUrl("https://health.aws.amazon.com/public/currentevents"));
        assertNull(PulseProbe.indicatorUrl("https://status.cloud.google.com/incidents.json"));
        assertNull(PulseProbe.indicatorUrl("https://status.huggingface.co/index.json"));
        assertNull(PulseProbe.indicatorUrl("https://railway.instatus.com/v2/components.json"));
        assertNull(PulseProbe.indicatorUrl("https://azure.status.microsoft/en-us/status/feed/"));
        assertNull(PulseProbe.indicatorUrl("https://evil.example/api/v2/summary.json.txt"));
        assertNull(PulseProbe.indicatorUrl("http://www.githubstatus.com/api/v2/summary.json"));
        assertNull(PulseProbe.indicatorUrl(""));
    }

    @Test public void aComponentFeedIsNotProbedBecauseThePageIndicatorIsNotItsSubject() {
        // Replicate is read out of Cloudflare's summary for one component id.
        // Cloudflare's page indicator says nothing about that component, so a
        // cheap probe of it would be a confident wrong answer.
        assertEquals(PulseProbe.SLOW,PulseProbe.tier("component","https://www.cloudflarestatus.com/api/v2/summary.json"));
    }

    @Test public void smallWholeFeedsAreReadDirectlyAndLargeOnesAreLeftToTheFullSweep() {
        assertEquals(PulseProbe.DIRECT,PulseProbe.tier("azure-rss","https://azure.status.microsoft/en-us/status/feed/"));
        assertEquals(PulseProbe.DIRECT,PulseProbe.tier("instatus","https://railway.instatus.com/v2/components.json"));
        assertEquals(PulseProbe.SLOW,PulseProbe.tier("aws","https://health.aws.amazon.com/public/currentevents"));
        assertEquals(PulseProbe.SLOW,PulseProbe.tier("google","https://status.cloud.google.com/incidents.json"));
        assertEquals(PulseProbe.SLOW,PulseProbe.tier("betterstack","https://status.huggingface.co/index.json"));
        assertEquals(PulseProbe.SLOW,PulseProbe.tier("newformat","https://example.com/api/v2/summary.json"));
    }

    @Test public void everyCatalogIndicatorIsAccepted() throws Exception {
        for(String indicator:new String[]{"none","minor","major","critical","maintenance"})
            assertEquals(indicator,PulseProbe.indicator(body(indicator)));
    }

    @Test public void anIndicatorTheProductCannotInterpretIsRefusedRatherThanStored() {
        for(String body:new String[]{body("sideways"),"{\"status\":{}}","{}","not json",""}) {
            try { PulseProbe.indicator(body);fail("accepted "+body); }
            catch(JSONException expected) {}
        }
    }

    @Test public void aFirstSightingSeedsAndDoesNotCountAsAChange() {
        assertFalse(PulseProbe.changed("","none"));
        assertFalse(PulseProbe.changed("","major"));
        assertFalse(PulseProbe.changed(null,"minor"));
    }

    @Test public void anyMoveOffTheStoredIndicatorEarnsAFullRead() {
        assertTrue(PulseProbe.changed("none","minor"));
        assertTrue(PulseProbe.changed("minor","major"));
        assertTrue(PulseProbe.changed("major","minor"));
        assertTrue(PulseProbe.changed("minor","none"));
        assertTrue(PulseProbe.changed("none","maintenance"));
    }

    @Test public void asteadyIndicatorCostsNothingFurther() {
        assertFalse(PulseProbe.changed("none","none"));
        assertFalse(PulseProbe.changed("major","major"));
        assertFalse(PulseProbe.changed("minor",""));
        assertFalse(PulseProbe.changed("minor",null));
    }

    /**
     * The fast tier exists to make detection cheap, so the classification has to
     * keep the shipped catalog cheap. Reads the real asset rather than a fixture:
     * a provider added with a format the fast tier does not know would otherwise
     * fall silently to the five-minute cadence.
     */
    @Test public void theShippedCatalogIsAlmostEntirelyProbeable() throws Exception {
        JSONArray catalog=new JSONArray(new String(java.nio.file.Files.readAllBytes(
            java.nio.file.Paths.get("src/main/assets/pulse-catalog.json")),"UTF-8"));
        int indicator=0,direct=0,slow=0;
        for(int n=0;n<catalog.length();n++) {
            JSONObject provider=catalog.getJSONObject(n);
            switch(PulseProbe.tier(provider.optString("format"),provider.optString("url"))) {
                case PulseProbe.INDICATOR: indicator++;assertNotNull(PulseProbe.indicatorUrl(provider.getString("url")));break;
                case PulseProbe.DIRECT: direct++;break;
                default: slow++;
            }
        }
        assertEquals(catalog.length(),indicator+direct+slow);
        assertTrue("only "+(indicator+direct)+" of "+catalog.length()+" providers reach the fast tier",
            indicator+direct>=catalog.length()*9/10);
    }
}
