import { Capacitor } from "@capacitor/core";
import { pulsePath } from "../shared/brand.js";

// Whether this surface can watch a feed while the window is closed: the APK has
// the Capacitor plugin and the EXE has the preload's bridge, the website has
// neither. Read at module scope, which is the same thing BackgroundSettings
// does and on the same guarantee -- the preload runs before the bundle.
export const hasBackgroundChannel =
  Capacitor.getPlatform() === "android" ||
  (typeof window !== "undefined" && !!window.pulseDesktop);

// The outer end of every graduation: 180 degrees to 0 in 15-degree steps around
// the pivot at (180, 100), on the radius-76 ring. A slot lights for each watched
// service and they fill left to right, so an empty watchlist honestly draws an
// uncalibrated instrument rather than a decorative one.
const SLOTS = [
  [104, 100],
  [106.6, 80.3],
  [114.2, 62.0],
  [126.3, 46.3],
  [142.0, 34.2],
  [160.3, 26.6],
  [180, 24.0],
  [199.7, 26.6],
  [218.0, 34.2],
  [233.7, 46.3],
  [245.8, 62.0],
  [253.4, 80.3],
  [256, 100],
];

// The figure in Your preferences, and the companion to the one in Help &
// methodology. SignalArcs draws what the world does: many provider feeds, each
// published somewhere else, resolved into a single reading. This draws the only
// thing on the other sheet that is nobody's but the reader's -- that same
// reading, calibrated by them.
//
// It is a reading rather than a mood, which is the whole argument for it
// existing on a preferences sheet. Three of its four moving parts are bound to
// live state: the needle sits where automatic refresh put it, one graduation
// lights for every watched service, and those lit graduations are only green on
// a surface that can actually watch in the background. Swap the reader and the
// drawing changes; it would be wrong on anyone else's screen.
//
// That is also why nothing here is invented. This product exists to report what
// providers published and nothing more, so a figure that drew a decorative amber
// and a decorative red would be the one thing the whole application refuses to
// do. The only named colour is --positive, and it only appears where something
// is really armed.
//
// The pivot is not a lookalike of the brand mark, it IS the brand mark --
// `pulsePath` from shared/brand.js, the same geometry the icons and the favicon
// are generated from, so if the mark is ever redrawn this follows it instead of
// drifting into a second, slightly-wrong version of the logo.
//
// Ink is `currentColor` at stated opacities, so one asset is correct in both
// themes with no theme-specific rule -- and correct on the true-black theme in
// particular, where a figure built out of shadows would simply disappear.
export default function SettingsInstrument({ watched, live }) {
  const armed = hasBackgroundChannel;
  const filled = Math.min(Math.max(watched, 0), SLOTS.length);
  const label = `Your Pulse instrument: ${watched} ${
    watched === 1 ? "service" : "services"
  } watched, automatic refresh ${live ? "on" : "paused"}, background alerts ${
    armed ? "available on this device" : "available in the installed apps"
  }.`;
  return (
    <svg
      className="instrument-dial"
      viewBox="0 0 360 124"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      {/* The rule the dial stands on, with end caps, so the figure occupies the
          same 360-wide band SignalArcs does. */}
      <g className="inst-rule">
        <line x1="16" y1="100" x2="344" y2="100" />
        <line x1="16" y1="94" x2="16" y2="106" />
        <line x1="344" y1="94" x2="344" y2="106" />
      </g>
      <path className="inst-arc" d="M 104 100 A 76 76 0 0 1 256 100" />
      <path className="inst-arc is-inner" d="M 120 100 A 60 60 0 0 1 240 100" />
      {/* Thirteen graduations. The five majors reach the inner bezel at radius
          60; the minors stop at 68. */}
      <g className="inst-ticks">
        <line className="is-major" x1="104" y1="100" x2="120" y2="100" />
        <line x1="106.6" y1="80.3" x2="114.3" y2="82.4" />
        <line x1="114.2" y1="62.0" x2="121.1" y2="66.0" />
        <line className="is-major" x1="126.3" y1="46.3" x2="137.6" y2="57.6" />
        <line x1="142.0" y1="34.2" x2="146.0" y2="41.1" />
        <line x1="160.3" y1="26.6" x2="162.4" y2="34.3" />
        <line className="is-major" x1="180" y1="24.0" x2="180" y2="40.0" />
        <line x1="199.7" y1="26.6" x2="197.6" y2="34.3" />
        <line x1="218.0" y1="34.2" x2="214.0" y2="41.1" />
        <line className="is-major" x1="233.7" y1="46.3" x2="222.4" y2="57.6" />
        <line x1="245.8" y1="62.0" x2="238.9" y2="66.0" />
        <line x1="253.4" y1="80.3" x2="245.7" y2="82.4" />
        <line className="is-major" x1="256" y1="100" x2="240" y2="100" />
      </g>
      <g className="inst-slots">
        {SLOTS.map(([cx, cy], index) => {
          const on = index < filled;
          return (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r={on ? 3.4 : 2.4}
              className={on ? (armed ? "is-armed" : "is-watched") : ""}
            />
          );
        })}
      </g>
      {/* Drawn along +x and rotated about the pivot, so one rotate() animates
          into the other: the 45-degree major is "taking readings", the
          135-degree major is the paused stop. The stem runs from radius 30 to
          48 and the knob is centred at 54, so its outer edge at 58 floats two
          units inside the inner bezel and ten clear of the minor graduations
          rather than resting on either. */}
      <g
        className={`inst-needle ${live ? "is-live" : ""}`}
        transform={`rotate(${live ? -45 : -135} 180 100)`}
      >
        <line x1="210" y1="100" x2="228" y2="100" />
        <circle cx="234" cy="100" r="4" />
      </g>
      {/* The mark itself is the hub the needle turns on: 64 units square, scaled
          to 48 and centred on the pivot at 180,100, with the rule passing behind
          it the way a gauge's hub sits over its own baseline.

          Sized by measurement, not by taste. The drawn shape inside that box
          spans 8 to 56 on both axes, so at this scale its furthest corner is
          25.5 units from the pivot and the needle's stem begins at 30 -- clear
          at every angle. Smaller was tried first and is the reason for this
          note: at half scale the mark is 24 units of ink under an 84px figure,
          which stops reading as a logo and starts reading as two loose marks
          beside the needle. */}
      <g transform="translate(156 76) scale(0.75)">
        <path className="inst-mark" d={pulsePath} />
      </g>
    </svg>
  );
}
