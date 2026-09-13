import test from "node:test";
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
