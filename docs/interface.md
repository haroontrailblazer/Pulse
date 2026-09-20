# Interface behaviour

How individual surfaces of the product behave: alerts, the incident inbox, the map, and the phone layout.

## Watchlist alerts and Android home-screen widget

Open **Settings → Enable alerts**, or use **Enable alerts** beside Refresh on Overview. Android requests notification permission and keeps a visible foreground-monitor notification while it checks the watched feeds after the app closes; its interval is calculated from the watchlist, from 30 seconds to five minutes. The widget keeps a 15-minute Android-scheduled fallback. Windows keeps Pulse in the tray and checks watched feeds every 30 seconds. They notify on newly observed issues and deduplicate unchanged incidents. These are local notifications, not instant cloud push. Quit on Windows and force-stop on Android stop monitoring. The browser pauses its collector connection when hidden.

In the APK, choose **Settings → Add widget**, then confirm with your launcher. Alternatively, long-press your Android home screen, choose Widgets, and select **Pulse · My stack**. The native, resizable widget shows prioritized watched services, issue counts, dated readings and a refresh control. Tapping it opens Watchlist. Widget updates work independently of notification permission.

The full developer console now lives on **Developer tools**. Overview has the overall summary; Global map, Incidents, Dependency insights and Watchlist no longer repeat that console or overall summary. Watchlist filters and totals are scoped to watched services. Unavailable feeds remain explicitly unavailable, never implicitly healthy.

UI icons use [Phosphor](https://github.com/phosphor-icons/react). Provider marks identify their respective owners: the OpenAI Blossom, AWS and Twilio vectors come from Simple Icons 14.15.0; Azure from 12.0.0; other provider marks use the installed Simple Icons collection. OpenAI is rendered in monochrome in accordance with its [brand guidance](https://openai.com/brand/). Pulse is independent and these marks imply no endorsement.

See [background-monitoring.md](../design/background-monitoring.md) for the request-budget calculation, scheduling architecture and device-testing limits.

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

