# Pulse

A calm, modern view of the internet's health. Responsive React application, a Node status aggregator, an Electron Windows shell, and a Capacitor Android project.

## Run the website

Requires Node.js 22.12+ (developed with Node 24).

```powershell
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:5173. The development server includes the status API.

For a production build:

```powershell
npm.cmd run build
npm.cmd start
```

Open http://localhost:3000. The production server serves both `dist` and `/api/status`. For deployment behind an HTTPS reverse proxy, set `HOST=0.0.0.0` and `PORT` as required by the host. This project has not been published to a public domain. A static-only host needs the API deployed separately and `VITE_API_BASE_URL` set at build time. Configure `CORS_ORIGIN` on that API to the exact frontend origin.

## What works

- Overview with provider health counts, live incident feed, searchable and filterable service directory.
- 28 technology providers across seven categories, including package registries and security platforms. New feeds: npm, PyPI & Python, Docker, RubyGems, CircleCI, Postman, Sentry, Snyk, and HackerOne.
- Official Statuspage-compatible feeds, Google Cloud's public JSON incident feed, and Hugging Face's Better Stack feed.
- Provider details, current component status, incident updates, timestamps, and official source links.
- Developer console with watched-stack health, searchable provider components, observed changes, feed diagnostics, JSON snapshots, and copyable source curl commands.
- Dedicated Registries view for package installation, publishing, container services, and registry health. Component labels retain their source group/region to distinguish otherwise identical names.
- Security lab with Snyk/HackerOne status, live OSV package advisory lookup (npm, PyPI, RubyGems), local JWT inspection, and local SHA-256 hashing of text or files with checksum comparison.
- Local watchlist persisted on the device, in-app incident inbox, and automatic monitoring every 30 seconds while visible. Hidden browser renderers disconnect and stop polling.
- Live atlas: regional pins reflect fresh component status (major issue, degraded, maintenance, operational, or unavailable). Select a hub for source evidence, filter severity or your watchlist, and open provider incidents. The service-wide view includes issues without a reported location and suggests developer workflows to check. Region selection, zoom, reset, and phone controls remain available.
- Industry relevance explorer and provider links for investigating potential exposure.
- Responsive phone layout, keyboard-accessible dialogs, reduced-motion support, and bundled fonts.
- OpenCode Data-inspired light/dark colors: white and neutral grays with black controls in light mode; charcoal and white controls in dark mode. Existing typography, spacing, and layout are preserved. Dashboard, atlas, dialogs, developer tools, and branding share semantic color tokens in `src/theme.css`; service-state colors remain distinct from interaction colors. The top-bar toggle starts from the device preference and remembers an explicit choice before the interface renders.
- Height-aware sidebar: navigation, watched services, and the desktop download card scroll independently while Help, Settings, and the workspace footer stay accessible. Watchlists longer than five services include a link to the full list. The phone drawer supports a close button, Escape, keyboard focus containment, background scroll locking, and safe-area padding.
- Custom Pulse signal mark: opposing receiver arcs around a central system node, with matching light/dark treatment, vector and PNG assets, a multi-resolution Windows icon, and correctly padded Android adaptive icons. See `design/README.md` for files and regeneration instructions.

## Data boundaries

Pulse is independent of the companies listed. It reports provider-published health, not independent availability measurements. Failed or unsupported feeds are **unavailable**, never assumed healthy. AWS uses the public Health Dashboard current-events feed, Azure uses its public RSS feed, Google Cloud uses its incident JSON feed, and Replicate is scoped to its component on Cloudflare Status. These cloud feeds exclude account-specific health events. Other feeds can fail temporarily or change their API format.

The web/desktop monitor streams each provider result over Server-Sent Events as it completes. Android runs the same monitoring engine through native HTTP. Each request has a 15-second timeout. Automatic sweeps start every 30 seconds without overlapping; provider publishing delays still apply. Counts cover this catalog only. Source timestamps are shown separately from retrieval timestamps. A provider can report operational while still listing an incident; inspect the specific incident and components.

Failed checks preserve the last verified context, mark it **stale**, and exclude it from current health and active incident totals. Readings also expire from current counts after five minutes without successful verification. Feed-request duration is not product API latency. Replicate currently returns an unsupported HTML page at the expected feed endpoint and is explicitly unavailable.

The Changes tab records real baseline, status, component, incident, and verification events observed by this running monitor. It keeps up to 250 events in memory. Server/app restart resets the history; it does not claim historical uptime or persistent monitoring while the app/server is stopped.

## Security utilities

Package advisory checks call [OSV's public API](https://google.github.io/osv.dev/post-v1-query/) directly from the browser, or through native HTTP on Android. Only the submitted package name, ecosystem, exact version, and pagination tokens are sent. No project files are uploaded. Each request times out after 15 seconds; results follow up to three pages and display at most 250 advisories, explicitly marking incomplete results. This is a single-package query, not a dependency-tree scan, package-existence check, or security certification. No matches do not establish that a package is safe. Review upstream advisory links for affected ranges and fixes.

JWT inspection decodes the header and claims locally, explains expiry/activation claims, and flags unsigned or malformed tokens. It does not verify signatures, issuers, or audiences; encrypted JWTs (JWE) are unsupported. Token text is not persisted or transmitted. SHA-256 uses Web Crypto locally for exact UTF-8 text or files up to 10 MB, with optional expected-checksum comparison. Clear a selected file to return to text hashing. Utility inputs reset when their tool is closed.

## Monitoring API

- `GET /api/status`: full normalized snapshot, diagnostic metadata, and observed event history.
- `GET /api/status?refresh=1`: request a new sweep (5-second global cooldown; concurrent refresh requests share the same work).
- `GET /api/status/stream`: SSE snapshot followed by per-provider deltas. When `partial` is true, merge providers by `id`; metadata and history replace the previous values. Comment heartbeats arrive every 15 seconds. Disable proxy buffering and allow long-lived connections when deploying. Browser clients fall back to polling when streaming is unavailable.

The server runs automatic sweeps while stream subscribers are connected. REST-only clients initiate sweeps through their requests. Production hosting must keep the Node server running; static hosting alone cannot collect provider feeds.

## Scope of status data

Service bars use the same 12-slot, 15-minute window of collected official readings for every provider. An unmeasured slot is gray; Google Cloud and Azure use their official provider aggregate because their public feeds do not expose component lists. The bars are not an uptime percentage or independent probe. Historical availability, latency monitoring, server-push alerts, user accounts, cloud watchlist sync, billing, and verified company-to-company dependency data are not implemented.

Map positions are reference hubs. Colors summarize fresh components whose names explicitly include a supported location; city word boundaries and accent normalization prevent broad substring matches. Provider-wide status and active incident impact contribute to the separate service issue list, never inferred city pins. Incident body text, headquarters locations, and broad region labels are not used to place outages. Stale or unknown providers are excluded, so an unavailable pin is not an all-clear. Regional operational signals describe only matched components, not every service in a city. Source component names and check ages are available in the map evidence panel. Industry relationships describe potential service relevance, not established customer dependencies, confirmed downstream outages, revenue losses, or economic-impact estimates.

## Windows app

```powershell
npx.cmd install-electron
npm.cmd run desktop
npm.cmd run build:windows
```

Expected portable artifact: `releases/Pulse-1.0.8-Windows.exe`. Packaging is unsigned; code-signing certificates and public distribution are not configured. The app uses a sandboxed renderer with Node integration disabled and a local status server bound to `127.0.0.1:47823`. Its fixed origin keeps the local watchlist stable across restarts. Port 47823 must be available. External HTTPS links open in the system browser.

## Android app

The generated native project is in `android/`. It targets Android SDK 36, supports Android 7.0 / API 24+, and requires JDK 21. Install Android Studio or the official Android SDK command-line tools, review and accept the SDK license, and configure `JAVA_HOME` and `ANDROID_HOME`. Install `platforms;android-36`, `build-tools;36.0.0`, and `platform-tools` through SDK Manager. These prerequisites are not bundled in the repository.

The build helper also detects the project-local toolchain under `.cache/android-toolchain/jdk` and `.cache/android-toolchain/sdk`. It sets build-process environment variables and writes the ignored `android/local.properties`; it does not change your system Java installation. On Windows, Gradle uses `%TEMP%/pulse-gradle` to avoid workspace cache move failures. Set `GRADLE_USER_HOME` to use another cache location.

```powershell
npm.cmd run build:android
# Or open the native project in Android Studio:
npm.cmd run android:open
```

APK output: `releases/Pulse-1.0.8-Android.apk` (also in `android/app/build/outputs/apk/debug/app-debug.apk`). This is a debug-signed APK for installation and testing. A production release APK/AAB requires your signing key. Do not commit signing secrets or keystores. The Android app fetches the allowlisted public status feeds through native HTTP, including BOM-aware decoding for AWS and XML support for Azure, so it does not depend on a localhost server or browser CORS.

## Verification

```powershell
npm.cmd run build
npm.cmd test
```

Tests cover malformed upstream data, closed-incident filtering, outages, network and HTTP failures, unsupported providers, Google Cloud and Better Stack interpretation, progressive refresh timing, request sharing, stale readings, observed changes, SSE deltas and cleanup, and production static-file serving/path traversal protection. Manual browser checks cover component search and filtering, feed diagnostics, provider details, watchlist edits and persistence, light/dark appearance, and a 390 px mobile viewport.

Security tests additionally cover scoped package names, version-range rejection, advisory pagination and upstream failures, JWT malformed inputs and time claims, SHA-256 reference vectors, and component group labels. Browser checks include real npm/PyPI advisory queries and local utility interactions.

## Project structure

```text
src/                 Shared interface, map, styles, and brand assets
shared/providers.js  Catalog and provider response normalization
shared/monitor.js    Refresh scheduling, freshness, and observed changes
server/              Official-feed aggregator, SSE API, and production web server
desktop/             Sandboxed Electron application
android/             Generated Capacitor Android project
tests/               Data integrity and production server tests
```

## Attribution

Map geometry: Natural Earth through `world-atlas` (public domain). Icons: Phosphor (MIT), custom status symbols, and selected Simple Icons paths (CC0). Provider names and marks belong to their respective owners and identify official sources. DM Sans and Manrope are bundled via Fontsource under the SIL Open Font License; see `public/font-licenses/`.



## Watchlist alerts and Android home-screen widget

Open **Settings → Enable alerts**, or use **Enable alerts** beside Refresh on Overview. Android requests notification permission and keeps a visible foreground-monitor notification while it checks the watched feeds after the app closes; its interval is calculated from the watchlist, from 30 seconds to five minutes. The widget keeps a 15-minute Android-scheduled fallback. Windows keeps Pulse in the tray and checks watched feeds every 30 seconds. They notify on newly observed issues and deduplicate unchanged incidents. These are local notifications, not instant cloud push. Quit on Windows and force-stop on Android stop monitoring. The browser pauses its collector connection when hidden.

In the APK, choose **Settings → Add widget**, then confirm with your launcher. Alternatively, long-press your Android home screen, choose Widgets, and select **Pulse · My stack**. The native, resizable widget shows prioritized watched services, issue counts, dated readings and a refresh control. Tapping it opens Watchlist. Widget updates work independently of notification permission.

The full developer console now lives on **Developer tools**. Overview has the overall summary; Global map, Incidents, Dependency insights and Watchlist no longer repeat that console or overall summary. Watchlist filters and totals are scoped to watched services. Unavailable feeds remain explicitly unavailable, never implicitly healthy.

UI icons use [Phosphor](https://github.com/phosphor-icons/react). Provider marks identify their respective owners: the OpenAI Blossom, AWS and Twilio vectors come from Simple Icons 14.15.0; Azure from 12.0.0; other provider marks use the installed Simple Icons collection. OpenAI is rendered in monochrome in accordance with its [brand guidance](https://openai.com/brand/). Pulse is independent and these marks imply no endorsement.

See [background-monitoring.md](design/background-monitoring.md) for the request-budget calculation, scheduling architecture and device-testing limits.

## Incident inbox and understandable insights

The bell opens all active provider incidents by default, requests a fresh check, and sorts by the newest valid source update. Choose My watchlist to narrow the inbox. Search, Unread only, and Mark shown as read work together; read state persists locally. A changed message or phase on the same incident becomes unread again. Provider update timestamps and the latest completed check are shown separately. Failed or stale feeds are excluded from the current inbox with explicit coverage, and no resolved history is invented from an active-only feed.

Personal-workspace avatars and plan/account controls have been removed. The sidebar links directly to saved services, provides an export shortcut, and says Free for everyone / All features. No account needed.

Dependency insights now has a focused explanation panel rather than repeating the overview's category cards. Each affected service explains what is happening, what a user might notice, and what to check next. It includes the specific source evidence, provider aggregate status and check time, a watchlist-only filter, a watch toggle, provider drill-down, all relevant services, and Copy impact summary. Component and incident issues are included even under an operational provider aggregate; a major component issue is not presented as a whole-provider outage. Category-based explanations are possible effects, not verified downstream outages.

## Map and notification design

The map shares a distinct symbol system with the incident inbox: an interrupted red square for major outages, an amber diamond for degradation, and a blue clock for maintenance. Each service-condition filter counts matching evidence independently, so one service can appear in multiple categories. Maintenance evidence is included in the map without changing disruption-only industry insights. Phone markers are enlarged, with location pointers separating nearby London and Frankfurt symbols. No continuous marker animation or extra refresh timer is introduced.

The inbox uses provider logos, incident-specific impact badges, unread indicators, and local-calendar date groups. An incident without a reported impact is shown as an incident update rather than inheriting another incident’s or the provider’s severity. Existing fonts, neutral themes, feed coverage, watchlist scope, and persistent read state are retained.

## Mobile overview

Overview uses one desktop component on the website, Android and Windows. Phone and APK layouts retain its summaries, map, incidents, service directory and insights in a compact portrait-monitor arrangement. Page titles scale to one line at phone widths. Status summaries include component and incident evidence, separate maintenance from disruption, and keep unavailable readings neutral. Page navigation returns to the top.

## Contained map workspace

Global map fits the available viewport below the app toolbar. All status filters, regional markers, zoom controls, service lists, official evidence, watch toggles and explanatory legends stay inside the map. Tap a location or a severity filter to open its floating inspector; the inspector scrolls independently. Short phone and landscape views focus the selected regional marker while its details are open. Marker touch targets are separated with connectors to their true projected locations. Provider-wide incidents never create inferred city outages.

Export brief and the repeated Add to watchlist buttons in page headings have been removed. Watchlist management remains available from service details, the mobile overview, sidebar and the map inspector. The existing monitoring cadence and background notification behavior remain unchanged.

## Public website and Vercel

The public entry point is a marketing page explaining Pulse, with actual app screenshots, an interactive feature tour, and web-first platform choices. On Vercel, / serves the marketing index and /app serves dashboard.html. The web build promotes landing.html to dist/index.html and preserves the dashboard as dist/dashboard.html. Preview the landing locally at /landing.html. Run npm run build:web for the hosted build; regular npm run build remains the native dashboard build and excludes marketing images.

Vercel serves /api/status as a bounded Node function. The hosted dashboard polls every 30 seconds while visible and pauses when hidden. Responses can be shared by the CDN for 30 seconds; freshness checks still exclude outdated readings. Native builds retain their existing local server or direct Android transport. No database or cross-device account system is introduced.

Download links in both the landing page and dashboard point to versioned static files under https://pulse-status-zeta.vercel.app/downloads/v1.0.8, defined in shared/downloads.js. The deployment command `npm run build:deploy` fetches the published release once, verifies byte counts and SHA-256 against shared/release-assets.json, and stages the installers on the website CDN. Users download directly from that CDN; no runtime GitHub proxy or serverless function handles the file transfer. The APK and portable EXE include the compact sidebar and smaller wordmark, the desktop Overview in a portrait-monitor arrangement, Android-safe page spacing, complete live incident lists, location-scoped map evidence, and component-health bars in a fixed-height, internally scrollable service directory. See design/marketing-assets.md for artwork provenance and screenshot details.

Public website: https://pulse-status-zeta.vercel.app

Open the dashboard: https://pulse-status-zeta.vercel.app/app

Public installers and checksums: https://github.com/haroontrailblazer/Pulse/releases/tag/v1.0.8

The manual Build Windows release GitHub Actions workflow can build and upload a Windows EXE directly to an existing draft release. It installs the Electron runtime explicitly, runs the tests, checks the existing Android checksum, and uploads a matching combined checksum manifest. The release stays a draft until final review and publication.

For each new installer release, update shared/release-assets.json with the verified names, sizes and checksums before deploying. The mirror fails the deployment on a mismatch or unavailable artifact, so the previous working deployment remains available. Ordinary web and native builds do not bundle the installers. GitHub remains the release archive.

For local iteration where you want dashboard edits to regenerate both installers, use:

```powershell
npm.cmd run watch:all-downloads
```

That watch command runs `npm run build:all-downloads` on first start and whenever app source changes. It rebuilds Windows and Android, verifies matching packaged assets and source fingerprints, updates the checksum manifest, stages local downloads, and builds the website. Generated downloads and metadata are excluded from watching to avoid an endless rebuild loop.

Version 1.0.4 fixes recursive installer packaging: neither native app includes `public/downloads` or marketing screenshots. APK verification rejects nested APK/EXE files and sizes above 15 MB. The hosted deployment refuses a source fingerprint that differs from the rebuilt installers. Download binaries are ignored by Git; publish them to the versioned GitHub release before pushing the deployment commit. Vercel copies the verified files onto its CDN, so users download from the site directly. Already installed copies need the new APK/EXE; this build harness does not silently update installed applications.

Visible dashboards check every 30 seconds. Windows checks watched feeds every five minutes in the tray and resumes after system sleep. Each completed provider reading can trigger its alert immediately, without waiting for unrelated feeds; failed providers do not skip the rest of a Windows sweep. Android forwards foreground readings immediately, rechecks newly enabled or added watched services, and restores scheduling when reopened. Background Android checks use WorkManager's 15-minute minimum, network and battery constraints; the OS can delay them. Instant closed-app delivery requires a separately configured push service. Request counts are estimates, not measured battery consumption.


### Official cloud feeds (1.0.4)

Replicate now follows its `fvgfcmy66tdr` component on Cloudflare Status, after the old Replicate status domain migrated. Unrelated Cloudflare incidents are excluded. AWS uses the public dashboard's `/public/currentevents` endpoint, with BOM-aware UTF-16 decoding, regional incident details, and resolved-event filtering. Azure uses the official RSS feed with validated XML and public-advisory coverage. Google Cloud retains its official JSON feed; transient requests can retry once within the existing 15-second request budget, and explicit `SERVICE_OUTAGE` updates now retain outage severity.

The foreground Android bridge and background worker share the same allowlisted, BOM-aware HTTP reader. The widget/background parser supports all four formats. Checks still pause in hidden browser tabs; polling intervals are unchanged. Public cloud status does not cover private account-specific events. Upstream errors remain unavailable rather than becoming a false all-clear.

Validation: 61 Node tests; 8 Android feed tests plus the existing example test; live official-feed checks for all four providers. The installed widget/notification experience still requires physical-device testing.
