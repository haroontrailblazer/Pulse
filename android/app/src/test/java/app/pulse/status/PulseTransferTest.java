package app.pulse.status;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * Any app can send Pulse an intent, so these are the cases that arrive when
 * something other than a Pulse square is on the other end.
 *
 * Strings rather than Uri: android.net.Uri is a stub in a JVM unit test and every
 * method on it throws, which is what the first version of this file discovered.
 */
public class PulseTransferTest {
    private static final String CODE = "PULSE1;openai,anthropic;;abc123";

    @Test public void readsTheCodeFromItsOwnScheme() {
        assertEquals(CODE, PulseTransfer.codeFrom("pulse://transfer?c=" + CODE));
    }

    @Test public void acceptsAnUpperCasedScheme() {
        // Some readers upper-case a scheme when they hand it on.
        assertEquals(CODE, PulseTransfer.codeFrom("PULSE://TRANSFER?c=" + CODE));
    }

    @Test public void keepsPercentEncodingIntact() {
        // The names inside a code are percent-encoded, and the checksum covers them.
        // Decoding here would turn %20 into a space and break the seal, so the code
        // has to come back exactly as it went in.
        String withName = "PULSE1;openai;https://status.example.com$Acme%20Inc;abc123";
        assertEquals(withName, PulseTransfer.codeFrom("pulse://transfer?c=" + withName));
    }

    @Test public void ignoresAnotherAppsLink() {
        assertNull(PulseTransfer.codeFrom("https://transfer?c=" + CODE));
        assertNull(PulseTransfer.codeFrom("pulse://settings?c=" + CODE));
        assertNull(PulseTransfer.codeFrom("pulsex://transfer?c=" + CODE));
    }

    @Test public void ignoresSomethingThatIsNotACode() {
        assertNull(PulseTransfer.codeFrom("pulse://transfer?c=hello"));
        assertNull(PulseTransfer.codeFrom("pulse://transfer?c="));
        assertNull(PulseTransfer.codeFrom("pulse://transfer?x=1"));
        assertNull(PulseTransfer.codeFrom("pulse://transfer"));
        assertNull(PulseTransfer.codeFrom(null));
    }

    @Test public void ignoresSomethingAbsurdlyLong() {
        StringBuilder huge = new StringBuilder("PULSE1;");
        while (huge.length() <= PulseTransfer.MAX_LENGTH) huge.append("openai,");
        assertNull(PulseTransfer.codeFrom("pulse://transfer?c=" + huge));
    }

    @Test public void findsTheParameterBesideOthers() {
        assertEquals(CODE, PulseTransfer.codeFrom("pulse://transfer?x=1&c=" + CODE));
    }
}
