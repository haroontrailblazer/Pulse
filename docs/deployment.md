# Public website and deployment

## Public website and Vercel

The public entry point is a marketing page explaining Pulse, with actual app screenshots, an interactive feature tour, and web-first platform choices. On Vercel, / serves the marketing index and /app serves dashboard.html. The web build promotes landing.html to dist/index.html and preserves the dashboard as dist/dashboard.html. Preview the landing locally at /landing.html. Run npm run build:web for the hosted build; regular npm run build remains the native dashboard build and excludes marketing images.

Vercel serves /api/status as a bounded Node function. The hosted dashboard polls every 30 seconds while visible and pauses when hidden. Responses can be shared by the CDN for 30 seconds; freshness checks still exclude outdated readings. Native builds retain their existing local server or direct Android transport. No database or cross-device account system is introduced.

Download links in both the landing page and dashboard point to versioned static files under https://www.pulses4u.in/downloads/v1.0.15, defined in shared/downloads.js. The deployment command `npm run build:deploy` fetches the published release once, verifies byte counts and SHA-256 against shared/release-assets.json, and stages the installers on the website CDN. Users download directly from that CDN; no runtime GitHub proxy or serverless function handles the file transfer. The APK and the Windows application include the compact sidebar and smaller wordmark, the desktop Overview in a portrait-monitor arrangement, Android-safe page spacing, complete live incident lists, location-scoped map evidence, component-health bars in a fixed-height, internally scrollable service directory, and a map-aligned live-incidents card with an internal list. See [../design/marketing-assets.md](../design/marketing-assets.md) for artwork provenance and screenshot details.

