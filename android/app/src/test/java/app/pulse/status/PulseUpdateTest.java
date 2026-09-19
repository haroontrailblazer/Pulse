package app.pulse.status;
import org.junit.Test;
import org.json.*;
import java.io.File;
import java.nio.file.Files;
import java.util.Calendar;
import java.util.TimeZone;
import static org.junit.Assert.*;

/**
 * The Java half of the update decisions, proved against the same fixture table
 * tests/updates.test.js reads. npm run build:android runs testDebugUnitTest, so a
 * disagreement between the two implementations fails the build.
 */
public class PulseUpdateTest {
    /** Walk up for the repo's shared/ rather than assuming Gradle's working directory. */
    private static JSONObject cases() throws Exception {
        File at = new File("").getAbsoluteFile();
        for (int n = 0; n < 8 && at != null; n++, at = at.getParentFile()) {
            File fixture = new File(at, "shared/update-cases.json");
            if (fixture.isFile())
                return new JSONObject(new String(Files.readAllBytes(fixture.toPath()), "UTF-8"));
        }
        throw new IllegalStateException("shared/update-cases.json not found from " + new File("").getAbsolutePath());
    }

    @Test public void theFixtureTableIsActuallyPopulated() throws Exception {
        JSONObject table = cases();
        // A renamed or emptied fixture must fail rather than pass by iterating nothing.
        assertTrue("version rows", table.getJSONArray("newer").length() > 10);
        assertTrue("due rows", table.getJSONArray("due").length() > 6);
        assertTrue("manifest rows", table.getJSONArray("manifests").length() > 6);
    }

    @Test public void versionOrderingMatchesTheSharedTable() throws Exception {
        JSONArray rows = cases().getJSONArray("newer");
        for (int n = 0; n < rows.length(); n++) {
            JSONObject row = rows.getJSONObject(n);
            assertEquals(row.getString("candidate") + " vs " + row.getString("running") + ": " + row.getString("why"),
                row.getBoolean("newer"),
                PulseUpdate.newerVersion(row.getString("candidate"), row.getString("running")));
        }
    }

    @Test public void theDailyDecisionMatchesTheSharedTable() throws Exception {
        JSONArray rows = cases().getJSONArray("due");
        for (int n = 0; n < rows.length(); n++) {
            JSONObject row = rows.getJSONObject(n);
            assertEquals(row.getString("why"), row.getBoolean("due"),
                PulseUpdate.dueFrom(row.getString("last"), row.getString("today"), row.getInt("hourNow")));
        }
    }

    @Test public void manifestAcceptanceMatchesTheSharedTable() throws Exception {
        JSONArray rows = cases().getJSONArray("manifests");
        for (int n = 0; n < rows.length(); n++) {
            JSONObject row = rows.getJSONObject(n);
            JSONObject manifest = row.isNull("manifest") ? null : row.getJSONObject("manifest");
            JSONObject got = PulseUpdate.readUpdate(manifest, row.getString("platform"), row.getString("running"));
            assertEquals(row.getString("why"), row.getBoolean("accepted"), got != null);
            if (row.getBoolean("accepted")) {
                assertEquals(manifest.getString("version"), got.getString("version"));
                assertEquals(manifest.getJSONObject("assets").getJSONObject(row.getString("platform")).getString("url"),
                    got.getString("url"));
            }
        }
    }

    @Test public void theNextRunIsTheNextLocalEightAmByTheClock() {
        // Pinned timezone so a build machine cannot change the answer.
        TimeZone previous = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
            assertEquals("07:59 waits for today", 8, hourOf(at(2026, 9, 19, 7, 59)));
            assertEquals("same day", 19, dayOf(at(2026, 9, 19, 7, 59)));
            // Exactly 08:00 has arrived, so the next is tomorrow's; the run itself is
            // triggered by dueFrom, not by this.
            assertEquals(20, dayOf(at(2026, 9, 19, 8, 0)));
            assertEquals(20, dayOf(at(2026, 9, 19, 23, 59)));
            assertEquals("across a month end", 1, dayOf(at(2026, 9, 30, 12, 0)));
            assertEquals("across a year end", 1, dayOf(at(2026, 12, 31, 12, 0)));
            assertEquals("leap day", 29, dayOf(at(2028, 2, 28, 12, 0)));
            // A daylight-saving zone: always ahead, always 08:00, never far out.
            TimeZone.setDefault(TimeZone.getTimeZone("Europe/London"));
            for (int month = 1; month <= 12; month++)
                for (int hour : new int[] { 0, 7, 8, 9, 23 }) {
                    Calendar now = calendar(2026, month, 15, hour, 30);
                    long gap = PulseUpdate.nextRunAt(now) - now.getTimeInMillis();
                    assertTrue(month + "/" + hour + " must be ahead", gap > 0);
                    assertTrue(month + "/" + hour + " gap " + gap, gap <= 25L * 3600_000L);
                    assertEquals(8, hourOf(now));
                }
        } finally { TimeZone.setDefault(previous); }
    }

    @Test public void theLocalDayOrdersAsAString() {
        assertEquals("2026-09-19", PulseUpdate.localDay(calendar(2026, 9, 19, 23, 59)));
        assertEquals("2026-01-01", PulseUpdate.localDay(calendar(2026, 1, 1, 0, 0)));
        assertTrue(PulseUpdate.localDay(calendar(2025, 12, 31, 9, 0))
            .compareTo(PulseUpdate.localDay(calendar(2026, 1, 1, 9, 0))) < 0);
    }

    @Test public void aFractionalByteCountIsRefusedRatherThanCoerced() throws Exception {
        // org.json's optLong would read 1.5 as 1. The JavaScript side rejects it, so
        // this side has to as well, or the two agree only on well-formed input.
        JSONObject manifest = new JSONObject("{\"version\":\"1.0.21\",\"assets\":{\"android\":{"
            + "\"name\":\"Pulse-1.0.21-Android.apk\",\"bytes\":1.5,"
            + "\"sha256\":\"a6b6c69934b86187714bcce9982d5da737ce587f9a462ed276443dcdb8e72ba6\","
            + "\"url\":\"https://pulse-status-zeta.vercel.app/downloads/v1.0.21/Pulse-1.0.21-Android.apk\"}}}");
        assertNull(PulseUpdate.readUpdate(manifest, "android", "1.0.20"));
    }

    private static Calendar calendar(int year, int month, int day, int hour, int minute) {
        Calendar now = Calendar.getInstance();
        now.clear();
        now.set(year, month - 1, day, hour, minute, 0);
        return now;
    }
    private static Calendar at(int year, int month, int day, int hour, int minute) {
        return calendar(year, month, day, hour, minute);
    }
    private static int dayOf(Calendar now) {
        Calendar next = Calendar.getInstance();
        next.setTimeInMillis(PulseUpdate.nextRunAt(now));
        return next.get(Calendar.DAY_OF_MONTH);
    }
    private static int hourOf(Calendar now) {
        Calendar next = Calendar.getInstance();
        next.setTimeInMillis(PulseUpdate.nextRunAt(now));
        return next.get(Calendar.HOUR_OF_DAY);
    }
}
