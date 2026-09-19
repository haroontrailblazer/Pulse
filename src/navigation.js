import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { HOME, pathFor, placeFromLocation } from "../shared/navigation";

// The only file in the product that touches window.history. Everything else asks
// this module, so there is one stack, one popstate listener and one place where
// the ordering rules live.
//
// The idea the whole design rests on: a destination is one history entry AND a
// sheet is one history entry. Because an overlay is history too, no surface has
// to know anything about React state to decide what a back press means -- the
// browser, Electron and Android all just step back one entry, and a sheet's
// entry always sits directly on its own page's entry, so one press can never be
// asked to close a sheet and change the page at the same time. That is enforced
// by the shape of the stack rather than by an if-statement someone can forget.
//
// Measured, because three proposals guessed at it: Chromium keeps at most 50
// session-history entries and prunes the OLDEST. So in a very long session the
// entry the reader arrived on is evicted. Nothing here caps the depth to protect
// it -- a cap would stop back retracing, which is worse than losing the arrival
// entry after 49 steps, and it is exactly what Chrome does on any website.
//
// Also measured, on the device, and it decides where the APK's back press is
// answered: WebView.canGoBack() does NOT see history.pushState entries. On API 36
// it reported false at a moment when this page reported history.length 2, because
// same-document entries are not in the WebBackForwardList it consults. So the
// Activity cannot decide anything from it -- it would close the app with a sheet
// still open. Instead this module reports whether Pulse has anywhere to go
// whenever that changes, the Activity only uses that to arm its callback, and
// when the press arrives it comes back here to be taken.

const KEY = "pulse";
const Android = registerPlugin("PulseBackground");
let base = "/";
// What is on screen. Replaced, never mutated, so it is a safe
// useSyncExternalStore snapshot.
let live = null;
let cause = "boot";
let version = 0;
let store = null;
const closers = new Map(); // layer id -> the callback that closes that layer
const seats = new Set();
// Where the reader was inside a page that scrolls its own panel rather than the
// document -- which is every locked page on the APK, so on that surface this is
// the only scroll offset worth restoring. App.jsx owns the element and registers
// a reader for it.
let port = null;
export const setScrollPort = (read) => {
  port = read;
};

// A render-time question, never a module-scope constant: main.jsx sets the
// platform attribute after this module has already evaluated. Capacitor answers
// at module scope and is the source main.jsx itself reads, so the native bridge
// uses that while everything visual keeps using the attribute the stylesheet
// keys on, the way InsightDetails and WorldMap do it.
export const onAndroid = () =>
  Capacitor.getPlatform() === "android" ||
  // The pinned attribute as well, and not only for tidiness: Playwright can set
  // it but cannot make Capacitor report a native platform, so without this the
  // APK-shaped profile of the navigation gate would silently exercise the web's
  // root rule instead of the phone's. In the real APK the first term is already
  // true before this module evaluates, so this term never decides anything there.
  (typeof document !== "undefined" &&
    document.documentElement?.dataset.platform === "android");
// The preload's bridge, which exists in the EXE and nowhere else. Playwright
// never defines it, so every geometry gate and every captured screenshot is
// untouched by anything gated on this.
export const onDesktop = () =>
  typeof window !== "undefined" && !!window.pulseDesktop;
const nativeShell = () => onAndroid() || onDesktop();

// pushState is synchronous; back() is not -- it lands a task later. So closing a
// sheet and opening another in the same tick, which the map does whenever it
// swaps one panel for another, would race and leave the stack describing a sheet
// that is not on screen. Every write goes through this queue instead, and a
// traversal holds it until its popstate arrives.
const jobs = [];
let waiting = 0;
const pump = () => {
  while (!waiting && jobs.length) jobs.shift()();
};
const enqueue = (job) => {
  jobs.push(job);
  pump();
};
// Unblock without draining. A landing pop has to finish reconciling before the
// next queued write runs: draining first would let a queued push land, and then
// this handler would overwrite `live` with the entry the pop arrived at and undo
// it -- writing the new URL while the screen kept the old place, and closing a
// sheet that had just been opened.
const unblock = () => {
  if (waiting) clearTimeout(waiting);
  waiting = 0;
};
// The watchdog path only. A same-document traversal always lands a popstate, but
// if one ever did not, `live` would keep the optimistic index a close wrote and
// stay one step out for the rest of the session. Re-reading the entry the browser
// is actually on costs nothing and makes that a hiccup rather than a permanent
// disagreement between the stack and the screen.
const settle = () => {
  unblock();
  const at = window.history.state?.[KEY];
  if (at) live = at;
  pump();
};
// popstate always lands, but the queue must not seize up for the rest of the
// session if it somehow does not.
const traverse = (steps = 1) => {
  waiting = setTimeout(settle, 400);
  window.history.go(-steps);
};
// `search` is passed only by boot. Canonicalising the path must not throw away
// whatever brought the reader here -- a referral or campaign parameter on the
// arrival URL is theirs, and this is a dashboard link people paste. Every
// subsequent entry is a clean path: those parameters described the arrival, not
// the place.
const write = (next, replace, search = "") =>
  window.history[replace ? "replaceState" : "pushState"](
    { [KEY]: next },
    "",
    pathFor(next.page, base) + search,
  );
const panelOffset = () => {
  try {
    return port ? port() : 0;
  } catch {
    return 0;
  }
};
// The offset the reader is leaving, recorded onto the entry they are leaving.
const stamp = () => {
  live = { ...live, y: window.scrollY, p: panelOffset() };
  window.history.replaceState({ [KEY]: live }, "", window.location.href);
};
const closeLayer = (id) => {
  const close = closers.get(id);
  if (close) close();
};
const publish = (how) => {
  cause = how;
  version += 1;
  store = {
    page: live.page,
    layers: live.o,
    cause,
    version,
    y: live.y,
    p: live.p,
  };
  // Capacitor 8 ships no back handling at all, so the Activity owns the press --
  // but not the decision, because the only thing it could read it from does not
  // see our entries. It arms its callback from this and nothing else.
  if (onAndroid())
    Android.setBackAvailable?.({ available: canGoBack() }).catch(() => {});
  for (const seat of seats) seat();
};

function begin() {
  // Manual, or the browser's own restore races the app's own scroll handling and
  // the reader gets either the top of the page or a visible jump.
  try {
    window.history.scrollRestoration = "manual";
  } catch {}
  const at = placeFromLocation(window.location);
  base = at.base;
  const resume = window.history.state?.[KEY];
  // A widget, a notification or the tray can start the APK or the EXE directly
  // on a destination. With nothing beneath it the first back press would leave
  // the app, which is the complaint this change exists to fix, so Overview is
  // synthesised underneath first. Never on the web: there the entry the reader
  // arrived on is theirs, and back has to hand them back to it.
  const floor = !resume && at.page !== HOME && nativeShell();
  // Always a replace, never a push. This one line is what stops the website
  // trapping anyone: the entry the reader arrived on stays theirs, and we only
  // ever add entries above it. `o: []` drops any sheet a manual reload happened
  // inside, because a sheet nobody asked for is worse than one dead press.
  live = {
    i: resume?.i ?? 0,
    page: floor ? HOME : at.page,
    o: [],
    y: resume?.y ?? 0,
    p: resume?.p ?? 0,
  };
  // Minus the legacy watchlist parameter, which the path now says instead; left
  // in, a shared /watchlist?watchlist=1 would state the same thing twice.
  const query = new URLSearchParams(window.location.search);
  query.delete("watchlist");
  const keep = query.size ? `?${query}` : "";
  write(live, true, keep);
  if (floor) {
    live = { i: 1, page: at.page, o: [], y: 0, p: 0 };
    write(live, false);
  }
  store = {
    page: live.page,
    layers: live.o,
    cause: "boot",
    version: 0,
    y: live.y,
    p: live.p,
  };
  window.addEventListener("popstate", onPopState);
}

function onPopState(event) {
  unblock();
  const was = live;
  const next = event.state?.[KEY];
  live = next ?? {
    // An entry this app did not write. Re-derive the place from the URL rather
    // than guessing, and keep the depth so the stack stays monotonic.
    i: was.i,
    page: placeFromLocation(window.location).page,
    o: [],
    y: 0,
    p: 0,
  };
  if (was.o.length > live.o.length) {
    // A sheet was open and the entry underneath is not that sheet, so this press
    // was a request to close it rather than to leave the page. Only reached when
    // the press came from outside -- a system gesture, the browser's own button,
    // Alt+Left. A close the reader performed in the app has already dropped the
    // layer from `live`, so those land here with nothing left to do, which is
    // deliberate: Escape has always been instant, and three QA scripts press it
    // and then immediately locate controls underneath.
    for (let n = was.o.length - 1; n >= live.o.length; n -= 1)
      closeLayer(was.o[n]);
    publish("pop");
    pump();
    return;
  }
  if (live.o.length > was.o.length) {
    // Forward into a sheet the reader has already dismissed. Nothing reopens a
    // sheet on its own, so the entry becomes the page it sits on rather than
    // being left describing something that is not on screen.
    live = { ...live, o: [] };
    write(live, true);
  }
  publish("pop");
  pump();
}

export function navigate(page) {
  enqueue(() => {
    if (page === live.page && !live.o.length) {
      // singleTop: arriving where you already are is not a place change, so it
      // earns no entry. Six taps on the destination you are looking at is six
      // scrolls to the top and nothing for back to unwind.
      window.scrollTo(0, 0);
      return;
    }
    stamp();
    if (live.o.length) {
      // Closing a sheet and going somewhere in one tap -- a destination chosen
      // inside the More sheet. The sheet's entry becomes the destination's, so
      // back returns to the page the sheet was opened from and the sheet does
      // not come back. A replace, so it cannot race the async pop a close would
      // have needed.
      for (let n = live.o.length - 1; n >= 0; n -= 1) closeLayer(live.o[n]);
      live = { i: live.i, page, o: [], y: 0, p: 0 };
      write(live, true);
    } else {
      live = { i: live.i + 1, page, o: [], y: 0, p: 0 };
      write(live, false);
    }
    publish("push");
  });
}

// Nothing closes a sheet by itself. Every affordance -- Escape, the backdrop, the
// X, the drag, the system gesture -- ends up here, so there is one code path and
// the history cannot be left describing a sheet that is no longer on screen.
export const dismiss = () => enqueue(() => drop(live.o.length - 1));

// Take a layer and everything above it off both the screen and `live`, then let
// history catch up. Updating `live` here is what makes this safe to call twice:
// closing a sheet flips the component's own state, React re-runs the layout
// effect below, and that arrives as a second request to drop the same layer. If
// `live` still listed it, the second request would pop a second entry and the
// reader would leave the app -- which is the bug this whole change exists to fix,
// reintroduced one level down.
const drop = (at) => {
  if (at < 0 || at >= live.o.length) return;
  for (let n = live.o.length - 1; n >= at; n -= 1) closeLayer(live.o[n]);
  const steps = live.o.length - at;
  live = { ...live, i: live.i - steps, o: live.o.slice(0, at) };
  traverse(steps);
};

const claim = (id) =>
  enqueue(() => {
    // Idempotent on purpose: StrictMode runs effects twice in development, and a
    // second entry would silently eat the first back press in the dev build
    // only -- the worst possible place for a difference.
    if (live.o[live.o.length - 1] === id) return;
    stamp();
    live = { i: live.i + 1, page: live.page, o: [...live.o, id], y: 0, p: 0 };
    write(live, false);
    publish("push");
  });

// A layer that closed itself rather than going through dismiss -- a picker that
// chose an option, or the map clearing a panel in the same handler that closes a
// menu. Everything above it goes too: popping only the inner layer would strand
// the outer one's entry and give the reader a dead back press. Reachable on the
// Global map by opening a hub panel and then changing the region.
const release = (id) => enqueue(() => drop(live.o.indexOf(id)));

// One entry while the overlay is open. The component keeps owning its own state
// and its own focus return, because back calls the component's own close
// function rather than reaching into it.
//
// A layout effect, not an effect: layout effects run after the commit and before
// the browser paints, so the overlay cannot appear on screen before its entry
// exists. With a plain effect there is one frame in which a back press pops the
// page out from under a sheet that is already visible.
//
// `id` must be unique per mounted instance, not per kind -- FilterMenu has three
// instances mounted at once, and a shared string would let a back press close a
// different one than the reader opened.
export function useDismissible(open, close, id) {
  const latest = useRef(close);
  useLayoutEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    const call = () => latest.current();
    closers.set(id, call);
    return () => {
      if (closers.get(id) === call) closers.delete(id);
    };
  }, [id]);
  useLayoutEffect(() => {
    if (open) claim(id);
    else release(id);
  }, [open, id]);
}

// Whether one more back press has anywhere to land inside Pulse.
const canGoBack = () => live.o.length > 0 || live.i > 0;

// The APK's back press, handed here by the Activity because this is the only side
// that can see the stack. Nothing about the gesture reaches JavaScript on its own,
// so this is the whole of it: unwind one step, or tell the Activity there was
// nothing to unwind and let it decide how to leave. Registered once, at module
// scope, for the same reason the popstate listener is.
if (typeof window !== "undefined" && onAndroid())
  Android.addListener?.("backPressed", () => {
    if (live.o.length) dismiss();
    else if (live.i > 0) enqueue(() => traverse(1));
    // Reachable when a report has not landed yet, or once Chromium has pruned the
    // entry this index still counts on. Either way the honest answer is the same
    // one the Activity would have given, so it makes the decision.
    else Android.leaveApp?.().catch(() => {});
  });

const subscribe = (seat) => {
  seats.add(seat);
  return () => seats.delete(seat);
};
const snapshot = () => store;

export function useNavigation() {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    page: state.page,
    cause: state.cause,
    version: state.version,
    scrollY: state.y,
    scrollPanel: state.p,
    go: navigate,
    dismiss,
    // The EXE draws its own chevron because it is the only surface with no back
    // affordance of its own. Our index is the honest answer here rather than the
    // WebView's, because this only decides whether a control looks available.
    backAvailable: canGoBack(),
  };
}

// Electron gives a BrowserWindow no browser chrome, and Electron 44 ships no
// Back accelerator and no back MenuItem role, so the two shortcuts a Windows
// reader reaches for have to be bound by hand. Bound in the renderer rather than
// with before-input-event in the main process, because only this side can see
// that the reader is typing: the product has a "/" search hotkey, a watchlist
// search field and a JWT textarea, and Alt+Left taking the page away mid-edit
// would lose their work. Backspace is deliberately not bound -- Chromium dropped
// it in Chrome 52 for that same reason.
export function useDesktopShortcuts() {
  useEffect(() => {
    if (!onDesktop()) return;
    const key = (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        window.history.back();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        window.history.forward();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
}

// At module scope, not in an effect: that is what guarantees exactly one
// popstate listener and exactly one replaceState however StrictMode mounts. It
// reads window.location only, so it is safe before main.jsx runs.
if (typeof window !== "undefined" && !live) begin();
