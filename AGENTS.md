# Pulse delivery harness

Pulse has one product surface implemented three ways: the hosted website, the
Capacitor Android APK, and the portable Electron Windows EXE. Treat a change to
application code, native code, shared code, branding, build configuration, or
runtime behavior as a three-surface delivery. Do not describe a change as
released until all of the checks below pass.

## Required release sequence

1. Choose a new semantic version before preparing a public installer release.
   Keep `package.json`, `android/app/build.gradle`, `shared/downloads.js`, and
   `shared/release-assets.json` aligned. A published version is immutable.
2. Run the native release gate from Windows:

   ```powershell
   node scripts/release-harness.mjs prepare --launch-native
   ```

   This runs the Node tests, builds the hosted web output, rebuilds the APK
   (including Android unit tests), rebuilds the Windows EXE, updates release
   checksums, verifies byte-identical web assets in both native packages, then
   launches both packages. It needs one authorized ADB device or emulator. Pass
   `-- --android-serial SERIAL` when more than one device is attached.

   The Windows smoke test opens the portable EXE and confirms its bundled
   server responds at `127.0.0.1:47823`. The Android smoke test installs the
   debug APK with `adb install -r`, starts `app.pulse.status/.MainActivity`, and
   confirms the app process is running. The harness stops both after checking;
   use `-- --keep-native-open` only when a human needs to inspect the open apps.
   A missing device, failed install, failed app launch, or failed local server is
   a release blocker. Do not claim native launch verification when it was not
   run.
3. Review `test-results/release-harness-prepare.json`. Stage the updated release
   metadata together with the implementation. Do not stage `releases/`,
   `public/downloads/`, `dist/`, or other generated binaries.
4. Create a **draft** GitHub release for `v<version>`. Upload the exact APK and
   EXE from `releases/`. Compare GitHub's asset sizes and SHA-256 digests with
   `shared/release-assets.json`; publish only after both match.
5. Commit, push `main`, and let Vercel deploy after the GitHub assets are public.
   `npm run build:deploy` intentionally fails if either installer is missing or
   differs from the checksum manifest. If an automatic Vercel build raced the
   release upload, redeploy the failed **pulse-status** deployment after the
   assets are available. Do not run a root `vercel --prod` command that can
   create a different Vercel project.
6. Run the production gate:

   ```powershell
   node scripts/release-harness.mjs verify-live --wait-seconds 900
   ```

   It confirms the current commit is on `origin/main`, waits for the versioned
   CDN checksum manifest, downloads and hashes both public installers (including
   HTTP range support), checks the marketing page download links, opens `/app`,
   checks its layout, and validates `/api/status`.

The production report is written to `test-results/release-harness-live.json`.
In the final handoff, give the version, commit, GitHub release URL, installer
URLs, native-launch outcome, and the exact checks that passed or failed.

## Non-release and browser-only work

For a deliberately web-only change, state that native packages were not rebuilt
and get explicit confirmation before omitting the three-surface release gate.
For ordinary local work, `node scripts/release-harness.mjs prepare` still builds and verifies
all three artifacts without installing or opening the native apps. Do not use
`--allow-published-version` for a public release; it exists only to reproduce a
previous version locally.
