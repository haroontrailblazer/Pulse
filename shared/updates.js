// Whether a newer Pulse has been published, and when to ask.
//
// Every decision a reader can notice lives here as a pure function, because the
// same decisions have to be made twice: the APK's 08:00 run happens with no
// WebView alive, so Java makes them, and nothing but a shared truth table keeps
// the two implementations honest. shared/update-cases.json is that table;
// tests/updates.test.js and PulseUpdateTest.java both read it, and
// `npm run build:android` runs the JVM tests, so drift is a build failure rather
// than a bug report.
//
// What is deliberately NOT shared: the arithmetic for "when is the next 08:00".
// That is a wall-clock calendar question, and each platform should use its own
// calendar rather than a reimplementation -- Date here, java.util.Calendar
// there. What IS shared is the decision the calendar feeds: given the day a
// check last ran and the reader's local clock now, is a check due? That is the
// part where a subtle disagreement would show up as a notification that arrives
// twice, or never.

// Absolute, and that is load-bearing rather than tidy. A relative URL would
// resolve to https://localhost inside the APK and to 127.0.0.1:47823 inside the
// EXE, and both of those serve the copy of the app that is already installed --
// so the check would compare a build against itself and report "up to date"
// forever. verify-native-builds.mjs proves both packages carry that copy.
export const latestManifestUrl =
  "https://pulse-status-zeta.vercel.app/latest.json";

/** The hour, in the reader's own timezone, that the daily check runs at. */
export const CHECK_HOUR = 8;

/**
 * "1.0.20" -> [1, 0, 20]. Null for anything that is not a plain dotted number,
 * because a version this side cannot order is a version it must not act on.
 */
export function parseVersion(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)*$/.test(trimmed)) return null;
  const parts = trimmed.split(".").map(Number);
  if (parts.length > 4 || parts.some((n) => !Number.isSafeInteger(n) || n < 0))
    return null;
  return parts;
}

/**
 * Strictly newer, never merely different. A reader running a build newer than
 * the published one -- a contributor, or someone who kept a build after a
 * rollback -- must never be told to install an older Pulse.
 */
export function newerVersion(candidate, running) {
  const a = parseVersion(candidate);
  const b = parseVersion(running);
  if (!a || !b) return false;
  for (let n = 0; n < Math.max(a.length, b.length); n += 1) {
    const left = a[n] ?? 0;
    const right = b[n] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

/**
 * The manifest the website publishes, built from the two files the release
 * sequence already keeps aligned. Keyed by platform rather than a list, so that
 * handing the APK a Windows installer is impossible by shape instead of by a
 * correct `find` written twice.
 *
 * Throws rather than guesses: prepare-downloads.mjs calls this after it has
 * verified both installers byte for byte, so anything missing here means the
 * release metadata disagrees with itself and the deployment should stop.
 */
export function latestManifest(release, downloads) {
  const pick = (suffix, url) => {
    const asset = release.assets.find((entry) => entry.name.endsWith(suffix));
    if (!asset) throw new Error(`Release manifest has no ${suffix} asset`);
    if (!url.endsWith(asset.name))
      throw new Error(`Download URL for ${asset.name} does not name that file`);
    return { name: asset.name, bytes: asset.bytes, sha256: asset.sha256, url };
  };
  return {
    version: release.version,
    checksums: downloads.checksums,
    assets: {
      android: pick("-Android.apk", downloads.android),
      windows: pick("-Windows.exe", downloads.windows),
    },
  };
}

/**
 * What a surface should show, read out of a fetched manifest. Returns null for
 * anything it cannot fully trust, because the failure a reader must never see is
 * a download button that leads nowhere.
 */
export function readUpdate(manifest, platform, running) {
  if (!manifest || typeof manifest !== "object") return null;
  if (!newerVersion(manifest.version, running)) return null;
  const asset = manifest.assets && manifest.assets[platform];
  if (!asset || typeof asset !== "object") return null;
  if (typeof asset.url !== "string" || !asset.url.startsWith("https://"))
    return null;
  // The filename has to name the version the manifest claims, or the two halves
  // of the manifest disagree and there is no way to tell which one is wrong.
  if (typeof asset.name !== "string" || !asset.name.includes(manifest.version))
    return null;
  // A size is shown to the reader before they spend mobile data on it, so a
  // value that is not a whole number of bytes is not shown at all.
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) return null;
  if (typeof asset.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(asset.sha256))
    return null;
  return {
    version: manifest.version,
    name: asset.name,
    bytes: asset.bytes,
    sha256: asset.sha256,
    url: asset.url,
    checksums:
      typeof manifest.checksums === "string" ? manifest.checksums : null,
  };
}

/** The reader's local date as YYYY-MM-DD, which is the unit "once a day" means. */
export function localDay(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Is a check due? Due once the local day has changed AND the local clock has
 * reached the hour -- which is what makes this both "every morning at 08:00" and
 * "and if the device was asleep or switched off then, the first moment after".
 *
 * Pure strings and integers on purpose: this is the one decision Java has to
 * mirror, and expressing it in wall-clock terms rather than epoch milliseconds
 * is what lets one fixture table prove both implementations in whatever
 * timezone the build machine happens to be in.
 */
export function dueFrom(lastCheckedDay, today, hourNow, hour = CHECK_HOUR) {
  if (typeof today !== "string" || !today) return false;
  if (!Number.isInteger(hourNow) || hourNow < 0 || hourNow > 23) return false;
  if (hourNow < hour) return false;
  // No record at all is a fresh install: it checks at the first 08:00 it sees
  // rather than immediately, so installing the app does not immediately tell the
  // reader to install it again.
  if (typeof lastCheckedDay !== "string" || !lastCheckedDay) return true;
  return lastCheckedDay < today;
}

/**
 * The next moment the check should run, as a timestamp. Today at `hour` if that
 * is still ahead, otherwise tomorrow. Built from local calendar components so a
 * daylight-saving shift moves it with the reader's clock rather than drifting an
 * hour away from it.
 */
export function nextRunAt(now, hour = CHECK_HOUR) {
  const at = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    0,
    0,
    0,
  );
  if (at.getTime() > now.getTime()) return at.getTime();
  // Day + 1 rather than +24h: on the day a timezone gains or loses an hour those
  // are not the same instant, and the reader means the clock, not the interval.
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    hour,
    0,
    0,
    0,
  ).getTime();
}
