// Pulse's service worker exists for one reason: an installed Pulse should open
// when the network does not. It caches the shell -- the document, the bundle, the
// stylesheet, the fonts, the brand marks -- and nothing else.
//
// It deliberately never caches status data. /api/status is the product's answer
// to "what is happening right now", and a cached answer is a wrong answer with a
// confident face. Offline, that request simply fails, which the app already
// handles the way it handles any unreachable feed: the readings go stale and then
// unavailable, never healthy. The reader also still has their own thirty-day
// journal, which lives in localStorage rather than here, so an offline open shows
// real recorded history beside an honest "not currently watching".
//
// Network first, not cache first. This project pins a build fingerprint into
// every package and verifies it, so serving a stale bundle to an online reader
// would be the worse failure. The cache is a fallback, so a stale entry can only
// ever be reached when the network could not answer at all.
//
// /downloads/ is excluded because those are the installers. Caching a 118 MB EXE
// into a reader's browser storage to make it available offline is not a service.

const CACHE = "pulse-shell-v1";
const SHELL = "/app";

self.addEventListener("install", (event) => {
  // Precache the document alone. Asset filenames carry content hashes this file
  // cannot know, so they arrive through the fetch handler on first load instead.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(SHELL, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function cacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/downloads/")) return false;
  return true;
}

async function store(request, response) {
  // 206 is a range response and is not a whole resource; an error page is not
  // worth keeping either.
  if (!response || response.status !== 200 || response.type === "opaque")
    return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  } catch {
    // A full or blocked storage bucket must not fail the navigation.
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!cacheable(url)) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        void store(request, response);
        return response;
      } catch (offline) {
        const cached = await caches.match(request);
        if (cached) return cached;
        // A deep link into the app is still the same document: /app/incidents is
        // served by the same shell, so falling back to it keeps the route working
        // offline rather than showing the browser's error page.
        if (request.mode === "navigate") {
          const shell = await caches.match(SHELL);
          if (shell) return shell;
        }
        throw offline;
      }
    })(),
  );
});
