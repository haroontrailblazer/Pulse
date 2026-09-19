import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHECK_HOUR,
  dueFrom,
  latestManifest,
  latestManifestUrl,
  localDay,
  newerVersion,
  nextRunAt,
  parseVersion,
  readUpdate,
} from "../shared/updates.js";
import { downloads, releaseVersion } from "../shared/downloads.js";

const cases = JSON.parse(
  readFileSync(new URL("../shared/update-cases.json", import.meta.url), "utf8"),
);
const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("the shared case table is actually populated", () => {
  // A renamed or emptied fixture must fail rather than pass by iterating nothing.
  // The Java mirror asserts the same floors for the same reason.
  assert.ok(cases.newer.length > 10, "version rows");
  assert.ok(cases.due.length > 6, "due rows");
  assert.ok(cases.manifests.length > 6, "manifest rows");
});

test("version ordering matches the shared table", () => {
  for (const row of cases.newer)
    assert.equal(
      newerVersion(row.candidate, row.running),
      row.newer,
      `${row.candidate} vs ${row.running}: ${row.why}`,
    );
});

test("the daily decision matches the shared table", () => {
  for (const row of cases.due)
    assert.equal(
      dueFrom(row.last, row.today, row.hourNow),
      row.due,
      `last=${row.last} today=${row.today} hour=${row.hourNow}: ${row.why}`,
    );
});

test("manifest acceptance matches the shared table", () => {
  for (const row of cases.manifests) {
    const got = readUpdate(row.manifest, row.platform, row.running);
    assert.equal(!!got, row.accepted, row.why);
    if (row.accepted) {
      assert.equal(got.version, row.manifest.version);
      assert.equal(got.url, row.manifest.assets[row.platform].url);
    }
  }
});

test("a version this side cannot order is never acted on", () => {
  assert.deepEqual(parseVersion("1.0.20"), [1, 0, 20]);
  for (const bad of [
    "",
    "v1",
    "1.0.x",
    "1..0",
    "1.0.0.0.1",
    null,
    undefined,
    12,
  ])
    assert.equal(parseVersion(bad), null, String(bad));
});

test("the next run is the next local 08:00, by the clock and not by the interval", () => {
  const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
  const shows = (stamp) => {
    const when = new Date(stamp);
    return [
      when.getFullYear(),
      when.getMonth() + 1,
      when.getDate(),
      when.getHours(),
    ];
  };
  assert.deepEqual(shows(nextRunAt(at(2026, 9, 19, 7, 59))), [
    2026,
    9,
    19,
    CHECK_HOUR,
  ]);
  // Exactly 08:00 has already arrived, so the next one is tomorrow's; the run
  // itself is triggered by dueFrom, not by this.
  assert.deepEqual(shows(nextRunAt(at(2026, 9, 19, 8, 0))), [
    2026,
    9,
    20,
    CHECK_HOUR,
  ]);
  assert.deepEqual(shows(nextRunAt(at(2026, 9, 19, 23, 59))), [
    2026,
    9,
    20,
    CHECK_HOUR,
  ]);
  // Across a month and a year end.
  assert.deepEqual(shows(nextRunAt(at(2026, 9, 30, 12, 0))), [
    2026,
    10,
    1,
    CHECK_HOUR,
  ]);
  assert.deepEqual(shows(nextRunAt(at(2026, 12, 31, 12, 0))), [
    2027,
    1,
    1,
    CHECK_HOUR,
  ]);
  // Leap day.
  assert.deepEqual(shows(nextRunAt(at(2028, 2, 28, 12, 0))), [
    2028,
    2,
    29,
    CHECK_HOUR,
  ]);
  // Always in the future, and never more than ~25 hours out even where a
  // daylight-saving change makes the day 23 or 25 hours long.
  for (const month of [1, 3, 4, 6, 9, 10, 11, 12])
    for (const hour of [0, 7, 8, 9, 23]) {
      const now = at(2026, month, 15, hour, 30);
      const gap = nextRunAt(now) - now.getTime();
      assert.ok(gap > 0, `${month}/${hour} must be ahead`);
      assert.ok(gap <= 25 * 3600_000, `${month}/${hour} gap ${gap}`);
      assert.equal(new Date(nextRunAt(now)).getHours(), CHECK_HOUR);
    }
});

test("the local day is the reader's own day", () => {
  assert.equal(localDay(new Date(2026, 8, 19, 23, 59)), "2026-09-19");
  assert.equal(localDay(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
  // Ordering as strings is what dueFrom relies on.
  assert.ok(localDay(new Date(2026, 8, 18)) < localDay(new Date(2026, 8, 19)));
  assert.ok(localDay(new Date(2025, 11, 31)) < localDay(new Date(2026, 0, 1)));
});

test("the published manifest is built from the files the release already aligns", () => {
  const release = JSON.parse(read("shared/release-assets.json"));
  const manifest = latestManifest(release, downloads);
  assert.equal(manifest.version, releaseVersion);
  assert.equal(manifest.assets.android.url, downloads.android);
  assert.equal(manifest.assets.windows.url, downloads.windows);
  assert.equal(manifest.checksums, downloads.checksums);
  for (const platform of ["android", "windows"]) {
    const asset = manifest.assets[platform];
    assert.ok(asset.name.includes(releaseVersion), platform);
    assert.ok(asset.bytes > 0, platform);
    assert.match(asset.sha256, /^[0-9a-f]{64}$/, platform);
    assert.ok(asset.url.endsWith(asset.name), platform);
  }
  // And the app would accept its own published manifest if it were newer, which
  // is the end-to-end shape check: a manifest the builder writes and the reader
  // rejects would be silent.
  const offered = readUpdate(
    {
      ...manifest,
      version: "99.0.0",
      assets: {
        android: {
          ...manifest.assets.android,
          name: "Pulse-99.0.0-Android.apk",
          url: manifest.assets.android.url
            .replace(releaseVersion, "99.0.0")
            .replace(manifest.assets.android.name, "Pulse-99.0.0-Android.apk"),
        },
      },
    },
    "android",
    releaseVersion,
  );
  assert.ok(offered, "a newer manifest of this shape must be accepted");
});

test("the builder refuses metadata that disagrees with itself", () => {
  const release = JSON.parse(read("shared/release-assets.json"));
  assert.throws(
    () => latestManifest({ version: release.version, assets: [] }, downloads),
    /no -Android\.apk asset/,
  );
  // A drifted download URL must fail the deployment rather than publish a link
  // to a file nobody uploaded.
  assert.throws(
    () =>
      latestManifest(release, {
        ...downloads,
        android: "https://example.com/other.apk",
      }),
    /does not name that file/,
  );
});

test("the manifest URL is absolute, because a relative one would lie", () => {
  // Both native packages carry a copy of the site's own build metadata, so a
  // relative fetch resolves to the installed app and always reports "up to
  // date". verify-native-builds.mjs extracts that copy from each package, which
  // is the proof.
  assert.match(latestManifestUrl, /^https:\/\//);
  const verify = read("scripts/verify-native-builds.mjs");
  assert.match(verify, /pulse-build\.json/);
  for (const file of ["shared/updates.js", "desktop/background.cjs"])
    assert.ok(
      !/fetch\(\s*["'`]\//.test(read(file)),
      `${file} must not fetch a root-relative URL`,
    );
});

test("nothing in the web bundle reaches for the update bridge", () => {
  // The website must not show, fetch or schedule any of this. The nav row is
  // gated on the native bridge, which the site does not have.
  const app = read("src/App.jsx");
  assert.ok(
    !/latestManifestUrl/.test(app),
    "App must not fetch the manifest itself; the natives report it",
  );
});

test("the published manifest is cached briefly, and never immutably", () => {
  // The single highest-consequence mistake available in this change: a manifest
  // served with the year-long immutable header the installers use would tell
  // readers about last year's release for a year. It does not match
  // /downloads/(.*), and the platform default would already be correct, but this
  // is not a thing to leave resting on an undocumented default.
  const vercel = JSON.parse(read("vercel.json"));
  const rule = vercel.headers.find((entry) => entry.source === "/latest.json");
  assert.ok(rule, "/latest.json needs its own Cache-Control rule");
  const cache = rule.headers.find((h) => h.key === "Cache-Control").value;
  const maxAge = Number(/max-age=(\d+)/.exec(cache)[1]);
  assert.ok(maxAge > 0 && maxAge <= 3600, cache);
  assert.doesNotMatch(cache, /immutable/);
  // And no other rule may reach it.
  for (const entry of vercel.headers) {
    if (entry.source === "/latest.json" || entry.source === "/(.*)") continue;
    const pattern = new RegExp(
      `^${entry.source.replace(/\((\.\*)\)/g, "(.*)")}$`,
    );
    assert.ok(
      !pattern.test("/latest.json"),
      `${entry.source} must not match /latest.json`,
    );
  }
});

test("the manifest is written only by the deploy build, so no native package can carry it", () => {
  // This is what makes "structurally impossible" a test rather than a convention.
  // prepare-downloads.mjs is reachable from exactly one npm script, and it is not
  // the one the APK or the EXE are built from.
  const scripts = JSON.parse(read("package.json")).scripts;
  const callers = Object.entries(scripts).filter(([, body]) =>
    body.includes("prepare-downloads"),
  );
  assert.deepEqual(
    callers.map(([name]) => name),
    ["build:deploy"],
    "only build:deploy may publish the manifest",
  );
  assert.ok(!scripts.build.includes("prepare-downloads"));
  assert.ok(!scripts["android:sync"].includes("prepare-downloads"));
  assert.ok(!scripts["build:windows"].includes("prepare-downloads"));
  // And it goes to dist/, never public/, which every build copies.
  const prepare = read("scripts/prepare-downloads.mjs");
  assert.match(prepare, /resolve\("dist\/latest\.json"\)/);
  assert.ok(!/public\/latest\.json/.test(prepare));
});

test("both natives report the update in the state every bridge reply carries", () => {
  // The one fact in this feature that is correct by construction only as long as
  // nobody refactors it. The renderer calls configure() on every boot and status()
  // only when the settings sheet mounts, so a field added anywhere else is missing
  // until the reader opens Settings and is wiped by the next watchlist edit.
  const bg = read("desktop/background.cjs");
  const statusBody = bg.slice(
    bg.indexOf("const status = () => ({"),
    bg.indexOf("function accept("),
  );
  assert.match(statusBody, /update:/, "Electron must report it from status()");
  assert.match(
    bg,
    /return status\(\);/,
    "and configure() must return status()",
  );
  // Android resolves one state object from status(), configure() and the
  // permission callback alike.
  const plugin = read(
    "android/app/src/main/java/app/pulse/status/PulseBackground.java",
  );
  const state = plugin.slice(
    plugin.indexOf("private JSObject state()"),
    plugin.indexOf("@PluginMethod public void requestAlerts"),
  );
  assert.match(state, /PulseUpdate\.offered\(getContext\(\)\)/);
  assert.ok(
    (plugin.match(/call\.resolve\(state\(\)\)/g) || []).length >= 3,
    "status, configure and the permission callback all resolve it",
  );
  // The notice itself needed no IPC. Downloading does, because the row asks for
  // it: one channel, behind the same trusted-sender check as the other two.
  assert.equal(
    read("desktop/preload.cjs").match(/ipcRenderer\.invoke/g).length,
    3,
  );
  const main = read("desktop/main.cjs");
  assert.match(main, /ipcMain\.handle\("pulse:update"/);
  const handler = main.slice(main.indexOf('ipcMain.handle("pulse:update"'));
  assert.match(handler.slice(0, 220), /trusted\(event\)/);
});

test("the daily Android check is armed for every reader, not only those with alerts on", () => {
  const store = read(
    "android/app/src/main/java/app/pulse/status/PulseStore.java",
  );
  const schedule = store.slice(
    store.indexOf("static synchronized void schedule("),
    store.indexOf("static void refresh(Context c)"),
  );
  const armed = schedule.indexOf("PulseUpdateWorker.arm(c)");
  const gate = schedule.indexOf("if(!needed(c)");
  assert.ok(armed > 0, "the update work must be armed in schedule()");
  assert.ok(
    armed < gate,
    "and above the alerts-and-widgets gate, which returns early",
  );
  // Its own unique names, so arming it cannot disturb the watchlist monitor.
  const worker = read(
    "android/app/src/main/java/app/pulse/status/PulseUpdateWorker.java",
  );
  assert.match(worker, /WORK = "pulse-update-daily"/);
  assert.match(worker, /WORK_NOW = "pulse-update-now"/);
  for (const name of ["pulse-periodic", "pulse-once"])
    assert.ok(!worker.includes(name), `must not touch ${name}`);
  // The two policies that would break it, named so nobody reintroduces them.
  assert.ok(
    !/ExistingWorkPolicy\.REPLACE/.test(worker),
    "REPLACE cancels the running worker",
  );
  assert.match(worker, /ExistingPeriodicWorkPolicy\.UPDATE/);
  assert.match(worker, /setNextScheduleTimeOverride/);
  assert.match(worker, /Result\.success\(\)/);
  assert.ok(
    !/Result\.retry\(\)/.test(worker),
    "a retry would loop against an unreachable manifest",
  );
  assert.match(
    worker,
    /static synchronized void check\(/,
    "the daily run and the catch-up can race",
  );
  assert.match(worker, /setInstanceFollowRedirects\(false\)/);
});

test("the Android permission set is a whitelist, and the install permission is on it deliberately", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  // REQUEST_INSTALL_PACKAGES was deliberately avoided while the row only opened a
  // browser. It is here now because the row downloads and installs in place, which
  // is what was asked for. A whitelist rather than a count, so the eighth
  // permission is also somebody's decision rather than a number going up.
  const permissions = (
    manifest.match(/uses-permission android:name="([^"]+)"/g) || []
  ).map((line) =>
    line.replace(/.*android\.permission\./, "").replace(/"$/, ""),
  );
  assert.deepEqual(permissions.sort(), [
    "FOREGROUND_SERVICE",
    "FOREGROUND_SERVICE_DATA_SYNC",
    "INTERNET",
    "POST_NOTIFICATIONS",
    "RECEIVE_BOOT_COMPLETED",
    "REQUEST_INSTALL_PACKAGES",
    "WAKE_LOCK",
  ]);
  // It can only ever install Pulse: the session names this package, and the
  // archive is refused unless its signing certificate matches the installed one.
  const installer = read(
    "android/app/src/main/java/app/pulse/status/PulseInstaller.java",
  );
  assert.match(installer, /setAppPackageName\(c\.getPackageName\(\)\)/);
  assert.match(installer, /sameSigner/);
  // Nothing may be committed that was not just hashed: the digest is computed
  // over the bytes written into the session, and the check sits before the commit.
  assert.ok(
    installer.indexOf("sha.digest()") < installer.indexOf("session.commit("),
    "the digest must be computed before the commit",
  );
  assert.ok(
    installer.indexOf("session.abandon()") <
      installer.indexOf("session.commit("),
    "a mismatch must abandon the session rather than commit it",
  );
  // And the download refuses anything whose size or digest disagrees, renaming to
  // the final name only after both match.
  const download = read(
    "android/app/src/main/java/app/pulse/status/PulseDownload.java",
  );
  assert.ok(
    download.indexOf("hex.toString().equals") <
      download.indexOf("renameTo(done)"),
    "the digest must be checked before the file gets its final name",
  );
  // Still no scanning of other apps, and still no updater framework.
  assert.ok(!/QUERY_ALL_PACKAGES/.test(manifest));
  const pkg = JSON.parse(read("package.json"));
  for (const dep of Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }))
    assert.ok(!/updater/i.test(dep), dep);
});
