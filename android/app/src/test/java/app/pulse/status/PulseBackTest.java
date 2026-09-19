package app.pulse.status;
import org.junit.Test;
import static org.junit.Assert.*;
public class PulseBackTest {
    @Test public void armedWheneverTheWebLayerHasSomewhereToGo() {
        for(int sdk:new int[]{24,33,34,36})
            assertTrue("a press must reach us while Pulse has history",PulseBack.armed(true,sdk));
    }
    @Test public void staysDisarmedAtTheRootOnlyWhereThatBuysAnAnimation() {
        // Androidx registers the platform callback only while some callback is enabled, so
        // being disabled at the root is the only way the system can preview the launcher.
        assertFalse(PulseBack.armed(false,34));
        assertFalse(PulseBack.armed(false,36));
        // Below 34 there is no preview to protect, and staying armed is the only way to
        // warn before an exit -- which is the complaint this change exists to fix.
        assertTrue(PulseBack.armed(false,24));
        assertTrue(PulseBack.armed(false,33));
    }
    @Test public void leavesWithoutAskingOnlyWhereThePlatformPreviewsIt() {
        assertEquals(PulseBack.LEAVE,PulseBack.leaving(34,10_000L,0L));
        assertEquals(PulseBack.LEAVE,PulseBack.leaving(36,10_000L,0L));
        assertEquals("API 24-33 draws no preview, so an exit has to be announced",PulseBack.CONFIRM,PulseBack.leaving(24,10_000L,0L));
        assertEquals(PulseBack.CONFIRM,PulseBack.leaving(33,10_000L,0L));
    }
    @Test public void aSecondPressInsideTheWindowLeaves() {
        long shown=10_000L;
        assertEquals(PulseBack.LEAVE,PulseBack.leaving(30,shown+1L,shown));
        assertEquals(PulseBack.LEAVE,PulseBack.leaving(30,shown+PulseBack.CONFIRM_MS,shown));
        assertEquals("the window has to lapse, or back becomes a trap",PulseBack.CONFIRM,PulseBack.leaving(30,shown+PulseBack.CONFIRM_MS+1L,shown));
    }
    @Test public void previewsExactlyFromApi34() {
        assertFalse(PulseBack.previews(33));
        assertTrue(PulseBack.previews(34));
    }
}
