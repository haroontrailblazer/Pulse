# Pulse design system

One visual language across the website, the Android APK and the Windows EXE.
Mobile is the reference surface: every rule below is written for a phone first
and widened for a desktop window, not the other way round.

## Where things live

| File | Owns |
| --- | --- |
| `src/tokens.css` | Every colour, type step, spacing step, radius, elevation and layout constant, in both themes. Nothing else may declare a token. |
| `src/components.css` | Base typography and every reusable component. Loads last, so it settles the cascade. |
| `src/platform.css` | Android-only adjustments. Nothing that belongs to a breakpoint. |
| `src/styles.css`, `theme.css`, `map.css`, `live.css`, `security.css`, `background.css`, `insight-updates.css` | Layout and per-screen structure only. No type, no raw colour. |

Load order is `tokens → styles → theme → components → platform`. The feature
stylesheets are imported by the components that use them, so they resolve
before `components.css` and can be overridden by it.

`tests/design-tokens.test.js` enforces the contract: it fails the build if a
second stylesheet declares a token, if any stylesheet ships type below 12px, if
an icon is drawn at an off-scale size, or if a colour pair drops below its
contrast minimum.

## Colour

Colour is reserved for status. Chrome is neutral, and the accent is ink rather
than a hue, so a red or amber badge is the only saturated thing on the screen.

Surfaces step `--canvas → --surface → --surface-raised`, with `--surface-sunken`
for wells and `--surface-tile` for the tile behind a brand mark — a well recedes,
a tile has to let a dark logo read against it.

Each status has three tokens: a foreground (`--positive`), a container
(`--positive-bg`) and a container border (`--positive-line`), plus a separate
`--mark-positive` for dots, bars and glyphs. Text tokens clear 4.5:1 on every
surface they can land on; mark tokens clear 3:1. Both themes are verified.

Status is never carried by colour alone: every pill pairs a dot with a word, the
map uses distinct shapes per state (`StatusGlyph`), and the watchlist star
changes between filled and outlined as well as colour.

## Type

Mobile-first, with one step up above 760px. Nothing that carries meaning is
below 12px at any viewport. Inputs are 16px on phones so iOS does not zoom on
focus.

| Role | Phone | Desktop |
| --- | --- | --- |
| `--fs-display` | 30 | 36 |
| `--fs-title` (screen title, `h1`) | 22 | 28 |
| `--fs-section` (`h2`) | 17 | 18 |
| `--fs-card` (`h3`, list-row title) | 15 | 15 |
| `--fs-body` | 15 | 14 |
| `--fs-body-sm`, `--fs-label` | 13 | 13 / 12 |
| `--fs-caption`, `--fs-overline` | 12 | 12 |
| `--fs-button` | 15 | 14 |
| `--fs-input` | 16 | 14 |
| `--fs-metric` | 32 | 34 |

Manrope carries titles and numbers; DM Sans carries everything else.

Screen titles wrap. A headline that must stay on one line at 360px can only do
so by shrinking below a readable size, which is what produced a 15px screen
title in the previous design.

## Spacing, radius, elevation

Spacing is a 4px grid: `--space-1` (4) through `--space-9` (48). Radius has five
sized steps — `--radius-xs` 6, `sm` 8, `md` 12, `lg` 16, `xl` 20 — plus
`--radius-pill`. Cards use `lg`, controls `md`, indicators `pill`. Elevation has
three steps; shadows are quiet because borders do most of the separating.

Icons are drawn at four sizes and no others: 16 inline, 20 control, 24 section,
32 display.

## Touch

`--tap` is 44px and every standalone control meets it on both axes at phone
width. Where a control is small by platform convention — a checkbox, a switch —
the label or an invisible inset carries the target instead.

## Navigation

Six destinations. On a phone, a fixed bottom bar holds the four the product is
about (Overview, Incidents, Watchlist, Map) plus **More**, which opens the same
sidebar markup as a bottom sheet containing the two expert destinations,
watchlist shortcuts, help and settings. Above 760px the bar is hidden and the
sidebar is a permanent rail showing all six.

`--bottom-inset` is the height the page keeps clear for the bar. It is zero
above 760px, so the same padding rule serves both layouts.

## Components

Reusable, one definition each, in `components.css`:

`.button` (`.primary` / `.secondary` / `.full-width`), `.text-button`,
`.icon-button`, `.panel` + `.panel-heading`, `.summary-card`, `.insight-card`,
`.service-row`, `.incident-item`, `.status-pill`, `.state-dot`, `.count-label`,
`.search-input`, `select`, `.tabs`, `.modal` (a bottom sheet below 760px),
`.bottom-nav`, `.toast`, `.empty-state`, `.error-banner`, `.skeleton`,
`.provider-logo`.

## Images

Provider marks sit in a fixed-ratio tile with one border and one radius, at
28px inline, 40px in a row and 52px in a detail header. A provider with no
vector mark falls back to text sized to the same optical baseline, so a row of
marks never looks ragged. Three brand oranges are darkened in light mode to
clear 3:1 against the tile.

## States

Every list has a loading, empty and error state. Before the first sweep
completes the app shows skeletons, not 28 rows reading "Status unavailable" —
loading and total failure must not look the same. An empty watchlist gets its
own copy and a primary action rather than a filter-reset button.

## Verifying a change

```
npm test                          # includes the design-system contract
node scripts/check-responsive.mjs # structural contract at 390 / 1080 / 1440
node scripts/ui-audit.mjs         # type, targets, contrast, overflow: 9 screens x 3 widths x 2 themes
node scripts/capture-screens.mjs --out test-results/screens/after
```

The last two need a dev server on `127.0.0.1:5174` (`npm run dev -- --port 5174`)
or a `PULSE_QA_URL` pointing at one.
