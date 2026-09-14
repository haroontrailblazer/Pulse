import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { pulseSvg, pulsePath } from "../shared/brand.js";

const icon = pulseSvg({ color: "#ffffff", background: "#161616" });
const round = pulseSvg({
  color: "#ffffff",
  background: "#161616",
  round: true,
});
const foreground = pulseSvg({ color: "#ffffff", adaptive: true });
const png = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

mkdirSync("public/brand", { recursive: true });
writeFileSync("public/favicon.svg", icon);
writeFileSync("public/brand/pulse-icon.svg", icon);
writeFileSync("public/brand/pulse-symbol.svg", pulseSvg());
writeFileSync(
  "public/brand/pulse-symbol-white.svg",
  pulseSvg({ color: "#ffffff" }),
);
writeFileSync("public/brand/pulse-icon.png", png(icon, 1024));
writeFileSync("public/brand/pulse-symbol.png", png(pulseSvg(), 1024));
writeFileSync(
  "public/brand/pulse-symbol-white.png",
  png(pulseSvg({ color: "#ffffff" }), 1024),
);
writeFileSync("desktop/icon.png", png(icon, 256));
writeFileSync(
  "android/app/src/main/res/drawable/ic_pulse_notification_logo.xml",
  `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="64" android:viewportHeight="64"><path android:fillColor="#FFFFFF" android:pathData="${pulsePath}"/></vector>\n`,
);
writeFileSync(
  "android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml",
  `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><group android:translateX="22" android:translateY="22"><path android:fillColor="#FFFFFF" android:pathData="${pulsePath}"/></group></vector>\n`,
);

// Multiple native resolutions keep the Windows icon sharp at taskbar sizes.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((size) => png(icon, size));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  header[entry] = size === 256 ? 0 : size;
  header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
writeFileSync("desktop/icon.ico", Buffer.concat([header, ...images]));

for (const [density, scale] of Object.entries({
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
})) {
  const directory = `android/app/src/main/res/mipmap-${density}`;
  writeFileSync(`${directory}/ic_launcher.png`, png(icon, 48 * scale));
  writeFileSync(`${directory}/ic_launcher_round.png`, png(round, 48 * scale));
  // Adaptive launchers need a transparent 108dp layer, with the mark inside the safe zone.
  writeFileSync(
    `${directory}/ic_launcher_foreground.png`,
    png(foreground, 108 * scale),
  );
}
console.log(
  "Pulse SVGs, PNGs, multi-resolution Windows icon, and Android launcher assets generated.",
);
