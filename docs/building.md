# Building Pulse

Building the Windows EXE, the Android APK, and running the three-surface release harness.

## Windows app

```powershell
npx.cmd install-electron
npm.cmd run desktop
npm.cmd run build:windows
```

Expected artifact: `releases/Pulse-<version>-Windows.exe`, a one-click per-user NSIS installer that installs into `%LOCALAPPDATA%\Programs\pulse-status`. The unpacked application it installs is also written to `releases/win-unpacked/Pulse.exe`, and that is the binary the release gate launches, because running the installer would install rather than start anything. Packaging is unsigned; code-signing certificates and public distribution are not configured. The app uses a sandboxed renderer with Node integration disabled and a local status server bound to `127.0.0.1:47823`. Its fixed origin keeps the local watchlist stable across restarts. Port 47823 must be available. External HTTPS links open in the system browser.

## Android app

The generated native project is in `android/`. It targets Android SDK 36, supports Android 7.0 / API 24+, and requires JDK 21. Install Android Studio or the official Android SDK command-line tools, review and accept the SDK license, and configure `JAVA_HOME` and `ANDROID_HOME`. Install `platforms;android-36`, `build-tools;36.0.0`, and `platform-tools` through SDK Manager. These prerequisites are not bundled in the repository.

The build helper also detects the project-local toolchain under `.cache/android-toolchain/jdk` and `.cache/android-toolchain/sdk`. It sets build-process environment variables and writes the ignored `android/local.properties`; it does not change your system Java installation. On Windows, Gradle uses `%TEMP%/pulse-gradle` to avoid workspace cache move failures. Set `GRADLE_USER_HOME` to use another cache location.

```powershell
npm.cmd run build:android
# Or open the native project in Android Studio:
npm.cmd run android:open
```

APK output: `releases/Pulse-<version>-Android.apk` (also in `android/app/build/outputs/apk/debug/app-debug.apk`). This is a debug-signed APK for installation and testing. A production release APK/AAB requires your signing key. Do not commit signing secrets or keystores. The Android app fetches the allowlisted public status feeds through native HTTP, including BOM-aware decoding for AWS and XML support for Azure, so it does not depend on a localhost server or browser CORS.

## Verification

```powershell
npm.cmd run build
npm.cmd test
```

## Three-surface release harness

Every public product change is built and checked as the hosted website, Android
APK, and Windows EXE. The release harness makes that requirement repeatable for
people and coding agents:

```powershell
# Builds web, APK, and EXE; runs tests and parity checks.
node scripts/release-harness.mjs prepare

# Required for a public native release. Launches the EXE and one connected ADB
# device/emulator after building, then records the launch proof.
node scripts/release-harness.mjs prepare --launch-native

# Run only after the GitHub assets are published and the commit is pushed.
node scripts/release-harness.mjs verify-live --wait-seconds 900
```

The local report is `test-results/release-harness-prepare.json`; the production
report is `test-results/release-harness-live.json`. The production command waits
for Vercel's versioned checksum manifest, hashes both public downloads, checks
range support, validates the marketing download links and dashboard, and checks
the status API. See [AGENTS.md](../AGENTS.md) for the required release order,
Android-device requirement, GitHub asset verification, and Vercel recovery
procedure.

Tests cover malformed upstream data, closed-incident filtering, outages, network and HTTP failures, unsupported providers, Google Cloud and Better Stack interpretation, progressive refresh timing, request sharing, stale readings, observed changes, SSE deltas and cleanup, and production static-file serving/path traversal protection. Manual browser checks cover component search and filtering, feed diagnostics, provider details, watchlist edits and persistence, light/dark appearance, and a 390 px mobile viewport.

Security tests additionally cover scoped package names, version-range rejection, advisory pagination and upstream failures, JWT malformed inputs and time claims, SHA-256 reference vectors, and component group labels. Browser checks include real npm/PyPI advisory queries and local utility interactions.

