# Pulse documentation

Pulse is one product built three ways from a single codebase: the hosted
website, an installed Windows application, and an Android APK. These pages
describe how that shared application behaves, where its readings come from, and
how each of the three surfaces is built, released and verified.

**Start here:** [the project README](../README.md) — what Pulse is, how to run
it locally, and a summary of what currently works.

## Using Pulse

| Document | What it covers |
| --- | --- |
| [Interface behaviour](interface.md) | Watchlist alerts and the Android home-screen widget, the incident inbox, Dependency insights, the contained map workspace, and the phone and APK layouts. |
| [Security utilities](security-utilities.md) | The OSV package advisory lookup, local JWT inspection, and local SHA-256 hashing — with what each one sends, and what it does not establish. |
| [Update notices and in-app installs](updates.md) | The once-a-day update check on the APK and the EXE, the verified manifest behind it, and how a new version is downloaded and installed inside Pulse. |

## How it works

| Document | What it covers |
| --- | --- |
| [Data boundaries and scope](data-boundaries.md) | What Pulse measures and deliberately does not, how each official cloud feed is read, and what the service bars and map colours actually represent. |
| [Monitoring API](monitoring-api.md) | The `/api/status` snapshot, the cooled-down refresh, the Server-Sent Events stream, and what production hosting has to keep running. |
| [Navigation and the back gesture](navigation.md) | Why one back press is unambiguous on all three surfaces, the route list in `shared/navigation.js`, and the navigation gates. |

## Building and shipping

| Document | What it covers |
| --- | --- |
| [Building Pulse](building.md) | Toolchain prerequisites, building the Windows EXE and the Android APK, and the three-surface release harness commands. |
| [Public website and deployment](deployment.md) | The marketing page and dashboard on Vercel, the bounded `/api/status` function, and how verified installers are staged on the CDN. |
| [AGENTS.md](../AGENTS.md) | The governing release sequence: version alignment, the native release gate, the draft GitHub release, and the production check. |
| [VERIFICATION.md](../VERIFICATION.md) | Dated verification notes recording what was observed on real devices and emulators, rather than assumed. |

## Design

| Document | What it covers |
| --- | --- |
| [Logo and brand assets](../design/README.md) | The Pulse mark, the vector and PNG files, usage rules, and the scripts that regenerate icons from shared geometry. |
| [Design system](../design/design-system.md) | One visual language across the three surfaces: which stylesheet owns tokens and which owns components, the load order, and the test that enforces both. |
| [Background monitoring and widget](../design/background-monitoring.md) | Foreground and background schedules, the request-budget calculation, the Android plugin and widget, and the limits of OS scheduling. |
| [Marketing assets](../design/marketing-assets.md) | Provenance of the landing-page screenshots and platform artwork, and how to regenerate and verify them. |

## Conventions

Every document here describes behaviour that is implemented in this repository.
Where something is not built — historical uptime, latency monitoring, accounts,
cloud push — it is named as absent rather than left to be assumed.

Every reading comes from an official, provider-published feed. Pulse is
independent of the companies it lists, runs no probes of its own, and implies no
endorsement.

A feed that fails, times out or returns an unsupported format is reported
**unavailable**. It is never presented as healthy, and a stale reading is
excluded from current health and incident counts rather than counted as good.
