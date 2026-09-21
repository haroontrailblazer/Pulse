// The route table, and nothing that needs a DOM, so `npm test` can gate it.
//
// Three surfaces serve the same dashboard from three different bases: the
// hosted site answers at /app (vercel.json rewrites /app and /app/:path* to
// dashboard.html, while / is the marketing page), and the EXE, the APK and the
// dev server all answer at /. So the base is read off the document's own path
// rather than compiled in, and one bundle is correct on all three.
//
// No slug contains a dot. Both extension-less fallbacks this product relies on
// key off one -- server/index.js tests `path.extname` before falling back to
// index.html, and Capacitor's WebViewLocalServer tests
// `getLastPathSegment().contains(".")` -- so a slug like "v1.2" would 404 in
// the EXE and would fail to reload inside the APK's WebView.

// Two policies, because a browser tab and an installed app are not the same
// kind of thing, and the reader's expectation of "back" differs accordingly.
//
// "linear", on the website: every destination tap is one history entry, exactly
// the way a browser treats a link, so back retraces the path the reader
// actually walked and the forward button still means something. The entry they
// arrived on stays theirs.
//
// "clear-top", in the APK and the EXE: a destination that is already BELOW the
// reader in the stack is somewhere to return to, not somewhere to visit a
// second time, so tapping it traverses back to the entry it already has instead
// of pushing a duplicate on top. That is the Android task rule -- CLEAR_TOP /
// reorder-to-front -- and it is what stops Overview, Map, Incidents, Map,
// Overview costing five presses to unwind, four of which retrace pages the
// reader had already walked back out of by hand.
//
// It is NOT Material's popUpTo(start) + singleTop, which caps the stack at
// [Overview, current] and throws away every destination in between; a first
// visit still pushes, and a back press still retraces it. What collapses is
// only a page the reader has already visited on this trip. The consequence is
// deliberate: once they are back on Overview the stack is [Overview] again, and
// the next press leaves, because Overview is the front door and there is
// nothing beneath it.
//
// Constants rather than comments because the navigation gate reads them, so the
// policy and the tests that prove it cannot drift apart.
export const NAV_POLICY = "linear";
export const NAV_POLICY_NATIVE = "clear-top";
// The APK and the EXE are tasks; a browser tab is not.
export const navPolicyFor = (native) =>
  native ? NAV_POLICY_NATIVE : NAV_POLICY;
export const HOME = "Overview";
export const PLACES = [
  { page: "Overview", slug: "" },
  { page: "Incidents", slug: "incidents" },
  { page: "Watchlist", slug: "watchlist" },
  { page: "Global map", slug: "map" },
  { page: "Developer tools", slug: "tools" },
  { page: "Dependency insights", slug: "insights" },
];

export function resolveBase(pathname) {
  // The hosted build also answers, unrewritten, at its physical filename.
  // Routing that under / would rewrite the reader's URL to paths the host
  // serves the marketing page from, so it resolves to the same base as /app
  // and boot canonicalises it away.
  if (pathname === "/dashboard.html") return "/app";
  return /^\/app(\/|$)/.test(pathname) ? "/app" : "/";
}

export function pathFor(page, base) {
  const place = PLACES.find((entry) => entry.page === page);
  const slug = place ? place.slug : "";
  const root = base === "/" ? "" : base;
  return `${root}/${slug}`.replace(/\/+$/, "") || "/";
}

export function pageFor(pathname, base) {
  const rest = pathname
    .slice(base === "/" ? 1 : base.length + 1)
    .replace(/\/+$/, "");
  const place = PLACES.find((entry) => entry.slug === rest);
  return place ? place.page : HOME;
}

// The tray menu inside every portable EXE already on a reader's disk loads
// "/?watchlist=1", and the app has always tested for the parameter's presence
// rather than its value. Both spellings are frozen: the producer ships inside
// executables people keep, so this end can never stop understanding them.
export function placeFromLocation({ pathname, search }) {
  const base = resolveBase(pathname);
  if (new URLSearchParams(search).has("watchlist"))
    return { base, page: "Watchlist", canonical: false };
  const page = pageFor(pathname, base);
  return { base, page, canonical: pathFor(page, base) === pathname };
}
