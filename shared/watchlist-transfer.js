// Moving a watchlist between surfaces without an account.
//
// Pulse has no sign-in and no server-side per-reader state, on purpose, which
// leaves a reader who runs the EXE and the APK maintaining two watchlists by
// hand. This turns the two things that are genuinely theirs -- which of the
// built-in services they watch, and which status pages they added -- into one
// short string they can carry across themselves: copy it, paste it, scan it.
//
// Deliberately not a sync protocol. There is no server, no clock and no conflict
// resolution here: a code is a snapshot of one device at one moment, and applying
// it merges into the other device rather than overwriting it, because a reader
// who pastes a code from their laptop has not asked to lose what they starred on
// their phone.

import { makeCustomProvider, normalizeCustomUrl } from "./custom-providers.js";

// Bumped only for a change the previous reader cannot understand. An older build
// refusing a newer code by name is a far better failure than it silently keeping
// the half it recognises.
const VERSION = 1;
const TAG = `PULSE${VERSION}`;
// A watchlist is a reader's own shortlist, not a catalogue. The cap is here so a
// hand-edited or hostile code cannot make the importing app allocate without
// bound, not because anyone will reach it.
const MAX_ENTRIES = 300;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// btoa/atob are latin1, and a provider name can be any script the vendor uses,
// so the bytes go through TextEncoder first and travel as a binary string. Both
// globals exist in Node 22 and in every browser this ships to, which keeps this
// module usable from the test suite and the bundle without a polyfill.
const toBase64Url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const fromBase64Url = (text) => {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

// FNV-1a, six base36 characters. This is a smudge detector, not a signature: it
// catches the realistic failure, which is a code that got truncated by a text
// field, a line wrap or a partial selection, and reports it as "incomplete"
// instead of quietly importing whatever survived.
function checksum(text) {
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(6, "0").slice(-6);
}

/**
 * Build the code for this device's watchlist and added pages.
 *
 * Custom providers travel as url and name only. Everything else about them --
 * id, mark, colour, category -- is derived, so carrying it would be carrying a
 * copy of makeCustomProvider's output that could disagree with the build that
 * reads it.
 */
export function encodeTransfer({ watchlist = [], custom = [] } = {}) {
  const payload = {
    v: VERSION,
    w: [...new Set(watchlist.filter((id) => typeof id === "string" && id))],
    c: custom
      .filter((provider) => provider?.url)
      .map((provider) => ({ u: provider.url, n: provider.name || "" })),
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${TAG}.${body}.${checksum(body)}`;
}

/**
 * Read a code back, or throw with a sentence meant for a reader.
 *
 * `known` is the set of ids this build actually has. Ids outside it are reported
 * rather than imported: a code from a newer catalogue naming a service this build
 * does not carry would otherwise put a permanently unknown row on the reader's
 * watchlist, which looks like a broken app rather than a version difference.
 */
export function decodeTransfer(text, known) {
  const trimmed = String(text ?? "")
    .trim()
    .replace(/\s+/g, "");
  if (!trimmed) throw new Error("Paste a Pulse transfer code.");

  const parts = trimmed.split(".");
  if (!parts[0].startsWith("PULSE"))
    throw new Error("That is not a Pulse transfer code.");
  // Losing the tail is the likeliest corruption, and it takes the seal with it.
  // Telling a reader who clearly has a Pulse code that they do not have one
  // sends them looking for the wrong problem.
  if (parts.length !== 3)
    throw new Error(
      "That code is incomplete. Copy the whole of it and paste it again.",
    );

  const [tag, body, seal] = parts;
  if (tag !== TAG)
    throw new Error(
      `That code was made by a different version of Pulse (${tag}). Update both, then try again.`,
    );
  if (seal !== checksum(body))
    throw new Error(
      "That code is incomplete. Copy the whole of it and paste it again.",
    );

  let payload;
  try {
    payload = JSON.parse(decoder.decode(fromBase64Url(body)));
  } catch {
    throw new Error("That code could not be read.");
  }
  if (
    payload?.v !== VERSION ||
    !Array.isArray(payload.w) ||
    !Array.isArray(payload.c)
  )
    throw new Error("That code could not be read.");

  const wanted = [
    ...new Set(payload.w.filter((id) => typeof id === "string" && id)),
  ].slice(0, MAX_ENTRIES);
  // No `known` set given means the caller cannot tell, so nothing is dropped.
  const recognised = known ? new Set(known) : null;
  const watchlist = recognised
    ? wanted.filter((id) => recognised.has(id))
    : wanted;
  const unknown = wanted.length - watchlist.length;

  const custom = [];
  let refused = 0;
  for (const entry of payload.c.slice(0, MAX_ENTRIES)) {
    try {
      // Through makeCustomProvider rather than trusted: this is the same guard
      // the paste field uses, so an imported code cannot introduce an http or
      // otherwise unusable address that a typed one would have been refused.
      custom.push(
        makeCustomProvider(normalizeCustomUrl(entry?.u), { name: entry?.n }),
      );
    } catch {
      refused += 1;
    }
  }

  if (!watchlist.length && !custom.length && !unknown && !refused)
    throw new Error("That code is empty.");

  return { watchlist, custom, unknown, refused };
}

/**
 * What a reader is told before anything changes, counted against what they have.
 *
 * Merge, never replace: `added` is what this device does not already have, so a
 * code carrying fewer services than the device it lands on takes nothing away.
 */
export function describeTransfer(incoming, current = {}) {
  const have = new Set(current.watchlist || []);
  const haveCustom = new Set((current.custom || []).map((p) => p.url));
  return {
    services: incoming.watchlist.filter((id) => !have.has(id)).length,
    pages: incoming.custom.filter((p) => !haveCustom.has(p.url)).length,
    unknown: incoming.unknown,
    refused: incoming.refused,
  };
}
