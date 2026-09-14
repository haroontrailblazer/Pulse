package app.pulse.status;
import org.junit.Test;
import static org.junit.Assert.*;
public class PulseIconStyleTest {
    @Test public void eachWidgetInstanceGetsItsOwnKey() {
        assertEquals("iconBackground.42",PulseIconStyle.key(42));
        assertNotEquals(PulseIconStyle.key(42),PulseIconStyle.key(43));
        assertTrue(PulseIconStyle.owns(PulseIconStyle.key(7)));
        assertFalse(PulseIconStyle.owns("reading.openai"));
        assertFalse(PulseIconStyle.owns("watchlist"));
        assertFalse(PulseIconStyle.owns(null));
    }
    @Test public void transparentIsTheDefaultForAnythingUnrecognised() {
        assertEquals(PulseIconStyle.TRANSPARENT,PulseIconStyle.normalize(null));
        assertEquals(PulseIconStyle.TRANSPARENT,PulseIconStyle.normalize(""));
        assertEquals(PulseIconStyle.TRANSPARENT,PulseIconStyle.normalize("glass"));
        assertEquals(PulseIconStyle.TRANSPARENT,PulseIconStyle.normalize("CARD"));
        assertEquals(PulseIconStyle.TRANSPARENT,PulseIconStyle.normalize(PulseIconStyle.TRANSPARENT));
    }
    @Test public void onlyTheCardChoicePaintsABackground() {
        assertTrue(PulseIconStyle.solid(PulseIconStyle.CARD));
        assertFalse(PulseIconStyle.solid(PulseIconStyle.TRANSPARENT));
        assertFalse(PulseIconStyle.solid(null));
        assertFalse(PulseIconStyle.solid("anything else"));
    }
    @Test public void togglingAlwaysLandsOnTheOppositeChoice() {
        assertEquals(PulseIconStyle.CARD,PulseIconStyle.other(PulseIconStyle.TRANSPARENT));
        assertEquals(PulseIconStyle.TRANSPARENT,PulseIconStyle.other(PulseIconStyle.CARD));
        assertEquals(PulseIconStyle.CARD,PulseIconStyle.other(null));
        assertEquals(PulseIconStyle.TRANSPARENT,PulseIconStyle.other(PulseIconStyle.other(PulseIconStyle.TRANSPARENT)));
    }
}
