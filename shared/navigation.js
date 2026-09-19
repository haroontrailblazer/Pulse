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

// "linear": every destination tap is one history entry, exactly the way a
// browser treats a link, so back retraces the path the reader actually walked.
// The alternative is Material's bottom-navigation pattern (popUpTo(start) +
// singleTop), which caps the stack at [Overview, current] -- under which back
// immediately after tapping the Overview icon ejects the reader, which is the
// ejection this change exists to fix. It is a constant rather than a comment
// because the navigation gate reads it, so the policy and the test that proves
// it cannot drift apart.
export const NAV_POLICY = "linear";
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
