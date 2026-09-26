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

// The payload is delimited text, not JSON inside base64, and that is a size
// decision rather than a style one. Watching every service in the catalogue came
// to 1,104 characters as JSON-then-base64 -- past what any QR version this product
// will draw can hold, so the one reader who wants their whole stack on a second
// device was the one reader who could not scan it. The same watchlist is 656
// characters here: base64 was adding 35% to carry bytes that were already safe
// text, and JSON was adding another 250 in quotes, braces and colons.
//
// The separators are chosen so nothing that travels can contain them. Provider ids
// are lowercase letters, digits and hyphens. A normalised custom address is a bare
// https origin, so it has no semicolon, comma or pipe in it either. Names are
// arbitrary text a reader typed, so those are percent-encoded, and
// encodeURIComponent escapes all three separators -- which is why the separators
// are these three and not the tilde or bang it leaves alone.
const FIELD = ";";
const LIST = ",";
// A dollar, not a pipe, and the reason is the link form below. All three of these
// have to be escaped by encodeURIComponent, so a name can never contain one, and
// all three have to be legal in a URI query, so the code can be carried in a link
// without escaping. A pipe satisfies the first and fails the second, and escaping
// it to %7C is ambiguous on the way back: an encoded name legitimately contains
// %7C, so unescaping every occurrence corrupts the name and breaks the seal --
// measured, not predicted. A dollar satisfies both, and no hostname contains one.
const PAIR = "$";

// What the square actually holds. A camera pointed at a bare code shows a reader
// some text; pointed at this, a phone with Pulse installed offers to open it, and
// the code arrives already in the field.
//
// A private scheme rather than an https link, and that is a privacy decision, not
// a convenience one. An https link would work in any browser -- but it would put
// the reader's entire watchlist in a request line, where it reaches a server and
// its logs, and is kept in browser history. This product tells readers their
// watchlist is never sent anywhere, so the one mechanism that would break that
// promise is the one mechanism it does not use. A private scheme is resolved
// entirely on the device.
//
// Nothing is escaped, because the separators were chosen so nothing needs to be.
// Percent-encoding the whole code instead would mean decoding it twice on the way
// back -- names inside are already encoded -- and would add about 150 characters to
// a full watchlist for no benefit.
const SCHEME = "pulse://transfer?c=";

export function transferLink(code) {
  return SCHEME + String(code);
}

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
  const ids = [
    ...new Set(watchlist.filter((id) => typeof id === "string" && id)),
  ].join(LIST);
  const pages = custom
    .filter((provider) => provider?.url)
    .map(
      (provider) =>
        `${provider.url}${PAIR}${encodeURIComponent(provider.name || "")}`,
    )
    .join(LIST);
  const body = `${ids}${FIELD}${pages}`;
  return `${TAG}${FIELD}${body}${FIELD}${checksum(body)}`;
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
  let trimmed = String(text ?? "")
    .trim()
    .replace(/\s+/g, "");
  if (!trimmed) throw new Error("Paste a Pulse transfer code.");

  // A reader whose phone cannot open the scheme still sees the link as text, and
  // copying that is the obvious thing to do with it. So the link form is accepted
  // wherever a code is: refusing it would punish exactly the reader the square was
  // drawn for.
  if (trimmed.toLowerCase().startsWith(SCHEME))
    trimmed = trimmed.slice(SCHEME.length);

  const parts = trimmed.split(FIELD);
  if (!parts[0].startsWith("PULSE"))
    throw new Error("That is not a Pulse transfer code.");
  // Losing the tail is the likeliest corruption, and it takes the seal with it.
  // Telling a reader who clearly has a Pulse code that they do not have one
  // sends them looking for the wrong problem.
  if (parts.length !== 4)
    throw new Error(
      "That code is incomplete. Copy the whole of it and paste it again.",
    );

  const [tag, ids, pages, seal] = parts;
  if (tag !== TAG)
    throw new Error(
      `That code was made by a different version of Pulse (${tag}). Update both, then try again.`,
    );
  if (seal !== checksum(`${ids}${FIELD}${pages}`))
    throw new Error(
      "That code is incomplete. Copy the whole of it and paste it again.",
    );

  const wanted = [...new Set(ids.split(LIST).filter(Boolean))].slice(
    0,
    MAX_ENTRIES,
  );
  // No `known` set given means the caller cannot tell, so nothing is dropped.
  const recognised = known ? new Set(known) : null;
  const watchlist = recognised
    ? wanted.filter((id) => recognised.has(id))
    : wanted;
  const unknown = wanted.length - watchlist.length;

  const custom = [];
  let refused = 0;
  for (const entry of pages.split(LIST).filter(Boolean).slice(0, MAX_ENTRIES)) {
    const split = entry.indexOf(PAIR);
    const url = split === -1 ? entry : entry.slice(0, split);
    const name = split === -1 ? "" : entry.slice(split + 1);
    try {
      // Through makeCustomProvider rather than trusted: this is the same guard
      // the paste field uses, so an imported code cannot introduce an http or
      // otherwise unusable address that a typed one would have been refused.
      custom.push(
        makeCustomProvider(normalizeCustomUrl(url), {
          name: decodeURIComponent(name),
        }),
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
