import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { providers } from "../shared/providers.js";
import brandIcons from "../src/brand-icons.json" with { type: "json" };
import {
  drawableName,
  vectorDrawable,
  normalizePath,
  nativeCatalog,
  iconLookup,
} from "../scripts/generate-native-catalog.mjs";

const read = (file) => readFileSync(file, "utf8");

// A port of android.util.PathParser.extract(): numbers end at whitespace, a
// comma, a sign that does not follow an exponent, or a second decimal point.
// It has no notion of an arc flag, which is the whole problem.
function androidFloats(text) {
  const out = [];
  let at = 0;
  while (at < text.length) {
    while (at < text.length && (text[at] === " " || text[at] === ",")) at++;
    if (at >= text.length) break;
    const start = at;
    let secondDot = false;
    let exponent = false;
    let end = at;
    for (let n = at; n < text.length; n++) {
      const previousExponent = exponent;
      exponent = false;
      const character = text[n];
      let separator = false;
      if (character === " " || character === ",") separator = true;
      else if (character === "-") separator = n !== start && !previousExponent;
      else if (character === ".") {
        if (secondDot) separator = true;
        else secondDot = true;
      } else if (character === "e" || character === "E") exponent = true;
      end = n;
      if (separator) break;
      end = n + 1;
    }
    if (end <= start) end = start + 1;
    out.push(text.slice(start, end));
    at = end;
  }
  return out;
}
const ANDROID_PARAMETERS = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};
function androidCanParse(path) {
  for (const command of path.match(
    /[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g,
  ) || []) {
    const step = ANDROID_PARAMETERS[command[0].toLowerCase()];
    if (!step) continue;
    if (androidFloats(command.slice(1)).length % step !== 0) return false;
  }
  return true;
}

test("every watchable provider reaches the widgets with an icon and a brand colour", () => {
  const catalog = nativeCatalog();
  assert.equal(catalog.length, providers.length);
  for (const entry of catalog) {
    assert.match(
      entry.color,
      /^#[0-9a-f]{6}$/i,
      `${entry.id} has no usable colour`,
    );
    assert.equal(entry.icon, `ic_provider_${entry.id}`);
    assert.ok(brandIcons[entry.id], `${entry.id} has no brand icon`);
  }
  assert.deepEqual(
    JSON.parse(read("android/app/src/main/assets/pulse-catalog.json")),
    catalog,
    "the committed native catalog is stale — run scripts/generate-native-catalog.mjs",
  );
});

test("provider ids that cannot become Android resource names fail the build", () => {
  assert.equal(drawableName("googlecloud"), "ic_provider_googlecloud");
  for (const bad of [
    "Google Cloud",
    "google-cloud",
    "1password",
    "google.cloud",
    "",
  ])
    assert.throws(() => drawableName(bad), /Android resource name/);
});

test("generated vector drawables are well formed and carry the exact brand path", () => {
  const shipped = readdirSync("android/app/src/main/res/drawable").filter((f) =>
    f.startsWith("ic_provider_"),
  );
  assert.equal(shipped.length, providers.length);
  for (const provider of nativeCatalog()) {
    const file = `android/app/src/main/res/drawable/${provider.icon}.xml`;
    const xml = read(file);
    assert.equal(xml, vectorDrawable(brandIcons[provider.id]));
    assert.match(xml, /android:viewportWidth="24"/);
    assert.match(xml, /android:viewportHeight="24"/);
    assert.ok(
      xml.includes(
        `android:pathData="${normalizePath(brandIcons[provider.id])}"`,
      ),
    );
    assert.ok(
      !brandIcons[provider.id].includes('"'),
      `${provider.id} path would break the XML attribute`,
    );
  }
  assert.throws(
    () => vectorDrawable('M0 0"/><script/>'),
    /Android cannot parse/,
  );
});

test("no shipped drawable trips the arc-flag gap in Android's path tokenizer", () => {
  // SVG optimisers pack arc flags against the next number ("a3 3 0 013-3").
  // Android reads that as one number too few, so the drawable draws the wrong
  // shape or fails to inflate; nothing in the Android build catches it.
  const compacted = Object.entries(brandIcons).filter(
    ([, path]) => !androidCanParse(path),
  );
  assert.ok(
    compacted.length > 0,
    "the raw brand icons no longer exercise this regression",
  );
  assert.deepEqual(
    compacted.map(([id]) => id).sort(),
    ["atlassian", "digitalocean", "discord", "docker"],
    "a new brand icon uses compacted arc flags",
  );
  for (const provider of nativeCatalog()) {
    const path = normalizePath(brandIcons[provider.id]);
    assert.ok(androidCanParse(path), `${provider.id} still breaks PathParser`);
    // Only separators may change: no digit is rewritten, so the geometry the
    // web renders and the geometry Android renders stay identical.
    const digits = (value) => value.replace(/[\s,]/g, "");
    assert.equal(digits(path), digits(brandIcons[provider.id]));
  }
});

test("normalized arc paths rasterize identically to the brand originals", () => {
  // The only paths normalization can change the meaning of are the ones with
  // arcs, so render those and require pixel equality rather than trusting the
  // tokenizer twice.
  const render = (d) =>
    new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="128" height="128"><path fill="#000" d="${d}"/></svg>`,
    )
      .render()
      .asPng();
  for (const id of ["docker", "discord", "atlassian", "digitalocean"])
    assert.ok(
      render(brandIcons[id]).equals(render(normalizePath(brandIcons[id]))),
      `${id} changed shape when normalized`,
    );
});

test("path normalization keeps arc flags and numbers apart", () => {
  assert.equal(normalizePath("a3 3 0 013-3"), "a3 3 0 0 1 3 -3");
  assert.equal(normalizePath("M1.5.5L2,3"), "M1.5 .5 L2 3");
  assert.equal(normalizePath("M0 0h4v4h-4z"), "M0 0 h4 v4 h-4 z");
  assert.equal(normalizePath("M0 0A1 1 0 1 1 2 2"), "M0 0 A1 1 0 1 1 2 2");
  assert.throws(
    () => normalizePath("M0 0a1 1 0 2 1 2 2"),
    /Arc flag must be 0 or 1/,
  );
  assert.throws(() => normalizePath("M0 0 E5 5"), /Unknown path command/);
  assert.throws(() => normalizePath("M0 0X5 5"), /Android cannot parse/);
  assert.throws(() => normalizePath("M0 0 L"), /no parameters/);
});

test("the generated icon lookup covers every catalog entry and compiles to real drawables", () => {
  const catalog = nativeCatalog();
  const java = read(
    "android/app/src/main/java/app/pulse/status/PulseIcons.java",
  );
  assert.equal(java, iconLookup(catalog));
  for (const provider of catalog)
    assert.ok(
      java.includes(
        `case "${provider.id}": return R.drawable.${provider.icon};`,
      ),
      `${provider.id} is missing from PulseIcons`,
    );
  assert.match(
    java,
    /default: return R\.drawable\.ic_pulse_notification_logo;/,
  );
});

test("both widgets and their collection services are declared for the launcher", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  for (const receiver of [".PulseWidget", ".PulseIconWidget"]) {
    assert.ok(
      manifest.includes(`android:name="${receiver}"`),
      `${receiver} is not declared`,
    );
  }
  assert.match(manifest, /android:resource="@xml\/pulse_widget_info"/);
  assert.match(manifest, /android:resource="@xml\/pulse_icon_widget_info"/);
  // A RemoteViewsService the launcher cannot bind leaves an empty widget.
  for (const service of [".PulseListService", ".PulseIconService"]) {
    const declaration = manifest
      .split("<")
      .find(
        (node) =>
          node.startsWith("service") &&
          node.includes(`android:name="${service}"`),
      );
    assert.ok(declaration, `${service} is not declared`);
    assert.ok(
      declaration.includes(
        'android:permission="android.permission.BIND_REMOTEVIEWS"',
      ),
      `${service} must require BIND_REMOTEVIEWS`,
    );
  }
});

test("both widgets stay resizable and request no fixed update period", () => {
  for (const file of ["pulse_widget_info", "pulse_icon_widget_info"]) {
    const xml = read(`android/app/src/main/res/xml/${file}.xml`);
    assert.match(
      xml,
      /android:resizeMode="horizontal\|vertical"/,
      `${file} is not resizable`,
    );
    // Refresh is driven by WorkManager and the monitor service, not by the host.
    assert.match(
      xml,
      /android:updatePeriodMillis="0"/,
      `${file} asks the host to poll`,
    );
    const min = Number(xml.match(/android:minResizeHeight="(\d+)dp"/)[1]);
    const max = Number(xml.match(/android:maxResizeHeight="(\d+)dp"/)[1]);
    assert.ok(max > min, `${file} cannot grow`);
  }
});

test("the stack widget clears a whole service row at every size it allows", () => {
  // Fixed chrome, in dp: 28 padding + 8 summary margin + 23 summary
  // + 6 list margin + 4 footer margin + 28 footer = 97. A row is 7 + 17 + 17
  // icon + 7 = 31. The subtitle adds 17 and the eyebrow 23, and each may only
  // appear once the list can still show the rows it had without it.
  const CHROME = 97;
  const ROW = 31;
  const SUBTITLE = 17;
  const EYEBROW = 23;
  const info = read("android/app/src/main/res/xml/pulse_widget_info.xml");
  const java = read(
    "android/app/src/main/java/app/pulse/status/PulseWidget.java",
  );
  const floor = Number(info.match(/android:minResizeHeight="(\d+)dp"/)[1]);
  const [, eyebrowAt, subtitleAt] = java
    .match(/EYEBROW_DP = (\d+), SUBTITLE_DP = (\d+)/)
    .map(Number);
  assert.ok(
    floor >= CHROME + ROW,
    `a ${floor}dp widget leaves ${floor - CHROME}dp for a ${ROW}dp row`,
  );
  const rows = (height) =>
    Math.floor(
      (height -
        (CHROME +
          (height >= subtitleAt ? SUBTITLE : 0) +
          (height >= eyebrowAt ? EYEBROW : 0))) /
        ROW,
    );
  // Growing the widget must never cost a visible service.
  for (let height = floor + 1; height <= 400; height++)
    assert.ok(
      rows(height) >= rows(height - 1),
      `${height}dp shows ${rows(height)} rows, ${height - 1}dp showed ${rows(height - 1)}`,
    );
  assert.ok(rows(floor) >= 1, "the smallest allowed widget shows no service");
});

test("no tap on either widget is dead, and the collection previews are not empty", () => {
  const layout = (name) => read(`android/app/src/main/res/layout/${name}.xml`);
  const java = (name) =>
    read(`android/app/src/main/java/app/pulse/status/${name}.java`);

  // A RemoteViews collection swallows taps that reach it, so the surfaces
  // around it must carry their own intent.
  assert.match(layout("pulse_widget"), /android:id="@\+id\/widget_root"/);
  assert.match(layout("pulse_icon_widget"), /android:id="@\+id\/icon_root"/);
  for (const target of [
    "R.id.widget_root",
    "R.id.widget_open",
    "R.id.widget_empty",
    "R.id.widget_time",
  ])
    assert.ok(
      java("PulseWidget").includes(target),
      `${target} has no tap intent`,
    );
  for (const target of ["R.id.icon_root", "R.id.icon_empty"])
    assert.ok(
      java("PulseIconWidget").includes(target),
      `${target} has no tap intent`,
    );

  // Items inside a collection can only be reached through a template plus a
  // fill-in intent, and the template has to stay mutable for the merge.
  for (const [provider, service] of [
    ["PulseWidget", "PulseListService"],
    ["PulseIconWidget", "PulseIconService"],
  ]) {
    assert.match(java(provider), /setPendingIntentTemplate/);
    assert.match(java(service), /setOnClickFillInIntent/);
  }
  assert.match(java("PulseWidgets"), /FLAG_MUTABLE/);
  // Each widget instance needs its own adapter intent or two copies share rows.
  assert.match(java("PulseWidgets"), /setData\(Uri\.parse/);

  // previewLayout renders with no adapter bound, so pointing it at the real
  // layout would advertise both widgets as empty.
  for (const [info, preview] of [
    ["pulse_widget_info", "pulse_widget_preview"],
    ["pulse_icon_widget_info", "pulse_icon_widget_preview"],
  ]) {
    assert.match(
      read(`android/app/src/main/res/xml/${info}.xml`),
      new RegExp(`android:previewLayout="@layout/${preview}"`),
    );
    assert.doesNotMatch(layout(preview), /<ListView|<GridView/);
  }
});
