// Pulse's custom P: a continuous infrastructure loop and a detached signal node.
export const pulsePath =
  "M16 50V17a3 3 0 0 1 3-3h14c10.5 0 18 5.5 18 14s-7.5 14-18 14h-9v8a4 4 0 0 1-8 0ZM24 22v12h9c6 0 10-2 10-6s-4-6-10-6Z";
export const pulseNode = { cx: 46, cy: 49, r: 5 };
export const pulseTransform = "translate(-1.5 -2)";

export function pulseSvg({
  color = "#161616",
  background,
  round = false,
  adaptive = false,
} = {}) {
  const shape = `<path d="${pulsePath}"/><circle cx="${pulseNode.cx}" cy="${pulseNode.cy}" r="${pulseNode.r}"/>`;
  const backdrop = background
    ? round
      ? `<circle cx="32" cy="32" r="32" fill="${background}"/>`
      : `<rect width="64" height="64" rx="16" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${adaptive ? "-22 -22 108 108" : "0 0 64 64"}">${backdrop}<g fill="${color}" transform="${pulseTransform}">${shape}</g></svg>`;
}
