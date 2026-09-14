package app.pulse.status;
import org.junit.Test;
import static org.junit.Assert.*;
public class PulseTintTest {
    @Test public void severityPicksTheSharedStatusColour() {
        assertEquals(PulseTint.OUTAGE,PulseTint.status(4));
        assertEquals(PulseTint.DEGRADED,PulseTint.status(3));
        assertEquals(PulseTint.DEGRADED,PulseTint.status(2));
        assertEquals(PulseTint.UNKNOWN,PulseTint.status(1));
        assertEquals(PulseTint.OPERATIONAL,PulseTint.status(0));
    }
    @Test public void healthyIconsKeepTheirBrandColourAndFaultsOverrideIt() {
        int docker=0xFF2496ED;
        assertEquals(docker,PulseTint.icon(0,docker));
        assertEquals(PulseTint.DEGRADED,PulseTint.icon(2,docker));
        assertEquals(PulseTint.DEGRADED,PulseTint.icon(3,docker));
        assertEquals(PulseTint.OUTAGE,PulseTint.icon(4,docker));
        assertEquals(PulseTint.UNKNOWN,PulseTint.icon(1,docker));
    }
    /** Vercel, GitHub, Notion, OpenAI, CircleCI, HackerOne, Replicate. */
    static final int[] NEAR_BLACK_BRANDS={0xFF18191A,0xFF24292F,0xFF272A2C,0xFF222C29,0xFF343434,0xFF494649,0xFF45494E};
    @Test public void nearBlackBrandMarksBecomeTheWidgetInkRatherThanMuddyGrey() {
        for(int brand:NEAR_BLACK_BRANDS) {
            assertTrue("brand unreadable before lift",PulseTint.contrast(brand,PulseTint.SURFACE)<PulseTint.MIN_CONTRAST);
            assertEquals(PulseTint.FOREGROUND,PulseTint.readable(brand));
        }
        assertTrue(PulseTint.contrast(PulseTint.FOREGROUND,PulseTint.SURFACE)>=PulseTint.MIN_CONTRAST);
    }
    @Test public void saturationSeparatesTheNearBlackMarksFromEveryOtherBrand() {
        for(int brand:NEAR_BLACK_BRANDS) assertTrue(PulseTint.saturation(brand)<PulseTint.ACHROMATIC);
        // Sentry #7553a5 is the least saturated brand that keeps its own colour.
        for(int brand:new int[]{0xFF7553A5,0xFFC77E61,0xFF655BD4,0xFFCB3837,0xFF2496ED})
            assertTrue(PulseTint.saturation(brand)>PulseTint.ACHROMATIC);
        assertEquals(0.0,PulseTint.saturation(0xFF000000),0.0001);
    }
    @Test public void aDarkButColourfulMarkKeepsItsHueAndIsLiftedToTheFloor() {
        int darkRed=0xFF2A0705;
        assertTrue(PulseTint.saturation(darkRed)>PulseTint.ACHROMATIC);
        int lifted=PulseTint.readable(darkRed);
        assertNotEquals(PulseTint.FOREGROUND,lifted);
        assertTrue(PulseTint.contrast(lifted,PulseTint.SURFACE)>=PulseTint.MIN_CONTRAST);
        assertTrue("hue was lost",((lifted>>16)&0xFF)>(lifted&0xFF));
    }
    @Test public void readableBrandColoursAreLeftAlone() {
        // Sentry #7553a5 clears the floor by 0.048 and is the first colour a
        // surface or threshold change would push into the lifted set.
        for(int brand:new int[]{0xFFCB3837,0xFF2496ED,0xFFFF6C37,0xFF36A576,0xFF7553A5}) {
            assertEquals(0xFF000000|brand,PulseTint.readable(brand));
        }
        assertEquals(0xFFCB3837,PulseTint.readable(0x00CB3837));
    }
    @Test public void liftMovesTowardWhiteWithoutOvershooting() {
        assertEquals(0xFF808080,PulseTint.blend(0xFF000000,0xFFFFFFFF,0.5));
        assertEquals(0xFF000000,PulseTint.blend(0xFF000000,0xFFFFFFFF,-1));
        assertEquals(0xFFFFFFFF,PulseTint.blend(0xFF000000,0xFFFFFFFF,2));
        assertEquals(0xFFFFFFFF,PulseTint.readable(0xFF000000,0xFF000000,21.0));
    }
    @Test public void contrastMatchesKnownWcagPairs() {
        assertEquals(21.0,PulseTint.contrast(0xFF000000,0xFFFFFFFF),0.001);
        assertEquals(1.0,PulseTint.contrast(0xFF161616,0xFF161616),0.001);
    }
    @Test public void catalogColoursParseAndBadValuesFallBack() {
        assertEquals(0xFFCB3837,PulseTint.parse("#cb3837",PulseTint.FOREGROUND));
        assertEquals(0xFFCB3837,PulseTint.parse("cb3837",PulseTint.FOREGROUND));
        assertEquals(PulseTint.FOREGROUND,PulseTint.parse(null,PulseTint.FOREGROUND));
        assertEquals(PulseTint.FOREGROUND,PulseTint.parse("#fff",PulseTint.FOREGROUND));
        assertEquals(PulseTint.FOREGROUND,PulseTint.parse("#zzzzzz",PulseTint.FOREGROUND));
    }
}
