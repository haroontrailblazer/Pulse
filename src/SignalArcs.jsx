import { pulsePath } from "../shared/brand.js";

// The figure in Help & methodology. It draws the one thing Pulse does: many
// provider feeds, published in their own places and their own formats, read and
// resolved into a single reading.
//
// The centre is not a lookalike of the brand mark, it IS the brand mark -
// `pulsePath` imported from shared/brand.js, the same geometry the icons and the
// favicon are generated from. If the mark is ever redrawn this figure follows it
// rather than drifting into a second, slightly-wrong version of the logo.
//
// Ink is `currentColor` so the whole figure inherits the sheet's text colour and
// is correct in both themes from one asset. Only the status colours are named,
// and they are the same four tokens the product uses everywhere else, because a
// field of feeds that is entirely calm would misrepresent what this is for: the
// interesting case is the one amber and the one red among the green.
export default function SignalArcs() {
  return (
    <svg
      className="signal-arcs"
      viewBox="0 0 360 160"
      role="img"
      aria-label="Many provider feeds converging into a single Pulse reading"
    >
      <g className="sig-lines">
        <line x1="338.5" y1="94.1" x2="238.7" y2="85.2" />
        <line x1="281.1" y1="115.6" x2="226.0" y2="96.2" />
        <line x1="236.2" y1="138.4" x2="202.5" y2="103.4" />
        <line x1="166.6" y1="133.5" x2="173.7" y2="105.1" />
        <line x1="91.6" y1="135.0" x2="146.4" y2="100.9" />
        <line x1="61.7" y1="106.4" x2="127.0" y2="91.8" />
        <line x1="14.0" y1="80.0" x2="120.0" y2="80.0" />
        <line x1="65.2" y1="54.4" x2="127.0" y2="68.2" />
        <line x1="95.0" y1="27.1" x2="146.4" y2="59.1" />
        <line x1="166.8" y1="27.4" x2="173.7" y2="54.9" />
        <line x1="238.4" y1="19.3" x2="202.5" y2="56.6" />
        <line x1="282.6" y1="43.8" x2="226.0" y2="63.8" />
        <line x1="273.5" y1="99.1" x2="233.9" y2="91.0" />
        <line x1="90.1" y1="98.4" x2="126.1" y2="91.0" />
        <line x1="86.5" y1="60.9" x2="126.1" y2="69.0" />
        <line x1="269.9" y1="61.6" x2="233.9" y2="69.0" />
      </g>
      <g className="sig-nodes">
        <circle cx="338.5" cy="94.1" r="2.4" />
        <circle cx="281.1" cy="115.6" r="2.4" />
        <circle cx="236.2" cy="138.4" r="3.4" className="sig-positive" />
        <circle cx="166.6" cy="133.5" r="2.4" />
        <circle cx="91.6" cy="135.0" r="2.4" />
        <circle cx="61.7" cy="106.4" r="3.4" className="sig-warning" />
        <circle cx="14.0" cy="80.0" r="2.4" />
        <circle cx="65.2" cy="54.4" r="2.4" />
        <circle cx="95.0" cy="27.1" r="2.4" />
        <circle cx="166.8" cy="27.4" r="3.4" className="sig-negative" />
        <circle cx="238.4" cy="19.3" r="2.4" />
        <circle cx="282.6" cy="43.8" r="2.4" />
        <circle cx="273.5" cy="99.1" r="2.4" />
        <circle cx="90.1" cy="98.4" r="2.4" />
        <circle cx="86.5" cy="60.9" r="2.4" />
        <circle cx="269.9" cy="61.6" r="2.4" />
      </g>
      {/* The mark itself, 64 units square, scaled to 72 and centred on 180,80. */}
      <g transform="translate(144 44) scale(1.125)">
        <path className="sig-mark" d={pulsePath} />
      </g>
    </svg>
  );
}
