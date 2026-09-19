package app.pulse.status;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import org.json.JSONObject;

/**
 * Hands a verified APK to the platform installer.
 *
 * PackageInstaller rather than ACTION_VIEW with a content:// URI. The session API
 * needs no FileProvider grant, no MIME type to resolve against, and no intent
 * filter to exist on the device -- measured on the API 36 emulator, resolving
 * ACTION_VIEW for application/vnd.android.package-archive with no data URI finds
 * nothing at all, so the ACTION_VIEW route depends on the exact URI you happen to
 * build. The session also reports back, which is how the reader is told the
 * install failed rather than being left at a sheet that vanished.
 *
 * The digest is computed AGAIN here, over the bytes actually written into the
 * session, and the commit is inside that same guarded block. PulseDownload
 * verified the file on the way to disk; this verifies the bytes on the way to the
 * installer. Those are different bytes at different times, and the gap between
 * them is the only place something could be swapped.
 */
final class PulseInstaller {
    static final String ACTION_STATUS = "app.pulse.status.INSTALL_STATUS";
    /** 100 PulseStore.open, 101 stack refresh, 102 update notice, 103 alarm, 104 template. */
    private static final int CODE = 105;

    private PulseInstaller() {}

    /** Whether the reader has allowed Pulse to install apps. A Settings toggle, not a dialog. */
    static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT < 26) return true;
        return c.getPackageManager().canRequestPackageInstalls();
    }

    /** The screen that grants it, addressed at this package so it lands on Pulse's own row. */
    static Intent permissionIntent(Context c) {
        return new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            android.net.Uri.parse("package:" + c.getPackageName()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /**
     * Whether the downloaded APK is signed by the same key as the copy already
     * installed. Checked before the sheet rather than after, because the platform
     * failure for a mismatch is INSTALL_FAILED_UPDATE_INCOMPATIBLE, which reaches
     * the reader as a bare "App not installed" with nothing they can act on.
     *
     * API 24-27 have no GET_SIGNING_CERTIFICATES, so there is nothing to compare
     * and the install is allowed to proceed -- the platform still refuses a
     * mismatch, and refusing here instead would make self-update permanently
     * unavailable on the oldest devices Pulse supports.
     */
    static boolean sameSigner(Context c, File apk) {
        if (Build.VERSION.SDK_INT < 28) return true;
        try {
            PackageManager pm = c.getPackageManager();
            android.content.pm.PackageInfo mine =
                pm.getPackageInfo(c.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            android.content.pm.PackageInfo theirs =
                pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
            if (mine == null || theirs == null
                || mine.signingInfo == null || theirs.signingInfo == null) return true;
            Signature[] a = mine.signingInfo.getApkContentsSigners();
            Signature[] b = theirs.signingInfo.getApkContentsSigners();
            if (a == null || b == null || a.length == 0 || b.length == 0) return true;
            for (Signature one : a)
                for (Signature two : b)
                    if (one.equals(two)) return true;
            return false;
        } catch (Throwable error) {
            // Unable to tell is not the same as different; let the platform decide.
            return true;
        }
    }

    /**
     * Stream the verified file into a session and commit it. Returns null on
     * success, or a message for the reader.
     */
    static String install(Context c, JSONObject update, File apk) {
        if (!apk.isFile()) return "The download is no longer there";
        if (!sameSigner(c, apk))
            return "This build was signed with a different key and cannot replace the installed Pulse";
        PackageInstaller installer = c.getPackageManager().getPackageInstaller();
        PackageInstaller.Session session = null;
        int id = -1;
        try {
            PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(c.getPackageName());
            id = installer.createSession(params);
            session = installer.openSession(id);
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            long written = 0;
            try (FileInputStream in = new FileInputStream(apk);
                 OutputStream out = session.openWrite("pulse", 0, apk.length())) {
                byte[] chunk = new byte[64 * 1024];
                int length;
                while ((length = in.read(chunk)) != -1) {
                    out.write(chunk, 0, length);
                    sha.update(chunk, 0, length);
                    written += length;
                }
                session.fsync(out);
            }
            StringBuilder hex = new StringBuilder(64);
            for (byte b : sha.digest())
                hex.append(Character.forDigit((b >> 4) & 0xf, 16)).append(Character.forDigit(b & 0xf, 16));
            // The gate, and it sits between the last byte written and the commit
            // on purpose: nothing is committed that was not just hashed.
            if (written != update.optLong("bytes", -1)
                || !hex.toString().equals(update.optString("sha256", ""))) {
                session.abandon();
                session = null;
                return "The download did not match its checksum";
            }
            Intent status = new Intent(c, PulseInstalled.class).setAction(ACTION_STATUS);
            PendingIntent pending = PendingIntent.getBroadcast(c, CODE, status,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            session.commit(pending.getIntentSender());
            session = null;
            return null;
        } catch (Throwable error) {
            return "Could not start the install";
        } finally {
            if (session != null) {
                try { session.abandon(); } catch (Throwable ignored) {}
                session.close();
            }
        }
    }
}
