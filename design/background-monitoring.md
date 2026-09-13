# Background monitoring and widget

Pulse now uses separate foreground and background schedules. This is a request-budget calculation, not a measured battery benchmark.

| Mode | Collection scope | Scheduled interval | Feed requests/hour, four watched services |
|---|---|---|---:|
| Previous installed collector | All 26 automated feeds | 30 seconds | 3,120 |
| Visible app | All 26 automated feeds | 2 minutes | 780 |
| Android alerts enabled | Watched automated feeds only | Foreground monitor, calculated 30 seconds–5 minutes | Up to 120 |
| Android widget fallback | Watched automated feeds only | OS-scheduled, minimum 15 minutes | Up to 16 |
| Windows background | Watched automated feeds only | 30 seconds | Up to 480 |
| Hidden browser page | None | Disconnected | 0 |

The catalog has 28 entries; two are source-link-only. Scheduled foreground request volume falls 75%. With four watched feeds, Android background volume falls approximately 99.5% and Windows background volume 98.5% relative to continuously running the old installed collector. These comparisons exclude initial loads, manual refreshes, retries, and OS/provider delays. They are not reductions in whole-device battery consumption. A hosted website shares one collector among connected clients; its 26 feed requests are server-side, not 26 outbound feed requests per browser.

Foreground timers update age text every 15 seconds, rather than repainting the entire app every second. Hidden pages unsubscribe from SSE/native collection, clear fallback polling and stop age timers. A pending fetch can finish before the collector sleeps. Manual refresh remains available. A reading expires from current foreground health counts after five minutes; a failed fetch becomes unavailable immediately.

## Android

`PulseBackground` is a registered Capacitor plugin. Watchlist IDs are validated against a build-generated, bundled catalog. When alerts are enabled, a visible Android foreground-monitor notification keeps the watched-feed collector running after the WebView closes. Its interval scales from 30 seconds for one watched feed to five minutes for large watchlists, keeping up to ten watched feeds at 120 requests per hour in total. A unique WorkManager periodic job remains as a network-connected, battery-aware 15-minute fallback for widgets; its immediate work is expedited and has no battery-not-low constraint so widget refreshes do not wait for that fallback. Concurrent workers share a process guard and publish each completed feed without waiting for a slower one.

The worker parses official Statuspage, Google Cloud, and Better Stack feeds without launching JavaScript. Requests use HTTPS, timeouts, and a 5 MiB response limit. Foreground readings also update native alert state and the widget. Preferences and successful alert signatures persist locally. Matching issues are not repeatedly notified; failed readings retain the deduplication signature and cannot fabricate a recovery. Component issues and active incidents can alert even when the provider aggregate is operational. Removed providers cannot alert after removal.

Enable alerts from Watchlist or Settings and grant Android notification permission. The foreground monitor shows a persistent Android system notification while it is active; delivery also requires system notification/channel permission. Android can still stop services under device restrictions, offline conditions, after force-stop, or after platform time limits. No FCM backend or cloud push service is configured.

The actual `PulseWidget` AppWidgetProvider uses RemoteViews, has a launcher entry and pin request, and supports resizing. It displays three prioritized services, reported issues, availability and dated snapshots; its refresh control queues an expedited, network-only worker. Every row carries its check time. Adding a widget also enables its background refresh even if alerts are off. Removing the last widget cancels work when alerts are also off. `updatePeriodMillis=0` avoids a second widget polling schedule. Tap the widget or a notification to open Watchlist. Android Java time APIs are desugared for the existing API 24 minimum.

## Windows

When alerts are enabled, closing the window hides Pulse to its tray. Tray commands open Pulse, open Watchlist, or quit. Quit ends monitoring. A context-isolated preload exposes only bounded configuration/status IPC; the main process validates the sender and provider IDs. Background sweeps reuse recent foreground readings and check watched feeds every 30 seconds. Suspend pauses checks; resume resumes them. Signatures and preferences persist in Electron's user-data directory. Windows notification settings and Focus Assist can suppress delivery. Starting automatically at Windows login is not configured.

## Verification and limits

- 35 Node tests cover feed interpretation, freshness, map evidence, alerts, request budgets, server/SSE behavior, and security utilities.
- Five Java tests cover native feed formats, malformed input, component/incident severity, and alert signatures.
- An isolated real Electron run verified preload availability, configuration IPC, persisted preferences, close-to-tray, disabling, and clean exit.
- Browser review covers focused pages, Phosphor icons, restored provider logos, dark/light appearance and mobile overflow.
- No Android device or emulator is connected. Physical launcher placement, notifications, Doze, reboot behavior, OEM scheduling and battery drain still require on-device testing. No battery-percentage claim is made.

References: [WorkManager scheduling](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work), [PeriodicWorkRequest timing limits](https://developer.android.com/reference/androidx/work/PeriodicWorkRequest), [WorkManager dependencies](https://developer.android.com/jetpack/androidx/releases/work).
