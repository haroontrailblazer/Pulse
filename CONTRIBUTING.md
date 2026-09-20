# Contributing to Pulse

Thanks for looking. A few honest expectations before you spend your time.

Pulse is maintained by one person, so reviews arrive when they arrive, and a
change that does not fit the shape of the project may be declined even if it is
well written. Small, self-contained pull requests — a typo, a clear bug, a
documentation correction — are welcome without warning. **For anything larger,
open an issue first** and describe what you want to change and why. Agreeing on
the approach before the work is the cheapest step in the process.

Bug reports and feature ideas belong in
[issues](https://github.com/haroontrailblazer/Pulse/issues). Security problems do
not: report those privately, as described in [SECURITY.md](SECURITY.md).

## Development setup

You need **Node.js 22.12 or newer** (development happens on Node 24).

```bash
npm ci
npm run dev
```

That serves the dashboard with Vite. `npm run desktop` builds and opens the
Electron app.

Working on the Android surface additionally needs **JDK 21** and **Android
SDK 36**; the minimum supported platform is **API 24 (Android 7.0)**. The setup,
the toolchain layout and the build commands are in
[docs/building.md](docs/building.md) — read that rather than guessing, and I have
not repeated it here so there is only one copy to keep correct.

## The gates a change has to pass

### 1. The tests

```bash
npm run build   # tests/status.test.js serves from dist/, which is not tracked
npm test
```

That runs `node --test tests/*.test.js` — 20 test files, pure Node, no Electron
or Playwright binaries required. The build step comes first because the
production-server test resolves requests against `dist/`; on a fresh clone that
directory does not exist yet, and the test fails 404 without it. New behaviour should arrive with a test; a fixed
bug should arrive with the test that would have caught it.

### 2. The three-surface rule

This is the important one, and it is what most surprises new contributors.

Pulse is one product implemented three ways: the hosted website, the Capacitor
Android APK and the portable Electron Windows EXE. A change to **application
code, native code, shared code, branding, build configuration or runtime
behaviour is a three-surface delivery**. It is not done when the website looks
right.

For ordinary local work, this builds and verifies all three artifacts without
installing or opening the native apps:

```powershell
node scripts/release-harness.mjs prepare
```

The full rules — the release sequence, the native launch gate, what may and may
not be staged, and the production verification — live in
[AGENTS.md](AGENTS.md). Read it before you touch anything under `android/`,
`desktop/`, `shared/` or `scripts/`. I have deliberately not restated the release
sequence here; AGENTS.md is the single source for it.

If your change really is web-only, say so explicitly in the pull request and
explain why, so the omission is a decision rather than an oversight.

## Never commit

- **Generated binaries** — `releases/`, `public/downloads/`, `dist/`. Installers
  are published to the GitHub release and mirrored by the deployment; they are not
  stored in git.
- **Signing keys** — `*.jks`, `*.keystore`, and anything under `.cache/`.
- **Environment files** — `.env` and `.env.*`.

All of the above are in `.gitignore`. If one of them turns up in `git status`,
something has gone wrong; stop and work out what before committing.

## Style

Match the surrounding code. Prettier is a dev dependency and most of the tree
follows its defaults, but a few files do not — format the code you are adding to
match the file you are editing, and do not reformat unrelated code in the same
pull request. A diff that is mostly whitespace is a diff nobody can review.

Commit messages use a short imperative subject line, matching the existing log:

```text
Release v1.0.22
Download and install the update inside Pulse
Give the installed-apps section a measure and a frame
```

No prefixes, no trailing full stop. If the change needs explanation, put it in
the body after a blank line.

The project's prose — documentation, interface copy, release notes — is calm,
precise and factual. Match it. Claims about behaviour should be things the code
actually does.

## Licensing

Pulse is released under the Apache License 2.0; see [LICENSE](LICENSE).
Contributions are accepted under the same licence. You keep the copyright in your
contribution — by opening a pull request you agree that it is licensed under
Apache-2.0, on the terms in section 5 of that licence. There is no separate
contributor licence agreement to sign.

Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).
