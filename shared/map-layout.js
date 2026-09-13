// Offset crowded touch targets; connector lines retain the true map position.
export function arrangeMapPins(points, bounds, spacing = 46) {
  const placed = [];
  for (const point of points) {
    const candidates = [{ x: point.x, y: point.y }];
    for (let radius = 24; radius <= 144; radius += 24)
      for (let angle = 0; angle < 12; angle++)
        candidates.push({
          x: point.x + Math.cos((angle * Math.PI) / 6) * radius,
          y: point.y + Math.sin((angle * Math.PI) / 6) * radius,
        });
    const valid = candidates.filter(
      (p) =>
        p.x >= bounds.left &&
        p.x <= bounds.right &&
        p.y >= bounds.top &&
        p.y <= bounds.bottom,
    );
    const marker = valid.find((p) =>
      placed.every(
        (other) =>
          Math.hypot(p.x - other.markerX, p.y - other.markerY) >= spacing,
      ),
    ) ||
      valid[0] || {
        x: Math.max(bounds.left, Math.min(bounds.right, point.x)),
        y: Math.max(bounds.top, Math.min(bounds.bottom, point.y)),
      };
    placed.push({ ...point, markerX: marker.x, markerY: marker.y });
  }
  return placed;
}
