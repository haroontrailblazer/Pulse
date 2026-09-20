import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { arrangeMapPins } from "../shared/map-layout.js";

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
  assert.match(source, /const MAP_PAGE_ZOOM = 1\.5/, "the page zoom is one step");
  assert.match(source, /Math\.min\(3, value \+ 0\.5\)/, "the + control steps by 0.5");
});
