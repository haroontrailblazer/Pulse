# Security policy

Pulse is maintained by one person. This document says how to report a security
problem privately, what is realistically in scope, and which properties of the
project are deliberate rather than defects.

## Supported versions

Only the latest published release receives fixes. There are no long-term support
branches and older releases are not patched. Because all three surfaces are built
from one codebase, a fix reaches the website, the Android APK and the Windows EXE
in the same release.

| Version | Supported |
| --- | --- |
| 1.0.22 (latest) | Yes |
| Earlier than 1.0.22 | No |

No installed copy earlier than 1.0.22 can tell you that a newer Pulse exists.
Builds before 1.0.21 have no update check at all; 1.0.21 added one, but compiled in
the `pulse-status-zeta.vercel.app` manifest host, which stopped answering when Pulse
moved to its own domain in 1.0.22. Download the current installer by hand from
<https://www.pulses4u.in/#download>.

## Reporting a vulnerability

Report privately through GitHub Security Advisories:

**<https://github.com/haroontrailblazer/Pulse/security/advisories/new>**

That is the primary channel. **Please do not open a public issue, discussion or
pull request for a suspected vulnerability**, and please do not post a proof of
concept publicly before a fix is available.

Include, as far as you can:

- Which surface is affected — the hosted website, the Android APK, the Windows
  EXE — and the version you tested.
- What an attacker gains, stated concretely.
- Steps to reproduce, with a minimal proof of concept if you have one.
- Environment: operating system and version, Android version and device, browser.
- Whether you have disclosed this anywhere else, and any deadline you intend to
  keep to.

### What to expect

This is a solo-maintained project, so the timings below are honest rather than
contractual:

- **Acknowledgement within a few days.** If a week passes with no reply, a
  comment on the advisory to nudge it is welcome.
- **No bounty programme.** There is no payment, and no swag.
- **Credit in the published advisory if you want it.** Tell me the name or handle
  to use; if you would rather not be named, that is respected.
- A fix ships through the ordinary three-surface release gate described in
  [AGENTS.md](AGENTS.md), and the advisory is published once the installers are
  public.

## Scope

### In scope

- **The Electron main, preload and IPC surface** under `desktop/`. Every
  `ipcMain` handler in `desktop/main.cjs` runs a trusted-sender check that
  rejects a message whose sender frame is not the main window's frame or whose
  origin does not match the window's. A way past that check, or a way to reach
  privileged behaviour through the preload bridge, is in scope.
- **The local status server the portable EXE runs**, bound to `127.0.0.1:47823`.
- **The Android self-update path.** Pulse asks for `REQUEST_INSTALL_PACKAGES`,
  verifies the downloaded archive's byte count and SHA-256 against the published
  manifest, hashes the bytes a second time as they are written into the
  `PackageInstaller` session, and — on API 28 and above — refuses an archive whose
  signing certificate does not match the installed app. On API 24-27 there is no
  `GET_SIGNING_CERTIFICATES` to compare, so that refusal falls to the platform. A way to get unverified or substituted bytes
  installed is in scope.
- **The update manifest** at `https://www.pulses4u.in/latest.json` and the code on
  both native surfaces that reads it, including the deliberate refusal to follow
  redirects.
- **Download checksum verification** in `scripts/prepare-downloads.mjs`, which
  refuses to publish an installer whose size or SHA-256 does not match
  `shared/release-assets.json`.
- **Path traversal or arbitrary file read in the production static server**
  (`server/index.js`), which resolves each request against the built `dist/`
  directory and refuses anything that escapes it.
- A parsing flaw in Pulse that a hostile or malformed provider feed response could
  exploit — the feed content itself is out of scope, but our handling of it is not.

### Out of scope

- **The third-party provider status feeds Pulse reads.** Pulse aggregates official
  provider-published feeds and reports what they say. Their content, accuracy and
  availability belong to those providers. A feed that is wrong, stale or offline
  is a provider matter, not a Pulse vulnerability. Report feed problems upstream.
- **The unsigned Windows EXE and the debug-signed Android APK.** This is a known,
  documented property of how Pulse is distributed, recorded in
  [docs/building.md](docs/building.md) and [docs/updates.md](docs/updates.md) —
  not a finding. Reports amounting to
  "SmartScreen warns about this executable" or "the APK is not signed with a
  release key" will be closed as known.
- **Anything requiring physical access to an unlocked device**, or an attacker who
  can already run code as the user on that machine.
- Automated scanner output with no demonstrated impact on this codebase.

## Security design notes

These are properties of the product, useful context before you test:

- **No accounts, no telemetry, no database.** There is no sign-in, no server-side
  user record and no persistent store of reader activity. Status readings are held
  in memory and reset when the server or app restarts.
- **The watchlist is local to the device.** Cloud watchlist sync is not
  implemented; there is nothing server-side to breach.
- **The security utilities are local-only**, as described in
  [docs/security-utilities.md](docs/security-utilities.md). JWT inspection decodes
  the header and claims in the browser and **does not verify signatures, issuers or
  audiences — that is by design**; it flags unsigned or malformed tokens, does not
  support encrypted tokens (JWE), and neither persists nor transmits the token
  text. SHA-256 hashing uses Web Crypto locally over text or a file up to 10 MB;
  the file is never uploaded.
- **Package advisory lookups send the minimum.** An OSV query carries only the
  package name, its ecosystem, the exact version and pagination tokens. No project
  files are uploaded. It is a single-package query, not a dependency-tree scan, and
  no matches does not establish that a package is safe.
- **Native network paths refuse redirects on purpose.** `PulseUpdateWorker` and
  `PulseDownload` both set `setInstanceFollowRedirects(false)` and
  `desktop/background.cjs` fetches with `redirect: "error"`, so a build must read
  the exact host that answers `200`. A host that answers `308` fails the check
  rather than following it.
