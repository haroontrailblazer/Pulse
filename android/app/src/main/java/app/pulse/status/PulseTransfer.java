package app.pulse.status;

import android.content.Intent;
import android.net.Uri;
import java.util.Locale;

/**
 * Reading a watchlist transfer code out of a pulse://transfer?c=... intent.
 *
 * Scanning the square Pulse draws on another device lands here. A private scheme
 * rather than an https link, because an https link would carry the reader's whole
 * watchlist in a request line to a server that has no business seeing it; this is
 * resolved entirely on the phone.
 *
 * Anything can send this app an intent, so nothing here is trusted. What comes
 * back is handed to the web layer, which puts it in the paste field and applies
 * nothing until the reader agrees -- and refuses it anyway if the seal does not
 * match. The checks below only avoid waking the panel for something that is
 * obviously not a code.
 *
 * The parsing works on the URL as text, and that is deliberate on two counts.
 * Uri.getQueryParameter percent-decodes, and the names inside a code are
 * percent-encoded on purpose, so decoding here would corrupt any code carrying a
 * name with a space in it and break its own checksum. And android.net.Uri is a
 * stub in JVM unit tests -- every method throws -- so a Uri-based parser cannot be
 * tested without an emulator, which is how this arrived at strings after the first
 * version of PulseTransferTest failed on all seven cases.
 */
final class PulseTransfer {
    static final String PREFIX = "pulse://transfer?";
    /**
     * Comfortably past the longest code this product can produce -- the whole
     * catalogue plus a dozen added pages -- and far short of anything worth handing
     * to a renderer.
     */
    static final int MAX_LENGTH = 4000;

    private PulseTransfer() {}

    /** The code a VIEW intent carries, or null if it carries nothing worth reading. */
    static String code(Intent intent) {
        if (intent == null) return null;
        if (!Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri data = intent.getData();
        // toString gives back the encoded form, which is the one the checksum covers.
        return data == null ? null : codeFrom(data.toString());
    }

    /** The code in a pulse://transfer link, or null. */
    static String codeFrom(String url) {
        if (url == null) return null;
        if (!url.toLowerCase(Locale.ROOT).startsWith(PREFIX)) return null;
        String query = url.substring(url.indexOf('?') + 1);
        for (String pair : query.split("&")) {
            if (!pair.startsWith("c=")) continue;
            String code = pair.substring(2).trim();
            if (code.isEmpty() || code.length() > MAX_LENGTH) return null;
            // Not validation, just a filter: a code the web layer would refuse
            // anyway should not open a panel in front of the reader.
            if (!code.startsWith("PULSE")) return null;
            return code;
        }
        return null;
    }
}
