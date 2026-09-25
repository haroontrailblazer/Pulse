// A provider the reader added themselves, by pasting their vendor's status page.
//
// This module is pure and lives in shared/ rather than src/ for one reason: the
// Windows tray monitor and the Android background worker will eventually need
// the same derivation, and a second implementation that disagreed about what an
// id is would split a reader's stored readings in half. Nothing here touches the
// catalog array, so every test that pins the built-in count stays green.
//
// Seventy of the seventy-seven built-in feeds are Statuspage, and `feedUrl` and
// `normalizeFeed` already read nothing but `url`, `endpoint` and `format`. So a
// custom provider needs no new parsing and no new format value - deliberately
// no `format` at all, because the default branch of normalizeFeed IS the
// Statuspage path, and tests/cloud-feeds.test.js pins the legal format set.

export const CUSTOM_PREFIX = "custom:";

// Statuspage publishes its machine-readable summary at a fixed path. A reader is
// as likely to paste that as the page itself, so both are accepted and reduced
// to the origin the catalog stores.
const SUMMARY_PATH = "/api/v2/summary.json";

/**
 * Reduce whatever the reader pasted to a bare https origin, or throw with a
 * reason they can act on. Two spellings of the same feed must reduce to one
 * string, because the id is derived from it.
 */
export function normalizeCustomUrl(input) {
  const text = String(input ?? "").trim();
  if (!text) throw new Error("Paste the https address of a status page.");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`"${text}" is not a web address. Paste the https status page URL.`);
  }
  // https only. Inside the EXE the renderer is served over http from
  // 127.0.0.1:47823, so an http feed would load there and be refused as mixed
  // content on the hosted site - the same provider silently working on one
  // surface and not another is worse than refusing it in both.
  if (url.protocol !== "https:")
    throw new Error(
      `Pulse reads status pages over https. "${url.protocol}//" is not supported.`,
    );
  if (!url.hostname.includes("."))
    throw new Error(`"${url.hostname}" is not a full domain name.`);
  let path = url.pathname.replace(/\/+$/, "");
  if (path.toLowerCase().endsWith(SUMMARY_PATH))
    path = path.slice(0, -SUMMARY_PATH.length);
  // Hostnames are case-insensitive and the URL parser has already lowercased
  // them; the search and hash never identify a feed.
  return `${url.origin}${path}`;
}

/**
 * A stable id for a normalized URL.
 *
 * Derived from the URL rather than allocated, so the same feed added on the
 * phone and on the desktop is one provider, and so it survives a reinstall -
 * which is what keeps alerts and the inbox open as a later slice, since both
 * join on provider id.
 *
 * The `custom:` prefix is load-bearing. scripts/generate-native-catalog.mjs
 * refuses any id outside /^[a-z][a-z0-9_]*$/, so the colon makes it structurally
 * impossible for a reader's provider to reach the APK's generated catalog or its
 * compiled drawables, rather than relying on anyone remembering to filter.
 */
export function customProviderId(normalizedUrl) {
  // FNV-1a, 32-bit. Not a cryptographic choice: this only has to be stable,
  // short, and identical in JavaScript and in Java when the native tiers arrive.
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalizedUrl.length; i++) {
    hash ^= normalizedUrl.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${CUSTOM_PREFIX}${hash.toString(36).padStart(7, "0")}`;
}

// A neutral mark colour. The catalog's colours are brand colours and there is no
// brand to read here; design-tokens' contrast test covers the built-ins against
// --surface-tile, and this grey clears the same 3:1 bar in both themes.
const DEFAULT_COLOR = "#6b7280";

/**
 * Build the provider object. It is deliberately the same shape as a catalog row,
 * because normalizeSummary returns `{ ...provider, status, ... }` - so a custom
 * reading is shape-identical to a built-in one and needs no new type anywhere
 * downstream.
 */
export function makeCustomProvider(input, { name, color } = {}) {
  const url = normalizeCustomUrl(input);
  const host = new URL(url).hostname;
  const given = String(name ?? "").trim();
  return {
    id: customProviderId(url),
    name: given || host,
    product: "Added by you",
    category: "Your services",
    url,
    mark: (given || host).slice(0, 2).toUpperCase(),
    color: color || DEFAULT_COLOR,
    // Required, not decorative: src/App.jsx and shared/insights.js both call
    // p.industries.includes(...) with no guard, so an absent array is a white
    // screen rather than a missing filter.
    industries: [],
    // The discriminator, carried on the provider itself. normalizeSummary's
    // `...provider` spread means it survives into every reading, so anything
    // downstream can tell a reader's provider from a catalog one without
    // consulting a second list.
    custom: true,
  };
}

// The browser path does not inherit the server's guards, so they are restated.
// server/status.js refuses a text/html body with almost these words; a reader
// who pastes their vendor's marketing page should be told that, not shown a
// parse error.
const MAX_FEED_BYTES = 5_000_000;

export function refuseUnusableFeed({ ok, status, contentType, bytes }) {
  if (!ok) throw new Error(`Status page returned HTTP ${status}`);
  if (String(contentType ?? "").includes("text/html"))
    throw new Error(
      "That URL returned a web page instead of a status feed. Most vendors publish one at /api/v2/summary.json.",
    );
  if (Number(bytes) > MAX_FEED_BYTES)
    throw new Error("That status feed is too large to read.");
}

export { MAX_FEED_BYTES };
