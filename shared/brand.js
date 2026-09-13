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
