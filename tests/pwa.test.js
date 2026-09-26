import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(
  readFileSync("public/manifest.webmanifest", "utf8"),
);
const worker = readFileSync("public/sw.js", "utf8");

test("the manifest starts the app where the app actually is", () => {
  // /app is a Vercel rewrite to dashboard.html, not a real file, and the scope
  // has to contain the start URL or the installed window hands the first
  // navigation straight back to the browser.
  assert.equal(manifest.start_url, "/app");
  assert.ok(
    manifest.start_url.startsWith(manifest.scope),
    `scope ${manifest.scope} does not contain ${manifest.start_url}`,
  );
  assert.equal(manifest.display, "standalone");
});

test("the marketing page is outside the installed app", () => {
  // The homepage is a separate document with its own bundle. A scope of "/"
  // would pull it into the installed window and make the app's front door an
  // advertisement for itself.
  assert.notEqual(manifest.scope, "/");
});

test("every icon and shortcut target the manifest names exists", () => {
  const referenced = [
    ...manifest.icons.map((icon) => icon.src),
    ...manifest.shortcuts.flatMap((s) => (s.icons || []).map((i) => i.src)),
  ];
  for (const src of new Set(referenced))
    assert.ok(
      existsSync(join("public", src.replace(/^\//, ""))),
      `manifest references ${src}, which is not in public/`,
    );
});

test("the icons cover the sizes an install prompt looks for", () => {
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes("192x192"), "no 192px icon");
  assert.ok(sizes.includes("512x512"), "no 512px icon");
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === "maskable"),
    "no maskable icon, so a launcher will crop the mark",
  );
});

test("shortcuts point at real routes", async () => {
  const { PLACES } = await import("../shared/navigation.js");
  const slugs = new Set(PLACES.map((place) => place.slug));
  for (const shortcut of manifest.shortcuts) {
    const slug = shortcut.url.replace(/^\/app\/?/, "");
    assert.ok(
      slugs.has(slug),
      `shortcut "${shortcut.name}" points at /app/${slug}, which is not a route`,
    );
  }
});

test("the worker never caches status data", () => {
  // The whole product is an answer to "what is happening right now". A cached
  // answer is a wrong answer with a confident face, so /api/ must be excluded
  // from anything the worker stores or serves.
  assert.match(
    worker,
    /pathname\.startsWith\("\/api\/"\)\s*\)\s*return false/,
    "sw.js does not exclude /api/ from caching",
  );
});

test("the worker never caches the installers", () => {
  // These are 6 MB and 118 MB. Filling a reader's storage quota with them would
  // also evict the shell the worker exists to keep.
  assert.match(
    worker,
    /pathname\.startsWith\("\/downloads\/"\)\s*\)\s*return false/,
    "sw.js does not exclude /downloads/ from caching",
  );
});

test("the worker is network first, so an online reader never gets a stale build", () => {
  // This project pins a build fingerprint into every package and verifies it.
  // Serving a cached bundle to a reader who has a working connection would make
  // that guarantee unobservable, so the cache is only ever reached from the
  // failure path of a real fetch.
  const fetchHandler = worker.slice(worker.indexOf('addEventListener("fetch"'));
  const network = fetchHandler.indexOf("await fetch(request)");
  const fallback = fetchHandler.indexOf("caches.match(request)");
  assert.ok(network > -1, "the fetch handler never calls the network");
  assert.ok(fallback > -1, "the fetch handler has no cache fallback");
  assert.ok(
    network < fallback,
    "the cache is consulted before the network, which can serve a stale build",
  );
});

test("only the web build registers a worker", () => {
  // The APK and the EXE serve this same bundle from their own local origins.
  // A caching layer inside a package is a way for it to serve something other
  // than the bytes the release gate verified.
  const main = readFileSync("src/main.jsx", "utf8");
  const registration = main.slice(main.indexOf("serviceWorker.register"));
  assert.ok(
    main.includes('import.meta.env.VITE_STATUS_TRANSPORT === "poll"'),
    "the registration is not gated on the web transport",
  );
  assert.match(
    registration,
    /scope: "\/app"/,
    "the worker claims a wider scope than the dashboard",
  );
});

test("the native packages ship neither the manifest nor the worker", () => {
  // Same reason, enforced at the copy step rather than trusted.
  const config = readFileSync("vite.config.js", "utf8");
  assert.match(
    config,
    /webOnly\s*=\s*new Set\(\[[^\]]*"manifest\.webmanifest"/,
  );
  assert.match(config, /webOnly\s*=\s*new Set\(\[[^\]]*"sw\.js"/s);
});

test("the worker and manifest are revalidated rather than cached forever", () => {
  // A pinned service worker outlives the release that replaced it, and it is the
  // one file that decides what everything else may serve.
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const rule = vercel.headers.find((entry) => entry.source.includes("sw.js"));
  assert.ok(rule, "vercel.json has no cache rule for sw.js");
  const cacheControl = rule.headers.find(
    (header) => header.key === "Cache-Control",
  )?.value;
  assert.match(cacheControl, /max-age=0/);
  assert.match(cacheControl, /must-revalidate/);
});
