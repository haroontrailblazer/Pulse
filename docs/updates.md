# Update notices and in-app installs

## Update notices on the APK and the EXE

The two installed surfaces look once each morning to see whether a newer Pulse has
been published, and say so in two places: a native notification, and a row in the
navigation list directly below Dependency insights -- the More sheet on a phone,
the sidebar in the EXE. The website shows none of it, because a browser tab is
already running the newest version by definition.

Once a day, not a poll. The check is due when the reader's local day has changed
and their clock has reached 08:00, which is also what makes it survive a device
that was asleep or switched off at the time: it runs at the first moment after
08:00 instead of being skipped. A release is not a thing that changes between
breakfast and lunch.

Version truth is `https://www.pulses4u.in/latest.json`, written by
`scripts/prepare-downloads.mjs` as the last thing it does. That placement is the
point: by then every installer named in the manifest has been downloaded,
size-checked and SHA-256 verified into the same `dist/` that deploys as one unit,
and the script has already refused to start unless the release metadata matches
both the app version and the current source. So the manifest cannot announce a
version whose installers are not yet downloadable. It is written into `dist/`
rather than `public/`, which keeps it out of the APK and the asar -- and the URL
the apps fetch is absolute for the same reason: both packages carry a copy of the
site's own build metadata, so a relative URL would compare a build against itself
and report "up to date" forever.

- **Android** arms a `PeriodicWorkRequest` whose next run is placed at the next
  local 08:00 with `setNextScheduleTimeOverride`, re-applied after each run so a
  timezone change moves 08:00 with the reader. It is armed for everyone, above the
  gate the watchlist monitor sits behind, because wanting to know about a new
  version has nothing to do with wanting watchlist alerts. Its own notification
  channel, "Pulse updates", at low importance. Tapping the notification opens the
  sheet the row lives in.
- **Windows** computes the same moment and waits with a timer, and re-derives the
  decision on start and on wake, because Windows does not advance a pending timer
  across sleep. Monitoring is on by default after the first run, so the process is
  tray-resident and the morning check happens; a reader who turned it off gets the
  check on their next launch after 08:00 instead.

Tapping the row downloads the new version inside Pulse. No browser, no download
manager, no save dialog. Progress is drawn in the row itself, and nothing is
handed to an installer or executed until its byte count and SHA-256 both match
what the manifest published -- which the app knew before it fetched a single byte.

On Android the verified file goes into a `PackageInstaller` session and the
platform raises its own sheet: "Do you want to update this app?". The digest is
computed a second time there, over the bytes actually written into the session,
and the commit sits inside that check, so nothing is committed that was not just
hashed. It needs one permission, `REQUEST_INSTALL_PACKAGES`, which is a Settings
toggle the reader grants per app rather than a runtime dialog; Pulse sends them
there before spending their data, not after. The permission can only ever install
Pulse: the session names this package, and the archive is refused unless its
signing certificate matches the installed one -- which is checked before the sheet,
because the platform's own failure for a mismatch reads as a bare "App not
installed" with nothing the reader can act on.

**The app cannot restart itself afterwards, and that is a platform rule rather
than a missing feature.** When Pulse installs Pulse the process is killed, and
coming back means starting an activity from a fresh process with no window, which
Android refuses. Measured on an API 36 emulator:

    Background activity launch blocked! goo.gle/android-bal
      [callingPackage: app.pulse.status; callingPackageTargetSdk: 36;
       callingUidProcState: FOREGROUND_SERVICE; isPendingIntent: false]
    START ... app.pulse.status/.MainActivity (BAL_BLOCK) result code=102

`startActivity` returned without throwing, so code that tries this only looks like
it works. A foreground service process state buys no exemption, and the same
record reports `resultIfPiSenderAllowsBal: BAL_BLOCK`, so routing it through a
PendingIntent does not help either. The reader comes back with one tap: the
installer's own "Open" button, or the notification Pulse posts from the new
process once the replacement lands. A tapped notification is a system-sent
PendingIntent, which is the exemption that block record is itself quoting.

On Windows the download is an installer, because since 1.0.28 Pulse is installed
rather than portable. Pulse downloads it, verifies it the same way, and starts it
-- `app.relaunch` with an explicit `execPath`, which Electron acts on once the
current instance exits, releasing the single-instance lock and port 47823 with
it. `execPath` is not optional here: the default is `process.execPath`, which is
the build being replaced.

It runs the installer visibly rather than silently, and that is a deliberate
choice around an unresolved defect. Measured on Windows 11 with this NSIS
configuration, an installer run over an existing installation never finishes:
with `/S` it exits having changed nothing, and visibly it sits on "Installing,
please wait..." for five minutes with no child process and no progress, while a
fresh install of the same artifact takes twelve seconds. `electron-updater`'s
`--updated /S --force-run` makes no difference. Until that is understood, a
visible installer is the safer of the two, because a reader can see it stall and
say so, where a silent no-op looks like an update button that does nothing. This
does not affect a reader coming from a portable build, who has nothing to install
over, but it blocks the release after 1.0.28.

Self-update on Android only works while releases keep being signed with the same
key. The APK is debug-signed from `.cache/android-toolchain/user/debug.keystore`,
and `.gitignore` excludes `.cache/`, `*.jks` and `*.keystore`, so that key lives on
one machine. A build from a different key cannot replace an installed Pulse --
verified, `INSTALL_FAILED_UPDATE_INCOMPATIBLE` -- and the reader would have to
uninstall first, losing their watchlist. Back that key up, or move to a release
key, before this feature is in anyone's hands.
The decisions are made twice -- the Android run happens with no WebView alive, so
Java makes them -- and `shared/update-cases.json` is one truth table that both
`tests/updates.test.js` and `PulseUpdateTest.java` are asserted against. Since
`npm run build:android` runs the JVM tests, a disagreement between the two is a
failed build rather than something a reader discovers.

## Domain move, 1.0.22

Pulse moved from pulse-status-zeta.vercel.app to www.pulses4u.in in 1.0.22. The
old host no longer serves anything, and that is a one-way door for builds that
shipped before the move: 1.0.20 and 1.0.21 compiled the old manifest URL into
the APK and the EXE, so their daily check now reads a 404, records nothing, and
leaves the day unmarked. Nothing breaks and nothing is lost, but those builds
can never learn that a newer Pulse exists. Anyone still on 1.0.21 or earlier has
to download 1.0.22 by hand from https://www.pulses4u.in/#download; from 1.0.22
on, the in-app update path works again.

Use the www host, not the apex, anywhere a build will read it. pulses4u.in
answers 308 to www.pulses4u.in, and all four native network paths refuse
redirects on purpose -- PulseUpdateWorker and PulseDownload both set
setInstanceFollowRedirects(false), desktop/background.cjs fetches the manifest
with redirect: "error", and desktop/download.cjs treats any non-200 as a
failure. An apex URL would fail the update check on both platforms, silently on
Android.

Public website: https://www.pulses4u.in

Open the dashboard: https://www.pulses4u.in/app

Public installers and checksums: https://www.pulses4u.in/#download (SHA-256 at https://www.pulses4u.in/downloads/v1.0.22/SHA256SUMS.txt)

The manual Build Windows release GitHub Actions workflow can build and upload a Windows EXE directly to an existing draft release. It installs the Electron runtime explicitly, runs the tests, checks the existing Android checksum, and uploads a matching combined checksum manifest. The release stays a draft until final review and publication.

For each new installer release, update shared/release-assets.json with the verified names, sizes and checksums before deploying. The mirror fails the deployment on a mismatch or unavailable artifact, so the previous working deployment remains available. Ordinary web and native builds do not bundle the installers. GitHub remains the release archive.

For local iteration where you want dashboard edits to regenerate both installers, use:

```powershell
npm.cmd run watch:all-downloads
```

That watch command runs `npm run build:all-downloads` on first start and whenever app source changes. It rebuilds Windows and Android, verifies matching packaged assets and source fingerprints, updates the checksum manifest, stages local downloads, and builds the website. Generated downloads and metadata are excluded from watching to avoid an endless rebuild loop.

Version 1.0.4 fixes recursive installer packaging: neither native app includes `public/downloads` or marketing screenshots. APK verification rejects nested APK/EXE files and sizes above 15 MB. The hosted deployment refuses a source fingerprint that differs from the rebuilt installers. Download binaries are ignored by Git; publish them to the versioned GitHub release before pushing the deployment commit. Vercel copies the verified files onto its CDN, so users download from the site directly. Already installed copies need the new APK/EXE; this build harness does not silently update installed applications.

Visible dashboards check every 30 seconds. Windows checks watched feeds every five minutes in the tray and resumes after system sleep. Each completed provider reading can trigger its alert immediately, without waiting for unrelated feeds; failed providers do not skip the rest of a Windows sweep. Android forwards foreground readings immediately, rechecks newly enabled or added watched services, and restores scheduling when reopened. Background Android checks use WorkManager's 15-minute minimum, network and battery constraints; the OS can delay them. Instant closed-app delivery requires a separately configured push service. Request counts are estimates, not measured battery consumption.


