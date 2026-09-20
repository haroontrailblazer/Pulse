# Data boundaries and scope

What Pulse measures, what it deliberately does not, and how each official feed is read.

## Data boundaries

Pulse is independent of the companies listed. It reports provider-published health, not independent availability measurements. Failed or unsupported feeds are **unavailable**, never assumed healthy. AWS uses the public Health Dashboard current-events feed, Azure uses its public RSS feed, Google Cloud uses its incident JSON feed, and Replicate is scoped to its component on Cloudflare Status. These cloud feeds exclude account-specific health events. Other feeds can fail temporarily or change their API format.

The web/desktop monitor streams each provider result over Server-Sent Events as it completes. Android runs the same monitoring engine through native HTTP. Each request has a 15-second timeout. Automatic sweeps start every 30 seconds without overlapping; provider publishing delays still apply. Counts cover this catalog only. Source timestamps are shown separately from retrieval timestamps. A provider can report operational while still listing an incident; inspect the specific incident and components.

Failed checks preserve the last verified context, mark it **stale**, and exclude it from current health and active incident totals. Readings also expire from current counts after five minutes without successful verification. Feed-request duration is not product API latency. Replicate currently returns an unsupported HTML page at the expected feed endpoint and is explicitly unavailable.

The Changes tab records real baseline, status, component, incident, and verification events observed by this running monitor. It keeps up to 250 events in memory. Server/app restart resets the history; it does not claim historical uptime or persistent monitoring while the app/server is stopped.

## Scope of status data

Service bars use the same 12-slot, 15-minute window of collected official readings for every provider. An unmeasured slot is gray; Google Cloud and Azure use their official provider aggregate because their public feeds do not expose component lists. The bars are not an uptime percentage or independent probe. Historical availability, latency monitoring, server-push alerts, user accounts, cloud watchlist sync, billing, and verified company-to-company dependency data are not implemented.

Map positions are reference hubs. Colors summarize fresh components whose names explicitly include a supported location; city word boundaries and accent normalization prevent broad substring matches. Provider-wide status and active incident impact contribute to the separate service issue list, never inferred city pins. Incident body text, headquarters locations, and broad region labels are not used to place outages. Stale or unknown providers are excluded, so an unavailable pin is not an all-clear. Regional operational signals describe only matched components, not every service in a city. Source component names and check ages are available in the map evidence panel. Industry relationships describe potential service relevance, not established customer dependencies, confirmed downstream outages, revenue losses, or economic-impact estimates.

## Official cloud feeds (1.0.4)

Replicate now follows its `fvgfcmy66tdr` component on Cloudflare Status, after the old Replicate status domain migrated. Unrelated Cloudflare incidents are excluded. AWS uses the public dashboard's `/public/currentevents` endpoint, with BOM-aware UTF-16 decoding, regional incident details, and resolved-event filtering. Azure uses the official RSS feed with validated XML and public-advisory coverage. Google Cloud retains its official JSON feed; transient requests can retry once within the existing 15-second request budget, and explicit `SERVICE_OUTAGE` updates now retain outage severity.

The foreground Android bridge and background worker share the same allowlisted, BOM-aware HTTP reader. The widget/background parser supports all four formats. Checks still pause in hidden browser tabs; polling intervals are unchanged. Public cloud status does not cover private account-specific events. Upstream errors remain unavailable rather than becoming a false all-clear.

Validation: 61 Node tests; 8 Android feed tests plus the existing example test; live official-feed checks for all four providers. The installed widget/notification experience still requires physical-device testing.
