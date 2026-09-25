import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { providers } from "../shared/providers.js";
import brandIcons from "../src/brand-icons.json" with { type: "json" };
import { genericMarkPath } from "../shared/brand.js";
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
    // Artwork is no longer required to be catalogued. The widgets draw a vector
    // and have no text to fall back to the way the web tile did, so a provider
    // whose brand is absent from the icon set gets the shared neutral mark
    // rather than a hand-approximated trademark -- and still reaches the
    // widgets, identifiable by its own colour and its adjacent name.
    assert.ok(
      brandIcons[entry.id] || genericMarkPath,
      `${entry.id} has no drawable at all`,
    );
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
    const source = brandIcons[provider.id] ?? genericMarkPath;
    const file = `android/app/src/main/res/drawable/${provider.icon}.xml`;
    const xml = read(file);
    assert.equal(xml, vectorDrawable(source));
    assert.match(xml, /android:viewportWidth="24"/);
    assert.match(xml, /android:viewportHeight="24"/);
    assert.ok(xml.includes(`android:pathData="${normalizePath(source)}"`));
    assert.ok(
      !source.includes('"'),
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
    [
      "atlassian",
      "bitbucket",
      "box",
      "buildkite",
      "codecov",
      "digitalocean",
      "discord",
      "docker",
      "godaddy",
      "hubspot",
      "jfrog",
      "mongodbatlas",
      "railway",
      "snowflake",
    ],
    "a new brand icon uses compacted arc flags",
  );
  for (const provider of nativeCatalog()) {
    const source = brandIcons[provider.id] ?? genericMarkPath;
    const path = normalizePath(source);
    assert.ok(androidCanParse(path), `${provider.id} still breaks PathParser`);
    // Only separators may change: no digit is rewritten, so the geometry the
    // web renders and the geometry Android renders stay identical.
    const digits = (value) => value.replace(/[\s,]/g, "");
    assert.equal(digits(path), digits(source));
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

test("the icon widget can be configured per instance and starts transparent", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const info = read("android/app/src/main/res/xml/pulse_icon_widget_info.xml");
  const layout = read("android/app/src/main/res/layout/pulse_icon_widget.xml");

  // The chooser must be declared, exported for the host, and pointed at.
  const activity = manifest
    .split("<")
    .find(
      (n) => n.startsWith("activity") && n.includes(".PulseIconConfigActivity"),
    );
  assert.ok(activity, "PulseIconConfigActivity is not declared");
  assert.match(activity, /android:exported="true"/);
  assert.match(manifest, /android\.appwidget\.action\.APPWIDGET_CONFIGURE/);
  assert.match(
    info,
    /android:configure="app\.pulse\.status\.PulseIconConfigActivity"/,
  );
  // reconfigurable is honoured from API 28, letting an instance be changed later.
  assert.match(info, /android:widgetFeatures="reconfigurable"/);

  // Transparent is the default, so the layout must declare no background at
  // all — otherwise every widget flashes a dark card before it is repainted.
  assert.doesNotMatch(
    layout.split("\n")[1],
    /android:background/,
    "icon_root must not declare a background",
  );
  assert.match(
    read("android/app/src/main/java/app/pulse/status/PulseIconWidget.java"),
    /setBackgroundResource/,
    "the provider must state the background on every repaint",
  );
});

test("monitoring survives the screen going off", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const alarm = read(
    "android/app/src/main/java/app/pulse/status/PulseAlarm.java",
  );
  const service = read(
    "android/app/src/main/java/app/pulse/status/PulseMonitorService.java",
  );

  // A Handler delay is measured on uptimeMillis and never fires while the CPU
  // is suspended, so an allow-while-idle alarm has to carry the schedule.
  assert.match(alarm, /setAndAllowWhileIdle/);
  assert.match(alarm, /ELAPSED_REALTIME_WAKEUP/);
  assert.match(alarm, /PARTIAL_WAKE_LOCK/);
  assert.match(manifest, /android:name="android\.permission\.WAKE_LOCK"/);
  assert.ok(
    manifest.includes('<receiver android:name=".PulseAlarm"'),
    "PulseAlarm receiver is not declared",
  );
  // Exact alarms are Play-restricted and throttled identically while idle.
  assert.doesNotMatch(manifest, /SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM/);

  // Android 15 ends a dataSync foreground service after ~6h/day.
  assert.match(
    service,
    /onTimeout/,
    "the foreground service ignores its timeout",
  );
  assert.match(service, /PulseAlarm\.schedule/);
});

test("a resolved issue is announced as well as a new one", () => {
  const feed = read(
    "android/app/src/main/java/app/pulse/status/FeedReading.java",
  );
  const store = read(
    "android/app/src/main/java/app/pulse/status/PulseStore.java",
  );
  assert.match(feed, /static boolean resolved\(/);
  assert.match(store, /FeedReading\.resolved/);
  // Same notification id, so the all-clear replaces the issue it resolves.
  assert.match(store, /alert\(c,id,/);
});

test("the quick settings tile reuses the widgets' numbers and never toggles monitoring", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const tile = read("android/app/src/main/java/app/pulse/status/PulseTile.java");

  // A tile the platform will bind: the permission is what makes it a tile
  // rather than an ordinary exported service anything could start.
  assert.ok(
    manifest.includes('<service android:name=".PulseTile"'),
    "PulseTile is not declared",
  );
  assert.match(manifest, /android\.permission\.BIND_QUICK_SETTINGS_TILE/);
  assert.match(manifest, /android\.service\.quicksettings\.action\.QS_TILE/);

  // Third view of the same numbers, not a fourth opinion. If the tile grew its
  // own severity arithmetic it could disagree with the widget sitting on the
  // same home screen.
  assert.match(tile, /PulseWidgets\.readings\(/, "the tile must reuse the widgets' reading list");
  assert.match(tile, /FeedReading\.severity\(/, "and the shared severity rank");

  // Read-only by design: "stop watching my infrastructure" must not end up one
  // accidental tap from the torch.
  assert.doesNotMatch(
    tile,
    /putBoolean\("enabled"|configure\(|setEnabled/,
    "the tile must not change monitoring state",
  );

  // API 34 forbids the Intent overload of startActivityAndCollapse and below it
  // the PendingIntent overload does not exist, so both paths have to be present.
  assert.match(tile, /SDK_INT >= 34/, "the API 34 PendingIntent path is missing");
  assert.match(tile, /SDK_INT >= 29/, "setSubtitle below API 29 would crash");

  // An empty watchlist is not an all-clear, and the tile must not imply it is.
  assert.match(tile, /No watched services/);
  assert.doesNotMatch(tile, /All (systems|services) operational/);
});
