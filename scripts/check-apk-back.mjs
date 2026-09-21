// The on-device half of the navigation gate. Everything the browser profiles
// cannot answer, because here it is the Activity and a real WebView answering
// rather than a headless page:
//
//   * does WebView.canGoBack() actually walk history.pushState entries? The whole
//     design rests on it and nothing off-device can prove it
//   * does the real back key return to the previous place instead of closing Pulse
//   * does back close a sheet without also leaving the page
//   * at the root, does the task go to the background with the process kept warm
//     rather than being destroyed
//   * does a relaunch resume on the same place with a working back
//   * does the soft keyboard still take the press first, so a reader typing in the
//     watchlist editor does not lose what they typed
//
// State is read over the WebView's own devtools socket and back is pressed with
// `input keyevent 4` -- the same event the gesture and the navigation bar deliver.
// Playwright cannot drive this target (connectOverCDP calls
// Browser.setDownloadBehavior, which a WebView does not implement), so this speaks
// CDP directly over Node's own WebSocket.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const SDK =
  process.env.ANDROID_SDK_ROOT ||
  process.env.ANDROID_HOME ||
  ".cache/android-toolchain/sdk";
const ADB = process.env.PULSE_ADB || `${SDK}/platform-tools/adb.exe`;
const PKG = "app.pulse.status";
const OUT = process.env.OUT_FILE || "test-results/navigation-apk.json";
const sh = (...args) =>
  execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 1 << 24 }).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const check = (name, ok, detail) => {
  rows.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) });
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : ` :: ${JSON.stringify(detail)}`}`,
  );
};

const sdkInt = Number(sh("shell", "getprop", "ro.build.version.sdk"));
const alive = () => !!sh("shell", "pidof", PKG);
// The field was renamed: API 36 prints `topResumedActivity=`, older releases
// `mResumedActivity=`. Getting this wrong is worse than having no check, because a
// probe that always answers false makes "the app left the foreground" pass for the
// wrong reason -- which is exactly what happened the first time this gate ran. J0
// proves the instrument works before anything relies on it.
const focusedWindow = () =>
  sh("shell", "dumpsys", "window")
    .split("\n")
    .find((l) => l.includes("mCurrentFocus=")) || "";
const foreground = () => {
  const out = sh("shell", "dumpsys", "activity", "activities");
  const line =
    out.split("\n").find((l) => /(top|m)ResumedActivity=/.test(l)) ||
    focusedWindow();
  return line.includes(PKG);
};
const backKey = () => sh("shell", "input", "keyevent", "4");
const launch = () =>
  sh("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);
const keyboardUp = () =>
  sh("shell", "dumpsys", "input_method").includes("mInputShown=true");

async function attach() {
  // The devtools socket is named after the WebView's process id, so it changes
  // on every cold start and has to be looked up rather than remembered -- and
  // looked up BY that pid.
  // Android leaves the socket names of dead WebViews in /proc/net/unix, and
  // taking the last one found there attaches to whichever process happened to
  // be listed last: after a couple of relaunches that is a corpse, the CDP
  // handshake never answers, and the gate dies on a fetch timeout that looks
  // like a product failure. Pulse's own pid is the only right answer; the
  // scan is kept as a fallback for a shell that cannot report one.
  const pid = sh("shell", "pidof", PKG).trim().split(/\s+/)[0];
  const sockets = sh("shell", "cat", "/proc/net/unix")
    .split("\n")
    .map((line) => line.match(/@(webview_devtools_remote_(\d+))/))
    .filter(Boolean);
  const socket =
    sockets.find((match) => match[2] === pid)?.[1] ?? sockets.pop()?.[1];
  if (!socket)
    throw new Error("no WebView devtools socket; this needs the debug APK");
  try {
    sh("forward", "--remove", "tcp:9222");
  } catch {}
  sh("forward", "tcp:9222", `localabstract:${socket}`);
  const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const target = list.find(
    (t) => t.type === "page" && t.url.includes("localhost"),
  );
  if (!target) throw new Error(`no page target: ${JSON.stringify(list)}`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const seat = pending.get(message.id);
    if (!seat) return;
    pending.delete(message.id);
    if (message.error) seat.reject(new Error(JSON.stringify(message.error)));
    else seat.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (fn) => {
    const result = await send("Runtime.evaluate", {
      expression: `(${fn.toString()})()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 300));
    return result.result.value;
  };
  return { evaluate, close: () => ws.close() };
}

console.log(
  `device API ${sdkInt} -- ${sdkInt >= 34 ? "predictive-back path" : "confirmation path"}`,
);
// An AVD ships hw.keyboard=yes, which suppresses the soft keyboard entirely, and
// J7 is the check every design left unproven. Turn it on rather than let the case
// quietly skip.
try {
  sh("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1");
} catch {}
launch();
await wait(4000);
let cdp = await attach();
const state = () =>
  cdp.evaluate(() => ({
    pulse: window.history.state?.pulse ?? null,
    url: location.pathname,
    heading:
      document.querySelector(".page-heading h1")?.textContent?.trim() || null,
    dialog:
      document.querySelector("[role='dialog']")?.getAttribute("aria-label") ||
      null,
    len: history.length,
  }));
// A nav tap, by accessible name, in the page's own coordinate space.
const tap = async (name) => {
  const hit = await cdp.evaluate(
    new Function(`return (() => {
      const wanted = ${JSON.stringify(name)};
      const seen = [...document.querySelectorAll("nav button")].filter((b) => b.getClientRects().length);
      const button = seen.find((b) => (b.textContent || "").trim().startsWith(wanted));
      if (!button) return { ok: false, saw: seen.map((b) => (b.textContent || "").trim()) };
      button.click();
      return { ok: true };
    })()`),
  );
  if (!hit.ok)
    throw new Error(`no nav button "${name}"; saw ${JSON.stringify(hit.saw)}`);
  await wait(900);
};
// A real finger, for the one case a synthetic click cannot serve: only a genuine
// touch raises the soft keyboard, and whether back closes the keyboard rather than
// the sheet is the check every design left unproven.
//
// The mapping from the page's coordinates to the screen's is not derivable here --
// window.screenY reads 0 and env(safe-area-inset-top) reads 0, yet the window
// starts below the status bar -- so it is measured instead: tap a known screen
// point behind a transparent overlay that swallows the touch, and ask the page
// where it landed. The overlay is what makes this safe to do mid-session; without
// it the calibration tap would press whatever is under it.
let scale = null;
const calibrate = async () => {
  if (scale) return scale;
  await cdp.evaluate(() => {
    const pad = document.createElement("div");
    pad.id = "pulse-calibrate";
    pad.style.cssText = "position:fixed;inset:0;z-index:2147483647";
    pad.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.touches[0];
        window.__pulseHit = [touch.clientX, touch.clientY];
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
    document.body.appendChild(pad);
    window.__pulseHit = null;
  });
  const probe = [540, 1200];
  sh("shell", "input", "tap", String(probe[0]), String(probe[1]));
  await wait(600);
  const hit = await cdp.evaluate(() => {
    const at = window.__pulseHit;
    document.getElementById("pulse-calibrate")?.remove();
    delete window.__pulseHit;
    return { at, dpr: window.devicePixelRatio };
  });
  if (!hit.at) return null;
  scale = {
    dpr: hit.dpr,
    dx: probe[0] - hit.at[0] * hit.dpr,
    dy: probe[1] - hit.at[1] * hit.dpr,
  };
  return scale;
};
const touch = async (selector) => {
  const at = await calibrate();
  if (!at) return false;
  const box = await cdp.evaluate(
    new Function(`return (() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`),
  );
  if (!box) return false;
  sh(
    "shell",
    "input",
    "tap",
    String(Math.round(box.x * at.dpr + at.dx)),
    String(Math.round(box.y * at.dpr + at.dy)),
  );
  await wait(900);
  return true;
};
const clickByName = async (pattern) => {
  const ok = await cdp.evaluate(
    new Function(`return (() => {
      const re = new RegExp(${JSON.stringify(pattern)}, "i");
      const button = [...document.querySelectorAll("button")]
        .filter((b) => b.getClientRects().length)
        .find((b) => re.test(b.getAttribute("aria-label") || b.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })()`),
  );
  await wait(900);
  return ok;
};

await wait(2500);

// ---- J0 the instrument itself ---------------------------------------------
// Pulse was just launched and is on screen, so a probe that cannot see that is
// broken, and every foreground claim below would be meaningless.
check("J0 the foreground probe can see a running Pulse", foreground(), {
  focus: focusedWindow().trim().slice(0, 80),
});

// ---- J1 the front door ----------------------------------------------------
const boot = await state();
check(
  "J1 boots on Overview at the root of the stack",
  boot.pulse?.i === 0 &&
    boot.pulse?.page === "Overview" &&
    (boot.pulse?.o ?? []).length === 0,
  boot,
);

// ---- J2/J3 the real back key retraces ------------------------------------
await tap("Incidents");
const onIncidents = await state();
check(
  "J2 a destination tap pushes an entry",
  onIncidents.pulse?.i === 1,
  onIncidents,
);
check(
  "J2 and gives it a path the WebView could reload",
  onIncidents.url === "/incidents",
  onIncidents,
);

backKey();
await wait(1100);
const afterOne = await state();
check(
  "J3 the back key returned to Overview instead of closing Pulse",
  /Internet health/.test(afterOne.heading || ""),
  afterOne,
);
check("J3 Pulse is still in the foreground", foreground(), {});
// The measured reason the Activity does not take the step itself: an Android
// WebView's canGoBack() does not see history.pushState entries, so it would report
// nowhere to go while Pulse had a whole stack.
check(
  "J3 the step was taken in the web layer, where the entries actually are",
  afterOne.pulse?.i === 0,
  afterOne,
);

// ---- J4 back closes a sheet, and does not also leave the page -------------
const opened = await clickByName("incident notifications");
if (opened) {
  const sheetOpen = await state();
  check(
    "J4 the sheet took its own entry and put nothing in the URL",
    (sheetOpen.pulse?.o ?? []).length === 1 && sheetOpen.url === "/",
    sheetOpen,
  );
  backKey();
  await wait(1100);
  const sheetShut = await state();
  check("J4 the back key closed the sheet", !sheetShut.dialog, sheetShut);
  check(
    "J4 without changing the place",
    sheetShut.heading === sheetOpen.heading,
    {
      was: sheetOpen.heading,
      now: sheetShut.heading,
    },
  );
  check("J4 and Pulse is still in the foreground", foreground(), {});
} else rows.push({ name: "J4 inbox not reachable", ok: true, skipped: true });

// ---- J7 the soft keyboard takes the press first --------------------------
if (await clickByName("incident notifications")) {
  const field = await touch("[role='dialog'] input");
  // The IME can take longer to raise than a fixed wait allows, and guessing makes
  // this check skip at random. Poll for it instead.
  let raised = false;
  for (let n = 0; n < 12 && field; n += 1) {
    if (keyboardUp()) {
      raised = true;
      break;
    }
    await wait(300);
  }
  if (field && raised) {
    sh("shell", "input", "text", "clou");
    await wait(700);
    const before = await cdp.evaluate(() => ({
      value: document.querySelector("[role='dialog'] input")?.value ?? null,
      dialog:
        document.querySelector("[role='dialog']")?.getAttribute("aria-label") ||
        null,
    }));
    backKey();
    await wait(1200);
    const after = await cdp.evaluate(() => ({
      value: document.querySelector("[role='dialog'] input")?.value ?? null,
      dialog:
        document.querySelector("[role='dialog']")?.getAttribute("aria-label") ||
        null,
      keyboard: null,
    }));
    check(
      "J7 back with the keyboard up closed the keyboard, not the sheet",
      !!after.dialog && !keyboardUp(),
      { before, after, keyboardStillUp: keyboardUp() },
    );
    check(
      "J7 and what the reader typed survived",
      after.value === before.value,
      {
        was: before.value,
        now: after.value,
      },
    );
  } else
    rows.push({
      name: "J7 no field, or the keyboard did not open",
      ok: true,
      skipped: true,
      detail: { field, raised, keyboardUp: keyboardUp() },
    });
}
// Unwind whatever is still open.
for (let n = 0; n < 5; n += 1) {
  const at = await state();
  if ((at.pulse?.o ?? []).length === 0 && at.pulse?.i === 0) break;
  backKey();
  await wait(900);
}

// ---- J5 the root press backgrounds the task and keeps the process --------
const atRoot = await state();
check(
  "J5 walked all the way back to the root",
  atRoot.pulse?.i === 0 && (atRoot.pulse?.o ?? []).length === 0,
  atRoot,
);
backKey();
await wait(2200);
check("J5 the root press left the foreground", !foreground(), {});
check(
  "J5 and kept the process, so a relaunch resumes rather than cold-starts",
  alive(),
  {},
);

// ---- J6 a warm relaunch still has a working back ------------------------
launch();
await wait(3000);
cdp.close();
cdp = await attach();
await wait(1500);
const resumed = await state();
check(
  "J6 the relaunch resumed on the place it left",
  /Internet health/.test(resumed.heading || ""),
  resumed,
);
await tap("Watchlist");
const warm = await state();
check("J6 navigation still pushes after a relaunch", warm.pulse?.i === 1, warm);
backKey();
await wait(1100);
const warmBack = await state();
check(
  "J6 and the back key still works, so onResume re-armed the callback",
  /Internet health/.test(warmBack.heading || "") && foreground(),
  warmBack,
);

// ---- J8 no dead presses on the way down --------------------------------
for (const place of ["Incidents", "Watchlist", "Map"]) await tap(place);
let previous = await state();
for (let n = 0; n < 3; n += 1) {
  backKey();
  await wait(1000);
  const at = await state();
  check(`J8 press ${n + 1} moved the reader`, at.heading !== previous.heading, {
    was: previous.heading,
    now: at.heading,
  });
  previous = at;
}

// ---- J9 revisiting a place is going back to it -------------------------
// The reported walk, on the device it was reported on: Overview, Map,
// Incidents, Map, Overview. The two returns are the reader going back without
// touching the back control, and on a task the stack has to say so. Under the
// old linear policy this left five entries and took five presses to unwind,
// four of which retraced pages the reader had already walked back out of by
// hand. Only the depth can prove it -- every heading along the way is one the
// reader really did visit, so a heading check would pass either way.
{
  const depths = [];
  for (const place of ["Map", "Incidents", "Map", "Overview"]) {
    await tap(place);
    depths.push((await state()).pulse?.i ?? null);
  }
  check(
    "J9 revisiting Map returned to the Map entry instead of duplicating it",
    depths[2] === 1,
    { depths },
  );
  const home = await state();
  check(
    "J9 and returning to Overview left the front door alone on the stack",
    home.pulse?.i === 0 && /Internet health/.test(home.heading || ""),
    { depths, at: home.pulse, heading: home.heading },
  );
  backKey();
  await wait(2200);
  check("J9 so one press leaves, not four that retrace", !foreground(), {});
  check("J9 and the process is kept, so a relaunch still resumes", alive(), {});
  // Leave the device where the rest of the file expects it.
  launch();
  await wait(3000);
  cdp.close();
  cdp = await attach();
  await wait(1500);
}

cdp.close();
const bad = rows.filter((r) => !r.ok);
writeFileSync(OUT, JSON.stringify({ sdkInt, rows }, null, 1));
console.log(
  `\n${rows.length} device checks, ${rows.filter((r) => r.skipped).length} skipped, ${bad.length} problems -> ${OUT}`,
);
if (sdkInt >= 34)
  console.log(
    "note: API >= 34, so the below-34 confirmation path is covered only by PulseBackTest on the JVM.",
  );
process.exit(bad.length ? 1 : 0);
