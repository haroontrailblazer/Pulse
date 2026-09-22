package app.pulse.status;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Shared by the widget worker and foreground bridge; only catalog URLs are accepted. */
final class OfficialFeed {
    static String decode(byte[] bytes) {
        if (bytes.length >= 2 && (bytes[0] & 255) == 254 && (bytes[1] & 255) == 255)
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE);
        if (bytes.length >= 2 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 254)
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
        return new String(bytes, StandardCharsets.UTF_8).replaceFirst("^\uFEFF", "");
    }
    static String read(JSONObject provider) throws Exception {
        return read(provider.getString("url"),
            provider.optString("format").equals("azure-rss") ? "application/xml, text/xml" : "application/json",
            15000, 7500);
    }
    /**
     * The same reader on a caller's budget. PulseProbe fetches a 262-byte
     * indicator document on a twenty-second cadence, and the fifteen seconds a
     * full feed is allowed would let one stalled host swallow a whole tick.
     */
    static String read(String url, String accept, long budgetMs, long attemptMs) throws Exception {
        Exception failure = null;
        long deadline = System.currentTimeMillis() + budgetMs;
        for (int attempt = 0; attempt < 2; attempt++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                int timeout = (int) Math.max(1, Math.min(attemptMs, deadline - System.currentTimeMillis()));
                connection.setConnectTimeout(timeout); connection.setReadTimeout(timeout);
                connection.setRequestProperty("Accept", accept);
                connection.setRequestProperty("User-Agent", "PulseStatus/1.0");
                int code = connection.getResponseCode();
                if (code != 200) {
                    if (code < 500) throw new IllegalArgumentException("Official feed returned HTTP " + code);
                    throw new IOException("Official feed returned HTTP " + code);
                }
                try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] chunk = new byte[8192]; int length;
                    while ((length = in.read(chunk)) != -1) {
                        if (System.currentTimeMillis() > deadline) throw new IOException("Official feed timed out");
                        if (out.size() + length > 5 * 1024 * 1024) throw new IOException("Official feed too large");
                        out.write(chunk, 0, length);
                    }
                    return decode(out.toByteArray());
                }
            } catch (IOException error) { failure = error; }
            finally { if (connection != null) connection.disconnect(); }
            if (System.currentTimeMillis() >= deadline) break;
        }
        throw failure;
    }
}
