// Pulse signal: opposing receiver arcs around a central system node.
export const pulsePath =
  "M29 8h-3C16.1 8 8 16.1 8 26v3h9v-3a9 9 0 0 1 9-9h3V8Zm6 48h3c9.9 0 18-8.1 18-18v-3h-9v3a9 9 0 0 1-9 9h-3v9ZM29 24h6a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5v-6a5 5 0 0 1 5-5Z";

export function pulseSvg({
  color = "#161616",
  background,
  round = false,
  adaptive = false,
} = {}) {
  const shape = `<path fill="${color}" d="${pulsePath}"/>`;
  const backdrop = background
    ? round
      ? `<circle cx="32" cy="32" r="32" fill="${background}"/>`
      : `<rect width="64" height="64" rx="16" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${adaptive ? "-22 -22 108 108" : "0 0 64 64"}">${backdrop}${shape}</svg>`;
}

// The mark a provider gets when its brand has no artwork in the icon set, on a
// 24-unit grid like every other provider mark.
//
// It is deliberately not a logo. Approximating a trademark from memory ships a
// wrong version of someone else's mark on three surfaces, so this says "a feed,
// no artwork" instead: three rising bars, the same shape the product uses to
// mean a signal. The brand's own colour still tints it, and the provider's name
// is always adjacent in text, so the tile identifies rather than claims.
//
// Both surfaces read this one constant. The web tile used to fall back to the
// `mark` string and the Android widgets had no fallback at all -- they draw a
// vector and there is nowhere for text to go -- so a provider with no icon
// could not be added to the catalogue at all.
//
// Straight lines only, no arcs and no subpath winding: Android's PathParser is
// the strictest reader this path meets.
export const genericMarkPath = "M4 14h3v6H4zM10.5 9h3v11h-3zM17 4h3v16h-3z";
