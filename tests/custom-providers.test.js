import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOM_PREFIX,
  categoryOptions,
  customProviderId,
  isCustomId,
  makeCustomProvider,
  nativeWatchlist,
  normalizeCustomUrl,
  refuseUnusableFeed,
} from "../shared/custom-providers.js";
import { categories, feedUrl, providers } from "../shared/providers.js";

// A reader pastes whatever their vendor's status page shows them. Everything
// here is about turning that into something the existing pipeline already knows
// how to read, or refusing it with a reason they can act on.

test("a pasted status page becomes the summary endpoint the parser expects", () => {
  const p = makeCustomProvider("https://status.example.com");
  // feedUrl is the catalog's own function and reads only url/endpoint, so a
  // custom provider needs no catalog-only field to be fetchable.
  assert.equal(feedUrl(p), "https://status.example.com/api/v2/summary.json");
});

test("the URL is normalised before anything is derived from it", () => {
  // Trailing slashes, whitespace, case in the host, and a pasted summary.json
  // path all describe the same feed and must not produce different providers.
  const forms = [
    "https://status.example.com",
    "  https://status.example.com/  ",
    "https://STATUS.example.com",
    "https://status.example.com/api/v2/summary.json",
    "https://status.example.com/#anchor",
  ];
  const [first, ...rest] = forms.map(normalizeCustomUrl);
  assert.equal(first, "https://status.example.com");
  for (const other of rest) assert.equal(other, first);
});

test("the same page pasted twice is the same provider, a different page is not", () => {
  const a = customProviderId(normalizeCustomUrl("https://status.example.com/"));
  const b = customProviderId(normalizeCustomUrl("https://status.example.com"));
  const c = customProviderId(normalizeCustomUrl("https://status.other.com"));
  assert.equal(a, b, "one feed, one id - so re-adding updates rather than duplicates");
  assert.notEqual(a, c);
});

test("a custom id can never reach the Android codegen or collide with a built-in", () => {
  const id = customProviderId(normalizeCustomUrl("https://status.example.com"));
  assert.ok(id.startsWith(CUSTOM_PREFIX));
  // scripts/generate-native-catalog.mjs refuses any id outside this pattern, so
  // the prefix is what makes it structurally impossible for a reader's provider
  // to be compiled into the APK's drawables and catalog asset.
  assert.doesNotMatch(id, /^[a-z][a-z0-9_]*$/);
  assert.ok(
    !providers.some((p) => p.id === id),
    "a custom id must not collide with a catalog id",
  );
  // The inbox persists read state under `<providerId>:<incidentId>`, so the id
  // itself must not introduce a second separator that breaks that key.
  assert.equal(id.split(":").length, 2);
});

test("a custom provider carries every field the interface reads without guarding", () => {
  const p = makeCustomProvider("https://status.example.com", { name: "Example" });
  // src/App.jsx and shared/insights.js both call p.industries.includes(...)
  // unguarded; omitting it white-screens the Overview rather than degrading.
  assert.ok(Array.isArray(p.industries));
  assert.equal(typeof p.name, "string");
  assert.ok(p.name.length > 0);
  assert.equal(typeof p.color, "string");
  assert.match(p.color, /^#[0-9a-f]{6}$/i);
  assert.equal(p.custom, true);
  // No `format`: tests/cloud-feeds.test.js pins the legal format values, and the
  // default path through normalizeFeed is exactly the Statuspage one we want.
  assert.equal(p.format, undefined);
});

test("a name is derived from the host when the reader gives none", () => {
  assert.equal(makeCustomProvider("https://status.example.com").name, "status.example.com");
  assert.equal(
    makeCustomProvider("https://status.example.com", { name: "  Example Co  " }).name,
    "Example Co",
  );
});

test("anything that is not an https page is refused, with a reason", () => {
  for (const bad of [
    "",
    "   ",
    "not a url",
    "ftp://status.example.com",
    "javascript:alert(1)",
    "file:///etc/passwd",
  ])
    assert.throws(() => normalizeCustomUrl(bad), /https/i, `accepted ${JSON.stringify(bad)}`);
});

test("http is refused rather than silently working in one surface only", () => {
  // Inside the EXE the renderer is http://127.0.0.1:47823, so an http feed would
  // load there and be blocked as mixed content on the website. Refusing it keeps
  // the three surfaces honest with each other.
  assert.throws(() => normalizeCustomUrl("http://status.example.com"), /https/i);
});

test("a web page served where a feed was expected is refused, as the server already does", () => {
  // server/status.js makes exactly this check; the browser path does not inherit
  // it, so it is restated here rather than assumed.
  assert.throws(
    () => refuseUnusableFeed({ ok: true, contentType: "text/html; charset=utf-8", bytes: 10 }),
    /web page/i,
  );
  assert.throws(() => refuseUnusableFeed({ ok: false, status: 404, bytes: 10 }), /HTTP 404/);
  assert.throws(
    () => refuseUnusableFeed({ ok: true, contentType: "application/json", bytes: 6_000_000 }),
    /too large/i,
  );
  assert.doesNotThrow(() =>
    refuseUnusableFeed({ ok: true, contentType: "application/json", bytes: 2048 }),
  );
});

// --- Defects found after the first slice shipped ---------------------------

test("a custom provider is never sent to the native watchlist", () => {
  // PulseBackground.configure drops ids it cannot find in the packaged catalog
  // AND deletes their stored reading/signature/probe keys. A custom id can
  // never be in that catalog by construction, so sending one asks the native
  // tier to purge on every round trip. The web layer filters first.
  const watchlist = [
    "openai",
    customProviderId(normalizeCustomUrl("https://status.example.com")),
    "cloudflare",
  ];
  assert.deepEqual(nativeWatchlist(watchlist), ["openai", "cloudflare"]);
  assert.deepEqual(nativeWatchlist([]), []);
  assert.deepEqual(nativeWatchlist(undefined), []);
});

test("isCustomId recognises only ids this module minted", () => {
  assert.equal(isCustomId(customProviderId(normalizeCustomUrl("https://s.example.com"))), true);
  for (const built of ["openai", "cloudflare", "google_cloud", "", null, undefined])
    assert.equal(isCustomId(built), false, `misread ${JSON.stringify(built)}`);
});

test("every built-in category is offered alongside the reader's own", () => {
  // The catalog's `categories` is frozen at import from the built-in array, so
  // a filter built from it alone silently hides custom providers the moment any
  // category is chosen.
  const mine = makeCustomProvider("https://status.example.com");
  const options = categoryOptions([...providers, mine]);
  assert.ok(options.includes(mine.category), "the reader's own category must be selectable");
  for (const c of categories) assert.ok(options.includes(c), `lost built-in category ${c}`);
  // Without any custom provider the list is exactly the catalog's, in order.
  assert.deepEqual(categoryOptions(providers), categories);
});
