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

// A brand mark has to be legible on the tile it sits on, and brands are not
// chosen for that. Thirteen of the first twenty-eight needed a hand-written CSS
// exception; at seventy-seven that list is a maintenance trap and an audit
// nobody repeats, so the adjustment is computed instead.
//
// The rule is the one the hand-written exceptions followed: keep the hue, move
// the lightness the least that clears 3:1 against the tile -- the WCAG
// non-text minimum, which is what a logo is. The provider's name is always
// adjacent in text, so the mark identifies rather than informs, and a few
// percent of lightness costs far less than an invisible logo.
const TILE_LIGHT = [255, 255, 255];
const TILE_DARK = [22, 22, 24];
const channel = (value) => {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parse = (hex) => {
  const clean = String(hex).replace("#", "").trim();
  const full =
    clean.length === 3
      ? [...clean].map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
};
const toHex = (rgb) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

export function readableMark(hex, theme = "light", target = 3.05) {
  const tile = theme === "dark" ? TILE_DARK : TILE_LIGHT;
  const rgb = parse(hex);
  if (contrast(rgb, tile) >= target) return toHex(rgb);
  // Toward white on a dark tile, toward black on a light one. Stepping in 0.5%
  // keeps the result as close to the brand as the floor allows.
  const toward = theme === "dark" ? 255 : 0;
  for (let t = 0.005; t <= 1.0001; t += 0.005) {
    const moved = rgb.map((v) => v + (toward - v) * t);
    if (contrast(moved, tile) >= target) return toHex(moved);
  }
  return theme === "dark" ? "#ffffff" : "#000000";
}
