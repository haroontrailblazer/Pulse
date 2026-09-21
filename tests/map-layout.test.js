import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { arrangeMapPins } from "../shared/map-layout.js";
import { hubs } from "../shared/atlas.js";

test("crowded marker touch targets separate while preserving their source coordinates", () => {
  const points = [
    { id: "London", x: 140, y: 80 },
    { id: "Frankfurt", x: 151, y: 83 },
    { id: "Paris fixture", x: 141, y: 84 },
  ];
  const result = arrangeMapPins(points, {
    left: 25,
    right: 300,
    top: 25,
    bottom: 160,
  });
  for (const [index, pin] of result.entries()) {
    assert.equal(pin.x, points[index].x);
    assert.equal(pin.y, points[index].y);
    for (const other of result.slice(index + 1))
      assert.ok(
        Math.hypot(pin.markerX - other.markerX, pin.markerY - other.markerY) >=
          46,
      );
  }
});
test("marker displacement respects visible bounds and is deterministic", () => {
  const points = [
    { x: 1, y: 2 },
    { x: 5, y: 3 },
    { x: 280, y: 190 },
  ];
  const bounds = { left: 25, right: 275, top: 25, bottom: 175 };
  const result = arrangeMapPins(points, bounds);
  assert.deepEqual(arrangeMapPins(points, bounds), result);
  assert.equal(points[0].markerX, undefined);
  for (const pin of result) {
    assert.ok(pin.markerX >= bounds.left && pin.markerX <= bounds.right);
    assert.ok(pin.markerY >= bounds.top && pin.markerY <= bounds.bottom);
  }
});

// The APK's map page opens one zoom step in, and the bug this guards against is
// specifically that it did so only when the reader arrived from Overview.
// WorldMap is mounted only on Overview and on the Map page, so arriving from
// Incidents, Watchlist, Developer tools or Dependency insights - or cold-starting
// on /map, which a restored task does - mounts it fresh with `expanded` already
// true. Seeding the "was it expanded before?" ref from `expanded` made the first
// run a no-op in exactly those cases and the reader got the unzoomed map on
// every route in but one. Measured before the fix: Overview -> Map zoomed,
// Incidents -> Map and a cold /map did not.
//
// Asserting on the source because the behaviour lives in a React effect that the
// Node suite cannot mount, and because the whole defect is one initialiser: a
// sentinel cannot equal either boolean, so the first run always decides.
test("the APK map zoom applies however the reader reached the page", () => {
  const source = readFileSync(
    new URL("../src/WorldMap.jsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /const wasExpanded = useRef\(null\)/,
    "wasExpanded must start at a sentinel; seeding it from `expanded` makes the first run a no-op on a fresh mount, which is the small-map bug",
  );
  assert.doesNotMatch(
    source,
    /const wasExpanded = useRef\(expanded\)/,
    "seeding wasExpanded from `expanded` reintroduces the small map on every arrival except from Overview",
  );
  // The step itself is still one press of the + control, which moves by 0.5
  // from a base of 1. If either number moves the other has to move with it.
  assert.match(
    source,
    /const MAP_PAGE_ZOOM = 1\.5/,
    "the page zoom is one step",
  );
  assert.match(
    source,
    /Math\.min\(3, value \+ 0\.5\)/,
    "the + control steps by 0.5",
  );
});

// Reset is the control whose whole job is "put the map back the way it was",
// and it wrote the literal 1 while only the arrival effect knew the APK's map
// page opens at 1.5. So pressing it shrank the page by a third from the zoom it
// had just opened at -- measured on a 411x560 frame, a 262px globe became
// 175px. The region picker wrote the same literal.
//
// Asserted on the source, like the test above, because the behaviour lives in
// React handlers the Node suite cannot mount. What is being held is not a
// number but a shape: one function answers "what zoom does this view sit at",
// and everything that returns the map to its starting point asks it.
test("everything that resets the map returns it to the zoom the page opened at", () => {
  const source = readFileSync(
    new URL("../src/WorldMap.jsx", import.meta.url),
    "utf8",
  );
  const at = source.indexOf("const homeZoom = ");
  assert.ok(at > 0, "one function must answer what zoom this view sits at");
  const homeZoom = source.slice(at, source.indexOf(";", at));
  assert.match(
    homeZoom,
    /\(expanded, region\)/,
    "and it must answer it for a view, not just for a page",
  );
  // Only the world needs the compensation: a region already carries its own
  // framing multiplier in `views` -- Europe is 2.8 -- so stacking MAP_PAGE_ZOOM
  // on top of it would push a continent's markers past the edges of the frame.
  // Read out of homeZoom's own body, because `region === "Global"` also appears
  // in the marker visibility filter and would pass for the wrong reason.
  assert.match(
    homeZoom,
    /region === "Global"/,
    "the page zoom belongs to the world view",
  );
  assert.match(homeZoom, /MAP_PAGE_ZOOM/);
  // Nothing may write the bare literal as "the default" again. The arrival
  // effect's `landingOnMarker ? 1 : ...` and the minus control's
  // `Math.max(1, ...)` are deliberate and read as more than a lone 1, so this
  // catches exactly the shape that caused the defect.
  const writes = [...source.matchAll(/setZoom\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(
    writes.filter((w) => w.trim() === "1"),
    [],
    `setZoom(1) is not "the default" on every surface: ${writes.join(" | ")}`,
  );
  // And the two controls whose whole job is to put the map back must ask it.
  for (const control of ["Reset map", "Map region"])
    assert.ok(source.includes(control), `${control} is still the control`);
  assert.equal(
    (source.match(/setZoom\(homeZoom\(/g) || []).length,
    2,
    "Reset and the region picker both return the map to its own default",
  );
});

// A dock that has to be clicked to reveal the one thing the map page is for is
// a control asking permission to do its job, so on a window with room for two
// columns the services list IS the page's second column: drawn with the page,
// with no dock to reveal it and no close button, because a column that is part
// of the layout is not something to dismiss. The website's desktop view and the
// EXE only -- the APK is phone-shaped even on the tablet where the measurement
// would pass, and below 700 the frame minus a 350 column leaves the map too
// little to be a map.
//
// The part worth holding is not the layout but the history. The column was
// opened by nobody, so it owns no entry -- otherwise arriving on the map page
// and pressing back would close a column the reader never asked for instead of
// leaving the page, which is a dead press on two of three surfaces.
test("the map's services column is the page, not an overlay over it", () => {
  const source = readFileSync(
    new URL("../src/WorldMap.jsx", import.meta.url),
    "utf8",
  );
  // What the reader opened and what is on screen are different questions.
  assert.match(source, /\[chosen, setChosen\] = useState\(null\)/);
  assert.match(
    source,
    /const resting =\s*expanded && size\.width > 700 && !onAndroid\(\) \? "services" : null;/,
    "a measured width, not `wide`, which also takes in a short landscape window",
  );
  assert.match(source, /const panel = chosen \?\? resting;/);
  // The entry follows the reader's own choice, never the resting state.
  assert.match(
    source,
    /useDismissible\(expanded && !!chosen, closePanel, "map-panel"\)/,
  );
  // Asking for the panel the page already rests on is asking for that resting
  // state, so a severity chip cannot claim an entry for the column it is
  // already looking at.
  assert.match(source, /setChosen\(next === resting \? null : next\)/);
  // No close control on the column: it renders with the overlay it belongs to,
  // and leaves through the stack, so it can never ask history to drop an entry
  // that was never added.
  assert.match(source, /const opened = !!chosen;/);
  assert.match(
    source,
    /\{opened && \(\s*<button\s*ref=\{closeRef\}\s*className="atlas-close"/,
    "the close button belongs to an overlay, not to the column",
  );
  assert.doesNotMatch(
    source,
    /dismissPanel|CLOSED/,
    "nothing closes the column, so nothing needs a closed state",
  );
  // And Escape has something to do only when something was opened over it.
  assert.match(source, /Escape" && \(chosen \|\| service\)/);
});

// The pins are projected from shared/atlas.js by scripts/generate-map.mjs. They
// used to come from a second array of coordinates kept inside that script,
// index-aligned with the hubs by hand -- so adding a hub in one file and not the
// other moved every pin after it to the wrong place and failed nothing. These
// hold the two together.
test("every hub has a pin, and the pin is the point the hub names", () => {
  const points = JSON.parse(
    readFileSync(new URL("../src/map-data.json", import.meta.url), "utf8"),
  ).points;
  assert.equal(
    points.length,
    hubs.length,
    "a hub without a projected point shifts every pin after it",
  );
  for (const [index, hub] of hubs.entries()) {
    assert.ok(
      Array.isArray(hub.lonlat) && hub.lonlat.length === 2,
      `${hub.name} has no lonlat to project`,
    );
    const [x, y] = points[index];
    assert.ok(
      Number.isFinite(x) && Number.isFinite(y),
      `${hub.name} did not project to a point`,
    );
    // Inside the drawing surface the projection was fitted to.
    assert.ok(
      x >= 0 && x <= 870 && y >= 0 && y <= 420,
      `${hub.name} is off the map`,
    );
  }
});

test("the coordinates a hub shows are the coordinates it is drawn at", () => {
  // `coordinates` is read by the reader and `lonlat` is what the pin is
  // projected from. Two spellings of one fact drift; this is what stops the
  // label saying Frankfurt while the pin sits in Mumbai.
  for (const hub of hubs) {
    if (hub.global) continue;
    const match = hub.coordinates.match(
      /^([\d.]+)° ([NS]) \/ ([\d.]+)° ([EW])$/,
    );
    assert.ok(
      match,
      `${hub.name}: unreadable coordinates "${hub.coordinates}"`,
    );
    const lat = Number(match[1]) * (match[2] === "S" ? -1 : 1);
    const lon = Number(match[3]) * (match[4] === "W" ? -1 : 1);
    const [lonAt, latAt] = hub.lonlat;
    assert.ok(
      Math.abs(lat - latAt) < 0.1 && Math.abs(lon - lonAt) < 0.1,
      `${hub.name}: label says ${hub.coordinates} but the pin is drawn at ${latAt}, ${lonAt}`,
    );
  }
});

test("every region a hub claims can be framed on its own", () => {
  // The picker's options come from `views`; a hub in a region with no view is
  // only ever visible from Global.
  const source = readFileSync(
    new URL("../src/WorldMap.jsx", import.meta.url),
    "utf8",
  );
  const block = source.slice(source.indexOf("const views = {"));
  for (const region of new Set(hubs.map((h) => h.region))) {
    if (region === "Global") continue;
    assert.ok(
      block.includes(`"${region}"`) || block.includes(`\n  ${region}:`),
      `${region} has a hub but no map view`,
    );
  }
});

// Markers are touch targets, so the arranger has to find 46px between any two
// of them. At world scale on a 360px screen the six European hubs sit inside
// 25px of each other, and the only way to seat them all is to fling them onto
// long leader lines above the map: measured at 360x800 with every hub
// reporting, nine markers landed more than 60px from the place they describe
// and the furthest was 96px away. The map stopped being a map.
//
// So the narrow world view draws the places where something is happening. The
// rule has to be exactly that shape: a wide map drops nothing, a region view
// brings its whole set back, and a quiet world returns all of them rather than
// emptying a map that would then read as broken. Asserted on the source,
// because it is one expression inside a component the Node suite cannot mount.
test("the narrow world view sheds the quiet places, and only those", () => {
  const source = readFileSync(
    new URL("../src/WorldMap.jsx", import.meta.url),
    "utf8",
  );
  const at = source.indexOf("const busy = ");
  assert.ok(at > 0, "one expression must answer which places are worth a pin");
  const rule = source.slice(at, source.indexOf("const trimmed", at));
  assert.match(
    rule,
    /h\.signals\.length && h\.status !== "operational"/,
    "a place is kept when something was reported there and it is not plain operational",
  );
  assert.match(
    rule,
    /!wide && region === "Global" && busy\.length\s*\?\s*busy\s*:\s*atlas\.locations/,
    "narrow and worldwide only, and never to nothing",
  );
  // And the reader is told, on the surface where it happens, rather than left
  // to notice that the map is short of places.
  assert.match(source, /\{trimmed && \(/);
  assert.match(
    source,
    /too narrow to seat every location at world\s*\n?\s*scale/,
  );
});

