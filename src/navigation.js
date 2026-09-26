import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  HOME,
  navPolicyFor,
  NAV_POLICY_NATIVE,
  pathFor,
  placeFromLocation,
} from "../shared/navigation";

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
// What this module asked the browser to do, held until the popstate it started
// lands. It exists because a traversal arrives looking the same whatever began
// it: `drop` trims the layer from `live` before it traverses, so an overlay
// close and a page-level back press reach `onPopState` with identical shapes,
// and a clear-top tap arrives as a back press that the reader experienced as a
// tap. The side that started the traversal is the only one that knows.
let pending = null;
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
  if (at) live = withTrail(at);
  // A clear-top tap whose target entry no longer exists. Chromium keeps 50
  // entries and prunes the OLDEST, so in a long session the seat the trail
  // still names can be gone; history.go() is then a no-op and no popstate ever
  // arrives, which would leave the tap doing nothing at all. Fall back to an
  // ordinary push. `place` never consults the trail, so this cannot re-enter
  // the branch that sent us here and cannot loop.
  const missed =
    pending?.kind === "reorder" && live.page !== pending.page
      ? pending.page
      : null;
  pending = null;
  // Before the queue drains, and synchronously: a tap the reader made while the
  // collapse was in flight is already sitting in `jobs`, and appending the
  // rescue behind it would replay their two taps in the wrong order and leave
  // them on the first one. `unblock` above has already cleared the gate, so
  // this is a plain push and write like any other.
  if (missed) place(missed);
  pump();
};
// popstate always lands, but the queue must not seize up for the rest of the
// session if it somehow does not. Callers set `pending` first when the landing
// is supposed to be read as something other than a plain back press.
const traverse = (steps = 1) => {
  waiting = setTimeout(settle, 400);
  window.history.go(-steps);
};
// ---- The page trail -------------------------------------------------------
// Every entry carries `t`: the destinations at and beneath its own depth, as
// `[{ page, i }, ...]`, ending with the page that entry is. It is what lets a
// tap ask "have I already been there, and how far down is it" -- a question
// nothing could answer before, because `window.history.state` only ever exposes
// the entry the browser is standing on.
//
// Inside the history state rather than in a module array, and that is the whole
// correctness of it. A module array is empty again after every reload -- which
// the APK's WebView and the EXE both do -- and it is not indexed to entries, so
// a system back or forward would leave it describing a stack the browser is no
// longer in. A per-entry prefix is self-healing instead: whatever a traversal
// lands on arrives carrying the trail that was true at that depth, with no
// reconciliation code to get wrong.
//
// An overlay inherits its page's trail unchanged, so the trail counts pages
// while `i` counts entries. The distance between two pages is still just the
// difference of their `i`, because every entry -- overlay or page -- moves `i`
// by exactly one.
//
// Capped, because the website is still linear and its trail would otherwise
// grow with the session. Twelve is twice the number of destinations, so a
// native stack, where a page can never appear twice, cannot reach it.
const TRAIL = 12;
const trailWith = (trail, page, i) => [...trail, { page, i }].slice(-TRAIL);
// Adopting an entry this build did not write. A tab restored across a deploy, or
// an entry below the one boot replaced, has no `t` at all; every trail read is
// unconditional, so one missing field would throw out of a click handler on the
// website as readily as in the apps. A one-element trail is the safe
// degradation: the next tap pushes instead of collapsing, and nothing breaks.
const withTrail = (entry) =>
  entry.t ? entry : { ...entry, t: [{ page: entry.page, i: entry.i }] };
// Where `page` already sits beneath the reader, or -1. Searched from the top so
// that a trail which somehow holds a page twice collapses to the nearer one.
const seatFor = (page) => {
  for (let n = live.t.length - 1; n >= 0; n -= 1)
    if (live.t[n].page === page && live.t[n].i < live.i) return n;
  return -1;
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
  const depth = resume?.i ?? 0;
  const arrived = floor ? HOME : at.page;
  live = {
    i: depth,
    page: arrived,
    o: [],
    y: resume?.y ?? 0,
    p: resume?.p ?? 0,
    // A reload inside the app resumes the trail the entry was written with, so
    // a WebView that reloaded itself still knows what is beneath it. An entry
    // written before trails existed has none; see `withTrail`.
    t: resume?.t ?? [{ page: arrived, i: depth }],
  };
  // Minus the legacy watchlist parameter, which the path now says instead; left
  // in, a shared /watchlist?watchlist=1 would state the same thing twice.
  const query = new URLSearchParams(window.location.search);
  query.delete("watchlist");
  const keep = query.size ? `?${query}` : "";
  write(live, true, keep);
  if (floor) {
    live = {
      i: 1,
      page: at.page,
      o: [],
      y: 0,
      p: 0,
      t: [
        { page: HOME, i: 0 },
        { page: at.page, i: 1 },
      ],
    };
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

// What a landing popstate actually was, decided by the side that started the
// traversal rather than by comparing the two entries -- which cannot tell them
// apart, because `drop` trims the layer from `live` before it traverses.
//
//   "push"   a tap. Either an ordinary push, or a clear-top tap that reached an
//            entry it already had by stepping back to it; the reader performed
//            the same gesture either way, so the page arrives at the top and
//            animates in exactly as any other tap does.
//   "layer"  an overlay closed and the place did not change. The one signal
//            App needs to stop treating a picker's dismissal as a move.
//   "pop"    the reader moved between places: a gesture, a button, Alt+Left.
const landing = (fallback) => {
  const aimed = pending;
  pending = null;
  if (aimed?.kind === "reorder")
    return live.page === aimed.page && live.i === aimed.i ? "push" : fallback;
  return aimed?.kind === "layer" ? "layer" : fallback;
};

function onPopState(event) {
  unblock();
  const was = live;
  const next = event.state?.[KEY];
  live = next
    ? withTrail(next)
    : (() => {
        // An entry this app did not write. Re-derive the place from the URL
        // rather than guessing, and keep the depth so the stack stays
        // monotonic. What the trail said sat at this depth is no longer true,
        // but everything beneath it still is.
        const page = placeFromLocation(window.location).page;
        return {
          i: was.i,
          page,
          o: [],
          y: 0,
          p: 0,
          t: trailWith(
            (was.t ?? []).filter((entry) => entry.i < was.i),
            page,
            was.i,
          ),
        };
      })();
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
    // Also the path a clear-top tap takes when it steps down past its own open
    // sheets: the closers above still run, and `landing` reports the tap.
    publish(landing("layer"));
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
  publish(landing("pop"));
  pump();
}

// A destination the reader has not been to on this trip: one tap, one entry.
// Split out of `navigate` because the pruned-entry rescue in `settle` has to be
// able to reach it without going back through the clear-top branch that sent it
// there, which is what would otherwise loop.
const place = (page) => {
  stamp();
  if (live.o.length) {
    // Closing a sheet and going somewhere in one tap -- a destination chosen
    // inside the More sheet. The sheet's entry becomes the destination's, so
    // back returns to the page the sheet was opened from and the sheet does
    // not come back. A replace, so it cannot race the async pop a close would
    // have needed.
    //
    // The trail APPENDS here rather than replacing its last element. An overlay
    // inherits its page's trail while bumping `i`, so the trail's last entry is
    // still the page underneath, which is still in history and still somewhere
    // back can land -- dropping it would lose the reader's way home.
    for (let n = live.o.length - 1; n >= 0; n -= 1) closeLayer(live.o[n]);
    live = {
      i: live.i,
      page,
      o: [],
      y: 0,
      p: 0,
      t: trailWith(live.t, page, live.i),
    };
    write(live, true);
  } else {
    live = {
      i: live.i + 1,
      page,
      o: [],
      y: 0,
      p: 0,
      t: trailWith(live.t, page, live.i + 1),
    };
    write(live, false);
  }
  publish("push");
};

export function navigate(page) {
  enqueue(() => {
    if (page === live.page && !live.o.length) {
      // singleTop: arriving where you already are is not a place change, so it
      // earns no entry. Six taps on the destination you are looking at is six
      // scrolls to the top and nothing for back to unwind.
      window.scrollTo(0, 0);
      return;
    }
    // Clear-top, in the APK and the EXE only. A destination already below the
    // reader is somewhere to return to, so the tap steps back onto the entry it
    // already has instead of pushing a second one on top: going Map, Incidents,
    // Map is going back, and the stack should say so. shared/navigation.js
    // states the policy for both surfaces, so the gate reads the same constant
    // this branch is written from.
    //
    // No layer is closed here. The distance is simply the difference of the two
    // depths -- every entry moves `i` by one, overlay or page -- so open sheets
    // are stepped over for free, and onPopState's own was.o.length branch runs
    // their closers when the landing arrives.
    const seat =
      navPolicyFor(nativeShell()) === NAV_POLICY_NATIVE ? seatFor(page) : -1;
    if (seat >= 0) {
      stamp();
      pending = { kind: "reorder", ...live.t[seat] };
      traverse(live.i - live.t[seat].i);
      return;
    }
    place(page);
  });
}

// A destination the reader did not choose from inside the app: an Android
// notification, the Windows tray item. Always a push, never a collapse. The
// interruption took them away from wherever they were, so back has to hand that
// place back -- collapsing onto an older entry for this destination would
// instead return them to whatever sat beneath it, which is somewhere they were
// not. It is the same reason this is a push rather than a replace.
export function interrupt(page) {
  enqueue(() => {
    if (page === live.page) {
      // Already here. Whatever is over it comes off, but nothing is written:
      // an entry for a place the reader is standing on is a press that looks
      // like a move and does nothing, and an alert arriving while a sheet is
      // open is the ordinary way to reach this.
      if (live.o.length) drop(0);
      else window.scrollTo(0, 0);
      return;
    }
    place(page);
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
  // Trimming `live.o` above is what makes this traversal indistinguishable from
  // a page-level back press by the time it lands, so it says what it is on the
  // way out instead. Without this a picker's own dismissal reads as a move
  // between places, and everything a page resets when the reader leaves it --
  // its search, its tab, its category -- is wiped by the act of choosing.
  pending = { kind: "layer" };
  traverse(steps);
};

const claim = (id) =>
  enqueue(() => {
    // Idempotent on purpose: StrictMode runs effects twice in development, and a
    // second entry would silently eat the first back press in the dev build
    // only -- the worst possible place for a difference.
    if (live.o[live.o.length - 1] === id) return;
    stamp();
    // `t` unchanged: an overlay is not a place, so it adds nothing to the trail
    // while still costing an entry. That is what makes the distance arithmetic
    // in `navigate` work -- the trail counts pages, `i` counts entries.
    live = {
      i: live.i + 1,
      page: live.page,
      o: [...live.o, id],
      y: 0,
      p: 0,
      t: live.t,
    };
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
  Android.addListener?.("backPressed", () =>
    // The whole decision is queued, not just its consequence. A clear-top tap
    // holds the queue until its popstate lands, and a press taken inside that
    // window used to be judged against the stack as it was before the collapse:
    // it would read i > 0, queue a step back, and then run that step from the
    // root, where going back is a no-op -- so the press did nothing and the
    // reader had to press again to leave. Deciding inside the job means the
    // press is always answered against the stack it actually lands on.
    enqueue(() => {
      if (live.o.length) drop(live.o.length - 1);
      else if (live.i > 0) traverse(1);
      // Reachable when a report has not landed yet, or once Chromium has pruned
      // the entry this index still counts on. Either way the honest answer is
      // the same one the Activity would have given, so it makes the decision.
      else Android.leaveApp?.().catch(() => {});
    }),
  );

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

/**
 * Take a watchlist transfer code off the arrival URL, and take it out of the URL.
 *
 * Here rather than in App.jsx because this module owns window.history and the
 * navigation tests enforce that: one writer, one stack. The removal is the point
 * as much as the reading is -- a code left in the address is a watchlist left in
 * browser history, and this product tells readers their watchlist goes nowhere.
 *
 * Safe to call from an effect: begin() runs at module scope, so the entry this
 * rewrites is already the canonical one, and the state object is carried across
 * untouched so the offsets recorded on it survive.
 */
export function takeTransferCode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("transfer");
    if (!code) return "";
    params.delete("transfer");
    const rest = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname +
        (rest ? `?${rest}` : "") +
        window.location.hash,
    );
    return code;
  } catch {
    return "";
  }
}

// At module scope, not in an effect: that is what guarantees exactly one
// popstate listener and exactly one replaceState however StrictMode mounts. It
// reads window.location only, so it is safe before main.jsx runs.
if (typeof window !== "undefined" && !live) begin();
