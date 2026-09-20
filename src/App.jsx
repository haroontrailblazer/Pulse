import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  LayoutDashboard,
  Globe2,
  Radio,
  Network,
  Star,
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  Search,
  Plus,
  Bell,
  ChevronDown,
  ChevronRight,
  Check,
  CircleHelp,
  Settings,
  Download,
  X,
  RefreshCw,
  ExternalLink,
  Cloud,
  GitFork,
  Video,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
  Menu,
  CheckCheck,
  TriangleAlert,
  Layers3,
  Command,
  Eye,
  CircleDot,
  Zap,
  Sun,
  Moon,
  Funnel,
} from "./icons";
import { Capacitor } from "@capacitor/core";
import useLiveStatus from "./useLiveStatus";
import LiveConsole from "./LiveConsole";
import IncidentInbox from "./IncidentInbox";
import InsightDetails from "./InsightDetails";
import {
  collectIncidents,
  incidentRevision,
  latestIncident,
} from "../shared/incidents";
import { explainIndustry } from "../shared/insights";
import BackgroundSettings, {
  updateAction,
  useBackgroundSync,
  useDownloadProgress,
  useUpdateIntent,
  useUpdateNotice,
} from "./BackgroundSettings";
import { isFresh } from "../shared/monitor";
import { providers, categories, statusLabels } from "../shared/providers";
import WorldMap from "./WorldMap";
import FilterMenu from "./FilterMenu";
import PulseMark from "./PulseMark";
import ProviderLogo from "./ProviderLogo";
import { downloads } from "../shared/downloads";
import { describeDownload } from "../shared/updates";
import { gsap, hoverMotionEnabled, motionEnabled } from "./motion";
import SignalArcs from "./SignalArcs.jsx";
import {
  dismiss,
  navigate,
  onDesktop,
  setScrollPort,
  useDesktopShortcuts,
  useDismissible,
  useNavigation,
} from "./navigation";

// `primary` destinations get a slot in the phone's bottom navigation bar; the
// rest live behind "More", which opens the same list as a sheet. The sidebar
// above 760px still shows all six.
const navigation = [
  { name: "Overview", short: "Overview", icon: LayoutDashboard, primary: true },
  { name: "Incidents", short: "Incidents", icon: Radio, primary: true },
  { name: "Watchlist", short: "Watchlist", icon: Star, primary: true },
  { name: "Global map", short: "Map", icon: Globe2, primary: true },
  { name: "Developer tools", short: "Tools", icon: Command },
  { name: "Dependency insights", short: "Insights", icon: Network },
];
// How many incidents the Overview previews before deferring to the Incidents
// destination.
const OVERVIEW_INCIDENTS = 3;
// The Overview previews the directory too; "View all" expands it in place
// rather than nesting a scroller inside the page.
const OVERVIEW_SERVICES = 3;
const primaryNavigation = navigation.filter((item) => item.primary);
const secondaryNavigation = navigation.filter((item) => !item.primary);
function saved(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
// Shown before the reader spends mobile data on it: 6,099,879 bytes reads as
// "5.8 MB", which is what their download manager will say too.
function megabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}
function age(date) {
  if (!date) return "Not checked";
  const m = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}
// Seconds are noise in a "last checked" reading; the date and minute are what
// tell you whether to trust it.
function timestamp(value) {
  return new Date(value).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function Status({ status }) {
  return (
    <span className={`status-pill ${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
// A bottom sheet is dismissed the way a bottom sheet should be: drag the handle
// down past a quarter of its height, or flick it. The handle is a real button,
// so tapping it and Escape both still close — the gesture is the addition, not
// the only way out. Desktop keeps its centred dialog and its close button.
const PHONE_SHEET = "(max-width: 760px)";
function useSheetDismiss(ref, onClose) {
  const drag = useRef(null);
  const moved = useRef(false);
  const settle = (el, transform, ease, ms, after) => {
    el.style.transition = `transform ${ms}ms ${ease}`;
    el.style.transform = transform;
    window.setTimeout(() => after?.(el), ms);
  };
  const down = (e) => {
    const el = ref.current;
    if (!el || !window.matchMedia(PHONE_SHEET).matches) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moved.current = false;
    drag.current = {
      from: e.clientY,
      at: performance.now(),
      dy: 0,
      height: el.getBoundingClientRect().height,
    };
    el.style.transition = "none";
  };
  const move = (e) => {
    const state = drag.current;
    if (!state) return;
    // Downward only: dragging up must not stretch the sheet off its anchor.
    state.dy = Math.max(0, e.clientY - state.from);
    if (state.dy > 4) moved.current = true;
    ref.current.style.transform = `translateY(${state.dy}px)`;
  };
  const up = (e) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    const el = ref.current;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const velocity = state.dy / Math.max(1, performance.now() - state.at);
    const clear = (node) => {
      node.style.transition = "";
      node.style.transform = "";
    };
    if (state.dy > state.height * 0.25 || velocity > 0.55) {
      settle(el, `translateY(${state.height}px)`, "cubic-bezier(.4,0,1,1)", 170, (node) => {
        onClose();
        clear(node);
      });
    } else {
      settle(el, "translateY(0px)", "cubic-bezier(.2,.8,.2,1)", 220, clear);
    }
  };
  return {
    onPointerDown: down,
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: up,
    onClick: () => {
      if (!moved.current) onClose();
    },
  };
}

function SheetGrabber({ sheetRef, onClose, label }) {
  const handlers = useSheetDismiss(sheetRef, onClose);
  return (
    <button
      type="button"
      className="sheet-grabber"
      aria-label={label}
      {...handlers}
    >
      <i />
    </button>
  );
}

// A scroller that runs past the fold says so for five seconds: a chevron at
// its foot, only when there is something below, and only until the reader
// scrolls, because after that it is describing what they just did.
//
// The question is asked repeatedly rather than once at mount. The inbox, the
// service sheet and the incident feed are all empty until their feeds land, so
// a single reading would answer for a list that has not been filled yet. The
// polling ends with the window in which the hint could appear at all.
function useScrollHint(ref, when) {
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let shown = false;
    const look = () => {
      const more =
        node.scrollHeight - node.clientHeight > 4 && node.scrollTop < 4;
      if (more !== shown) {
        shown = more;
        setHint(more);
      }
    };
    look();
    const watch = window.setInterval(look, 200);
    const done = () => {
      window.clearInterval(watch);
      shown = false;
      setHint(false);
    };
    const stop = window.setTimeout(done, 5000);
    node.addEventListener("scroll", done, { passive: true });
    return () => {
      window.clearInterval(watch);
      window.clearTimeout(stop);
      node.removeEventListener("scroll", done);
    };
  }, [ref, when]);
  return hint;
}

function ScrollHint({ shown }) {
  return (
    <div className="scroll-hint-anchor" aria-hidden="true">
      {shown && (
        <span className="scroll-hint">
          <ChevronDown size={20} />
        </span>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide = false, actions = null }) {
  const ref = useRef();
  const backdropRef = useRef();
  const bodyRef = useRef();
  const hint = useScrollHint(bodyRef);
  useLayoutEffect(() => {
    if (!motionEnabled()) return;
    const context = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        // `opacity`, not `autoAlpha`, on both: autoAlpha sets
        // visibility:hidden synchronously, and neither an invisible element nor
        // one inside an invisible parent can take focus — so the dialog used to
        // open with focus still on the page behind it, and Tab walked that page.
        .fromTo(
          backdropRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.18 },
        )
        .fromTo(
          ref.current,
          { opacity: 0, y: 18, scale: 0.985 },
          { opacity: 1, y: 0, scale: 1, duration: 0.32 },
          0,
        );
    }, backdropRef);
    return () => context.revert();
  }, []);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...(ref.current?.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          ) ?? []),
        ].filter((node) => node.getClientRects().length);
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!ref.current.contains(document.activeElement)) {
          // Focus escaped the dialog; pull it back rather than letting Tab walk
          // the page underneath.
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
      // A back press can pop this sheet after whatever opened it has already
      // been re-rendered away -- a provider row a refresh replaced, say.
      // Focusing a detached node silently drops focus to <body>, so this guard
      // is the difference between returning the reader to their place and
      // losing them.
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);
  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <SheetGrabber sheetRef={ref} onClose={onClose} label="Close sheet" />
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body" ref={bodyRef}>
          {children}
        </div>
        <ScrollHint shown={hint} />
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </section>
    </div>
  );
}

function Toast({ children }) {
  const ref = useRef();
  useLayoutEffect(() => {
    if (!motionEnabled()) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        ref.current,
        { autoAlpha: 0, y: 14, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.28,
          ease: "power3.out",
        },
      );
    }, ref);
    return () => context.revert();
  }, []);
  return (
    <div ref={ref} className="toast" role="status">
      <Check size={16} />
      {children}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]').content =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas")
        .trim() || (theme === "dark" ? "#101113" : "#f4f5f6");
  }, [theme]);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("pulse-theme", next);
    } catch {}
  }
  // The place the reader is at now lives in the history stack rather than in
  // component state, which is what lets a back gesture on all three surfaces
  // mean something. src/navigation.js owns it; this is all App needs of it.
  const nav = useNavigation();
  const page = nav.page;
  useDesktopShortcuts();
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All services");
  const [category, setCategory] = useState("All categories");
  const [watchlist, setWatchlist] = useState(() => {
    const v = saved("pulse-watchlist", [
      "openai",
      "anthropic",
      "cloudflare",
      "github",
    ]);
    return Array.isArray(v) ? v : [];
  });
  const [autoRefresh, setAutoRefresh] = useState(() =>
    saved("pulse-refresh", true),
  );
  // What the Overview's map preview was asked to show, handed to the Map
  // destination so it opens on that view rather than on a bare map.
  const [mapView, setMapView] = useState(null);
  // The incident feed is a fixed-viewport scroller like a sheet's body, so it
  // gets the same five-second chevron when there is more below the fold.
  const incidentFeedRef = useRef(null);
  const incidentHint = useScrollHint(incidentFeedRef, page);
  // The watchlist's own list, same treatment. The anchor is hidden off Android
  // by the stylesheet, so this is the APK's hint only.
  const watchWrapRef = useRef(null);
  const watchHint = useScrollHint(watchWrapRef, page);
  // Dependency insights scrolls its own list too, so it gets the same chevron.
  const insightListRef = useRef(null);
  const insightHint = useScrollHint(insightListRef, page);
  // Developer tools scrolls one panel too, and its content changes when the
  // reader picks a different tool, so the hint is keyed on both. LiveConsole
  // keeps owning the selection and reports it up; App only uses it as a key,
  // which leaves the website's behaviour exactly as it was.
  const toolsListRef = useRef(null);
  // On the APK every locked page scrolls its own panel and the document never
  // moves, so window.scrollY is always 0 there and restoring it would restore
  // nothing the reader can see. The stack records whichever panel the current
  // place scrolls, and the same offset comes back on a traversal.
  const panelFor = () =>
    ({
      Incidents: incidentFeedRef,
      Watchlist: watchWrapRef,
      "Dependency insights": insightListRef,
      "Developer tools": toolsListRef,
    })[page]?.current ?? null;
  const panelRef = useRef(panelFor);
  panelRef.current = panelFor;
  useEffect(() => {
    setScrollPort(() => panelRef.current()?.scrollTop ?? 0);
  }, []);
  // A layout effect, and placed before the entry animation below, so a restored
  // offset is applied before the first paint of the new place. A tap carries
  // y: 0 and still lands at the top exactly as it always did; only a traversal
  // restores, which is what makes back feel like back rather than like arriving
  // somewhere for the first time.
  useLayoutEffect(() => {
    const back = nav.cause === "pop";
    window.scrollTo(0, back ? nav.scrollY : 0);
    const panel = panelFor();
    if (panel) panel.scrollTop = back ? nav.scrollPanel : 0;
    document.title =
      page === "Overview"
        ? "Pulse — Internet health, in view."
        : `${page} · Pulse`;
  }, [page]);
  const [toolView, setToolView] = useState("My stack");
  const toolsHint = useScrollHint(toolsListRef, `${page}:${toolView}`);
  // Sheets nest in exactly two places in this product: a provider row tapped
  // inside the incident inbox, and "edit your watchlist" offered by an empty
  // inbox. So this is a stack rather than a slot, and back returns the reader to
  // the sheet they came from instead of dropping them to the page. Three slots
  // is one more than anything reachable today.
  const [modals, setModals] = useState([]);
  const modal = modals[modals.length - 1] ?? null;
  const [selected, setSelected] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  // What the stack calls when a sheet's entry is popped: state only, never
  // history, or closing would try to close itself.
  const closeModalLayer = useCallback(() => {
    setModals((open) => open.slice(0, -1));
  }, []);
  const [monitorSearch, setMonitorSearch] = useState("");
  const [readIncidents, setReadIncidents] = useState(() => {
    const value = saved("pulse-inbox-read", {});
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  });
  const [dismissedIncidents, setDismissedIncidents] = useState(() => {
    const value = saved("pulse-inbox-dismissed", {});
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  });
  function dismissIncident(incident) {
    setDismissedIncidents((previous) => {
      const next = Object.fromEntries(
        [
          ...Object.entries(previous),
          [incident.key, incidentRevision(incident)],
        ].slice(-200),
      );
      try {
        localStorage.setItem("pulse-inbox-dismissed", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  function markIncidentsRead(incidents) {
    setReadIncidents((previous) => {
      const next = Object.fromEntries(
        [
          ...Object.entries(previous).filter(
            ([key]) => !incidents.some((i) => i.key === key),
          ),
          ...incidents.map((i) => [i.key, incidentRevision(i)]),
        ].slice(-200),
      );
      try {
        localStorage.setItem("pulse-inbox-read", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const searchRef = useRef();
  // One entry per open sheet, at fixed ids so the hook count never varies. The
  // closer is the raw pop; everything a reader can touch calls dismiss().
  useDismissible(modals.length > 0, closeModalLayer, "sheet-0");
  useDismissible(modals.length > 1, closeModalLayer, "sheet-1");
  useDismissible(modals.length > 2, closeModalLayer, "sheet-2");
  // Which provider the sheet is about outlives the sheet by one render, so it is
  // cleared once nothing is open rather than inside the updater above.
  useEffect(() => {
    if (!modals.length) setSelected(null);
  }, [modals.length]);
  const sidebarRef = useRef();
  const menuRef = useRef();
  const pageStageRef = useRef();
  const headingRef = useRef(null);
  const [announced, setAnnounced] = useState("");
  const scrimRef = useRef();
  // Two halves, deliberately not one function. `closeNavigation` is what the
  // stack calls when this sheet's entry is popped: it mutates state and returns
  // focus, nothing more. Everything a reader can touch calls `dismiss()`
  // instead, so the entry leaves with the sheet. Collapsing the two would be
  // mutual recursion.
  const closeNavigation = () => {
    setMobileNav(false);
    menuRef.current?.focus();
  };
  useDismissible(mobileNav, closeNavigation, "nav");
  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const scrollArea = sidebarRef.current?.querySelector(".sidebar-scroll");
    if (scrollArea) scrollArea.scrollTop = 0;
    sidebarRef.current?.querySelector(".sidebar-close")?.focus();
    const viewport = window.matchMedia("(max-width: 760px)");
    const resize = () => {
      // Through dismiss, not setMobileNav: this sheet holds a history entry, and
      // on the APK `configChanges` means the Activity is never recreated, so a
      // fold or a split-screen resize flips this media query inside a live
      // WebView with a live stack. Dropping the state alone would strand the
      // entry and leave the reader a dead back press.
      if (!viewport.matches) nav.dismiss();
    };
    viewport.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      viewport.removeEventListener("change", resize);
      // Unlike a modal, this sheet is class-toggled and never unmounts, so a
      // drag cut short by a back press, a gesture the system swallowed, or a
      // resize would leave `translateY(...)` on a live element and the sheet
      // would open off-screen the next time. The drag's own cleanup only runs on
      // pointerup, which is exactly what those cases do not deliver.
      const node = sidebarRef.current;
      if (node) {
        node.style.transition = "";
        node.style.transform = "";
      }
    };
  }, [mobileNav]);
  const {
    items,
    loading,
    fetchedAt,
    error,
    refresh,
    now,
    connection,
    monitorData,
  } = useLiveStatus(autoRefresh);
  useBackgroundSync(watchlist, monitorData);
  // Only the APK and the EXE ever have this: it comes from the native bridge,
  // which the website does not have, so the row below cannot appear there.
  const update = useUpdateNotice();
  const showUpdate = useCallback(() => setMobileNav(true), []);
  useUpdateIntent(showUpdate);
  // Android pushes progress as the bytes arrive; the EXE reports it inside the
  // same bridge state the notice itself comes from, so either may be the fresher.
  const pushed = useDownloadProgress();
  const download =
    pushed && update && pushed.version === update.version
      ? pushed
      : update?.download || null;
  // What the install call last said, which outranks the download record while the
  // system sheet is up -- the reader tapped Install and should see that, not the
  // "ready" the download left behind.
  const [installing, setInstalling] = useState(null);
  const reported =
    installing && installing.state !== "ready" ? installing : download;
  const notice = describeDownload(reported, update);
  const state = reported?.state || "idle";
  async function tapUpdate() {
    if (
      state === "downloading" ||
      state === "verifying" ||
      state === "installing"
    )
      return;
    const answer = await updateAction(
      state === "ready" ? "install" : "download",
    );
    if (answer && answer.state) setInstalling(answer);
  }
  // The tray's "Watchlist" item and the Android notifications both arrive here.
  // A real push now, so back returns the reader to whatever the interruption
  // took them away from instead of ejecting them. The cold path needs nothing:
  // boot already resolves ?watchlist=1 to the Watchlist place and canonicalises
  // the URL, and both spellings are frozen because they ship inside executables
  // and APKs that readers keep.
  useEffect(() => {
    const open = () => navigate("Watchlist");
    window.addEventListener("pulse-open-watchlist", open);
    return () => window.removeEventListener("pulse-open-watchlist", open);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("pulse-watchlist", JSON.stringify(watchlist));
    } catch {}
  }, [watchlist]);
  useEffect(() => {
    try {
      localStorage.setItem("pulse-refresh", JSON.stringify(autoRefresh));
    } catch {}
  }, [autoRefresh]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape" && mobileNav) nav.dismiss();
      if (
        e.key === "/" &&
        !mobileNav &&
        !modal &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [mobileNav, modal]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  const toggleWatch = (id) =>
    setWatchlist((w) =>
      w.includes(id) ? w.filter((x) => x !== id) : [...w, id],
    );
  // Same signature and the same synchronous resets as before, because two call
  // sites set a value immediately after calling this and depend on that
  // ordering. Only the first line changed: the destination is pushed onto the
  // stack, and the More sheet is closed by that push rather than beside it.
  const go = (name) => {
    nav.go(name);
    setSearch("");
    setFilter("All services");
    setCategory("All categories");
    setMapView(null);
  };
  // A traversal is not a click: nothing on screen moved focus, so a keyboard
  // reader's next Tab would resume from a control that no longer exists and a
  // screen reader would announce nothing at all. Only when the place itself
  // changed -- closing a sheet has already returned focus to whatever opened it.
  const lastPlace = useRef(page);
  useEffect(() => {
    if (lastPlace.current === page) return;
    lastPlace.current = page;
    if (nav.cause !== "pop") return;
    headingRef.current?.focus({ preventScroll: true });
    setAnnounced(page);
  }, [page, nav.cause]);
  // A back press lands on a place, not on the filtered view of it the reader
  // left behind, so a traversal runs the same resets a tap does. Keyed on the
  // stack's own version so it fires once per move and never on a re-render.
  const settledMove = useRef(0);
  useEffect(() => {
    if (settledMove.current === nav.version) return;
    settledMove.current = nav.version;
    if (nav.cause !== "pop") return;
    setSearch("");
    setFilter("All services");
    setCategory("All categories");
    setMapView(null);
  }, [nav.version, nav.cause]);
  // Nothing has been confirmed yet: the page is loading, not reporting a
  // service-wide failure. Screens show skeletons rather than 28 "unavailable"
  // rows until the first sweep completes.
  const firstLoad = loading && !fetchedAt;
  const healthy = items.filter((p) => p.status === "operational").length;
  const disrupted = items.filter((p) =>
    ["degraded", "outage"].includes(p.status),
  ).length;
  const verified = items.filter((p) => p.status !== "unknown").length;
  const allIncidents = useMemo(
    () => collectIncidents(items, now),
    [items, now],
  );
  useLayoutEffect(() => {
    if (!motionEnabled()) return;
    const stage = pageStageRef.current;
    if (!stage) return;
    const heading = stage.querySelector(".page-heading");
    const content = [...stage.children].filter(
      (child) => child !== heading && !child.matches(".error-banner"),
    );
    // Arriving by back is not arriving for the first time. Replaying the entry
    // stagger on a traversal is the single most noticeable way a back button can
    // feel wrong -- the reader asked for the page they had, and gets an
    // animation that says "new page".
    if (nav.cause === "pop") return;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      if (heading)
        timeline.fromTo(
          heading,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.24 },
        );
      if (content.length)
        timeline.fromTo(
          content,
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.42,
            stagger: 0.055,
            clearProps: "opacity,transform,visibility",
          },
          heading ? "-=0.16" : 0,
        );
    }, stage);
    return () => context.revert();
  }, [page]);
  useLayoutEffect(() => {
    if (!mobileNav || !motionEnabled()) return;
    const context = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          scrimRef.current,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.18 },
        )
        .fromTo(
          sidebarRef.current?.querySelector(".sidebar-scroll"),
          { autoAlpha: 0.72 },
          { autoAlpha: 1, duration: 0.22 },
          0,
        )
        .fromTo(
          sidebarRef.current?.querySelectorAll(".nav-item"),
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.24, stagger: 0.025 },
          0.09,
        );
    }, sidebarRef);
    return () => context.revert();
  }, [mobileNav]);
  const unreadIncidents = allIncidents.filter(
    (i) => readIncidents[i.key] !== incidentRevision(i),
  ).length;
  const directoryItems =
    page === "Watchlist"
      ? items.filter((p) => watchlist.includes(p.id))
      : items;
  const directoryVerified = directoryItems.filter((p) =>
    isFresh(p, now),
  ).length;
  const directoryDisrupted = directoryItems.filter((p) =>
    ["degraded", "outage"].includes(p.status),
  ).length;
  const visible = items.filter(
    (p) =>
      (page !== "Watchlist" || watchlist.includes(p.id)) &&
      (!search ||
        `${p.name} ${p.product} ${p.category}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (category === "All categories" || p.category === category) &&
      (filter !== "Disruptions" || ["degraded", "outage"].includes(p.status)) &&
      (filter !== "Watching" || watchlist.includes(p.id)),
  );
  // The Overview previews the directory; the Watchlist destination is the full
  // list of what you chose to watch, so it is never truncated.
  const previewing = page === "Overview" && visible.length > OVERVIEW_SERVICES;
  const shown = previewing ? visible.slice(0, OVERVIEW_SERVICES) : visible;
  useLayoutEffect(() => {
    if (!hoverMotionEnabled()) return;
    const cards = pageStageRef.current?.querySelectorAll("[data-motion-card]");
    if (!cards?.length) return;
    const cleanup = [...cards].map((card) => {
      const enter = () =>
        gsap.to(card, {
          y: -3,
          duration: 0.22,
          ease: "power2.out",
          overwrite: true,
        });
      const leave = () =>
        gsap.to(card, {
          y: 0,
          duration: 0.3,
          ease: "power2.out",
          overwrite: true,
        });
      card.addEventListener("pointerenter", enter);
      card.addEventListener("pointerleave", leave);
      return () => {
        card.removeEventListener("pointerenter", enter);
        card.removeEventListener("pointerleave", leave);
        gsap.killTweensOf(card);
      };
    });
    return () => cleanup.forEach((remove) => remove());
  }, [page, allIncidents.length, visible.length]);
  // Identity has to stay stable: the Modal's effect is keyed on [onClose] and
  // returns focus to whatever opened it in its cleanup, so a fresh function every
  // render would pull focus out of the watchlist editor's search field on each
  // keystroke.
  //
  // It pops one sheet rather than clearing them all, because sheets nest in
  // exactly one place: tapping a provider row inside the incident inbox. Back --
  // and this X -- should return the reader to the inbox they were reading, not
  // to the page underneath it. Today that inbox is simply lost.
  const closeModal = dismiss;
  const openModal = (kind) =>
    setModals((open) =>
      open.length >= 3 ? [...open.slice(0, 2), kind] : [...open, kind],
    );
  const openProvider = (p) => {
    setSelected(p.id);
    openModal("provider");
  };
  const detailProvider = items.find((p) => p.id === selected);
  const detail = detailProvider
    ? {
        ...detailProvider,
        incidents: detailProvider.incidents.map(latestIncident),
      }
    : undefined;
  const bottomNavigation = compact ? (
    <nav className="bottom-nav" aria-label="Primary">
      {primaryNavigation.map(({ name, short, icon: Icon }) => (
        <button
          key={name}
          className={`bottom-nav-item ${page === name ? "active" : ""}`}
          aria-current={page === name ? "page" : undefined}
          onClick={() => go(name)}
        >
          <span className="bottom-nav-icon">
            <Icon size={20} weight={page === name ? "fill" : "regular"} />
            {name === "Incidents" && allIncidents.length > 0 && (
              <i aria-hidden="true" />
            )}
          </span>
          <span className="bottom-nav-label">{short}</span>
        </button>
      ))}
      <button
        ref={menuRef}
        className={`bottom-nav-item ${secondaryNavigation.some((item) => item.name === page) ? "active" : ""}`}
        aria-label="More destinations and settings"
        aria-expanded={mobileNav}
        aria-controls="workspace-navigation"
        onClick={() => setMobileNav(true)}
      >
        <span className="bottom-nav-icon">
          <Menu size={20} />
        </span>
        <span className="bottom-nav-label">More</span>
      </button>
    </nav>
  ) : null;
  const notificationButton = (
    <button
      className="icon-button notification-button"
      aria-label={
        unreadIncidents
          ? `Open incident notifications, ${unreadIncidents} unread`
          : "Open incident notifications"
      }
      onClick={() => {
        openModal("notifications");
        void refresh();
      }}
    >
      <Bell size={20} />
      {unreadIncidents > 0 && <i aria-hidden="true" />}
    </button>
  );
  return (
    <div className="app-shell">
      {mobileNav && (
        <div
          ref={scrimRef}
          className="nav-scrim"
          aria-hidden="true"
          onClick={dismiss}
        />
      )}
      <aside
        id="workspace-navigation"
        ref={sidebarRef}
        className={`sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="Workspace navigation"
        role={mobileNav ? "dialog" : undefined}
        aria-modal={mobileNav || undefined}
        onClickCapture={(e) => {
          // Everything in this sheet takes the reader somewhere, so touching it
          // closes the sheet -- except the update row, which starts a download
          // they asked for and then want to watch. Closing on that tap hid the
          // progress bar one frame after it appeared.
          if (
            mobileNav &&
            e.target.closest("button, a") &&
            !e.target.closest(".nav-upgrade")
          )
            dismiss();
        }}
        onKeyDown={(e) => {
          if (!mobileNav || e.key !== "Tab") return;
          const controls = [
            ...sidebarRef.current.querySelectorAll(
              "button:not(:disabled), a[href]",
            ),
          ].filter((node) => node.getClientRects().length);
          const first = controls[0],
            last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <SheetGrabber
          sheetRef={sidebarRef}
          onClose={dismiss}
          label="Close navigation"
        />
        <div className="sidebar-header">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go("Overview");
            }}
          >
            <span className="brand-mark">
              <PulseMark size={24} />
            </span>
            pulse<span className="brand-period">.</span>
          </a>
          <button
            className="icon-button sidebar-close"
            aria-label="Close navigation"
            onClick={dismiss}
          >
            <X size={20} />
          </button>
        </div>
        <div
          className="sidebar-scroll"
          role="region"
          aria-label="Navigation and watched services"
          tabIndex={0}
        >
          {!compact && (
            <button className="workspace" onClick={() => go("Watchlist")}>
              <span className="workspace-symbol">
                <Globe2 size={16} />
              </span>
              <span>
                Your saved services
                <small>{watchlist.length} on your watchlist</small>
              </span>
              <ChevronDown size={16} />
            </button>
          )}
          <div className="nav-label">{compact ? "MORE" : "EXPLORE"}</div>
          <nav aria-label={compact ? "More destinations" : "Main navigation"}>
            {/* The phone's bottom bar already holds the four primary
                destinations; repeating them here would make the sheet a
                second, slower copy of it. */}
            {(compact ? secondaryNavigation : navigation).map(
              ({ name, icon: Icon }) => (
                <button
                  key={name}
                  onClick={() => go(name)}
                  className={`nav-item ${page === name ? "active" : ""}`}
                  aria-current={page === name ? "page" : undefined}
                >
                  <Icon size={20} />
                  <span>{name}</span>
                  {name === "Incidents" && allIncidents.length > 0 && (
                    <b className="nav-count">{allIncidents.length}</b>
                  )}
                  {name === "Watchlist" && <small>{watchlist.length}</small>}
                </button>
              ),
            )}
          </nav>
          {/* Below Dependency insights, which is the last destination in both
              lists -- so this one place is the phone's More sheet and the EXE's
              sidebar at once. An anchor rather than a nav item, because it leaves
              for a download instead of going to a screen, and outside the <nav>
              because it is not a destination. The website never reaches this: the
              notice comes from the native bridge, and there isn't one. */}
          {update && (
            <button
              className="nav-item nav-upgrade"
              onClick={tapUpdate}
              aria-busy={notice.busy || undefined}
              aria-label={`${notice.label}. ${notice.detail}`}
            >
              <Download size={20} />
              <span>
                {notice.label}
                <small>{notice.detail}</small>
                {/* The bar is the only new chrome, and it is only drawn while
                    something is actually arriving -- a progress track that sits
                    at zero is a promise the row is not keeping. */}
                {notice.percent !== undefined && (
                  <i
                    className="nav-upgrade-bar"
                    style={{ "--at": `${notice.percent}%` }}
                    aria-hidden="true"
                  />
                )}
              </span>
              {state === "ready" ? (
                <ArrowRight size={16} />
              ) : state === "idle" ? (
                <ArrowUpRight size={16} />
              ) : null}
            </button>
          )}
          {!compact && (
            <>
              <div className="nav-label following-label">
                YOUR WATCHLIST{" "}
                <button
                  aria-label="Edit watchlist"
                  onClick={() => openModal("monitor")}
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="sidebar-watches">
            {items
              .filter((p) => watchlist.includes(p.id))
              .slice(0, 5)
              .map((p) => (
                <button
                  key={p.id}
                  aria-label={`${p.name} — ${statusLabels[p.status]}`}
                  onClick={() => openProvider(p)}
                >
                  <ProviderLogo provider={p} />
                  <span>{p.name}</span>
                  <i aria-hidden="true" className={`state-dot ${p.status}`} />
                </button>
              ))}
                {!watchlist.length && (
                  <p className="muted sidebar-empty">
                    Keep your critical services close.
                  </p>
                )}
              </div>
              {watchlist.length > 5 && (
                <button
                  className="sidebar-view-all"
                  onClick={() => go("Watchlist")}
                >
                  View all {watchlist.length} watched services{" "}
                  <ArrowRight size={16} />
                </button>
              )}
              <div className="download-card">
                <span className="download-card-icon">
                  <Layers3 size={20} />
                </span>
                <h3>A little peace of mind.</h3>
                <p>
                  Your infrastructure, in view.
                  <br />
                  Wherever you work.
                </p>
                <button onClick={() => openModal("apps")}>
                  Get Pulse for your device <ArrowUpRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
        <div className="sidebar-bottom">
          {compact && import.meta.env.VITE_STATUS_TRANSPORT === "poll" && (
            <button className="nav-item" onClick={() => openModal("apps")}>
              <Download size={20} />
              <span>Get the app</span>
              <ArrowUpRight size={16} />
            </button>
          )}
          <button className="nav-item" onClick={() => openModal("methodology")}>
            <CircleHelp size={20} />
            <span>Help & methodology</span>
            <ArrowUpRight size={16} />
          </button>
          <button
            className="nav-item sidebar-settings"
            onClick={() => openModal("settings")}
          >
            <Settings size={20} />
            <span>Settings</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <main
          ref={pageStageRef}
          className={
            page === "Global map"
              ? "map-main"
              : page === "Incidents"
                ? "list-main incidents-main"
                : page === "Watchlist"
                  ? "list-main watchlist-main"
                  : page === "Dependency insights"
                    ? "insights-main"
                    : page === "Developer tools"
                      ? "tools-main"
                      : ""
          }
        >
          <div className="page-heading">
            <div>
              {/* The screen title leads the page. The brand line above it was
                  repeated chrome that said the same thing on every
                  destination; it lives on the marketing page instead. */}
              <div className="page-title-row">
                {/* The EXE is the only surface with no back affordance of its
                    own: the browser has its chrome and Android has a system
                    gesture, but an Electron BrowserWindow has neither. Always
                    rendered rather than appearing and vanishing, so the headline
                    never reflows, and aria-disabled rather than disabled so the
                    tab stop survives. Playwright never defines window.pulseDesktop,
                    so no geometry gate and no captured screenshot sees this. */}
                {onDesktop() && (
                  <button
                    className="icon-button desktop-back"
                    aria-label="Go back"
                    aria-disabled={!nav.backAvailable}
                    onClick={() => nav.backAvailable && window.history.back()}
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}
                <h1 ref={headingRef} tabIndex={-1}>
                  {page === "Overview" ? (
                    <>
                      Internet health, <span>in view.</span>
                    </>
                  ) : page === "Global map" ? (
                    <>
                      A connected <span>world.</span>
                    </>
                  ) : page === "Incidents" ? (
                    <>
                      Every signal. <span>Less noise.</span>
                    </>
                  ) : page === "Watchlist" ? (
                    <>
                      Your stack, <span>at a glance.</span>
                    </>
                  ) : page === "Developer tools" ? (
                    "Built for your next deploy."
                  ) : (
                    "See the bigger picture."
                  )}
                </h1>
                {notificationButton}
              </div>
            </div>
            <p className="visually-hidden" role="status">
              {announced}
            </p>
          </div>
          {error && page !== "Global map" && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={16} />
              {error}
              <button onClick={refresh}>Retry</button>
            </div>
          )}
          {page === "Developer tools" && (
            <LiveConsole
              items={items}
              watchlist={watchlist}
              data={monitorData}
              now={now}
              connection={connection}
              loading={loading}
              onRefresh={refresh}
              onProvider={openProvider}
              listRef={toolsListRef}
              hint={toolsHint}
              onView={setToolView}
            />
          )}
          {page === "Overview" && (
            <div className="summary-grid">
              <Summary
                label="Services tracked"
                loading={firstLoad}
                number={items.length}
                icon={Layers3}
                note={`${categories.length} essential technology sectors`}
                color="neutral"
              />
              <Summary
                label="Operational"
                loading={firstLoad}
                number={!verified ? "—" : healthy}
                icon={ShieldCheck}
                note={
                  verified
                    ? `${Math.round((healthy / verified) * 100)}% of verified provider feeds`
                    : "No fresh readings available"
                }
                color="green"
              />
              <Summary
                label="Active disruptions"
                loading={firstLoad}
                number={!verified ? "—" : disrupted}
                icon={Activity}
                note={
                  disrupted
                    ? "Providers reporting service issues"
                    : verified
                      ? "No disruptions in fresh readings"
                      : "Status unavailable; verify at source"
                }
                color="amber"
                onClick={() => {
                  go("Overview");
                  setFilter("Disruptions");
                }}
              />
              <Summary
                label="On your radar"
                number={watchlist.length}
                icon={Star}
                note={`${items.filter((p) => watchlist.includes(p.id) && ["degraded", "outage"].includes(p.status)).length} watched providers with disruptions`}
                color="purple"
                onClick={() => go("Watchlist")}
              />
            </div>
          )}
          {(page === "Overview" || page === "Global map") && (
            <div
              className={`overview-grid ${page === "Global map" ? "map-only" : ""}`}
            >
              <WorldMap
                expanded={page === "Global map"}
                providers={items}
                watchlist={watchlist}
                now={now}
                onToggleWatch={toggleWatch}
                feedError={error}
                initialView={page === "Global map" ? mapView : null}
                onOpen={
                  page === "Overview"
                    ? (view) => {
                        // `go` clears it; setting after is what survives.
                        go("Global map");
                        setMapView(view);
                      }
                    : undefined
                }
              />
              {page === "Overview" && (
                <section className="panel incidents-panel">
                  <div className="panel-heading">
                    <h2>
                      <span className="signal-icon">
                        <Radio size={16} />
                      </span>
                      Live incidents{" "}
                      <span className="count-label">{allIncidents.length}</span>
                    </h2>
                    {/* A permanent "FEED" badge with a green dot reported
                        nothing: the card is the feed. The label now appears
                        only when there is a state worth naming. */}
                    {loading ? (
                      <span className="live-label">SYNCING</span>
                    ) : error ? (
                      <span className="live-label is-down">UNAVAILABLE</span>
                    ) : null}
                  </div>
                  {/* The Overview shows the three most recent updates and
                      hands the rest to the Incidents destination. A scroller
                      inside a scrolling page is worse than a short list with a
                      way out of it. */}
                  <div className="incident-stream">
                    {allIncidents.length ? (
                      allIncidents
                        .slice(0, OVERVIEW_INCIDENTS)
                        .map((i) => (
                          <Incident
                            key={`${i.provider.id}-${i.id}`}
                            incident={i}
                            onClick={() => openProvider(i.provider)}
                          />
                        ))
                    ) : (
                      <div className="quiet-state">
                        <ShieldCheck size={32} />
                        <h3>
                          {loading
                            ? "Tuning into the network…"
                            : verified
                              ? "No active incidents in fresh feeds."
                              : "No fresh status data."}
                        </h3>
                        <p>
                          {loading
                            ? "Checking official provider feeds."
                            : `${verified} of ${items.length} feeds are fresh. Unavailable or stale feeds cannot confirm service health.`}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    className="panel-footer-button"
                    onClick={() => go("Incidents")}
                  >
                    {allIncidents.length > OVERVIEW_INCIDENTS
                      ? `View all ${allIncidents.length} incidents`
                      : "View all incidents"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </section>
              )}
            </div>
          )}
          {(page === "Overview" || page === "Watchlist") && (
            <section className="panel services-panel">
              <div className="panel-heading services-heading">
                <div>
                  <h2>
                    {page === "Watchlist"
                      ? "Your watchlist"
                      : "Service directory"}{" "}
                    <span className="count-label">
                      {page === "Watchlist" ? watchlist.length : items.length}
                    </span>
                  </h2>
                </div>
                <div className="overview-heading-actions">
                  {page === "Overview" && (
                    <BackgroundSettings
                      watchlist={watchlist}
                      compact
                      onConfigure={() => openModal("settings")}
                    />
                  )}
                  <button
                    className={`icon-button refresh-button ${loading ? "loading" : ""}`}
                    disabled={loading}
                    onClick={refresh}
                    aria-label={
                      loading
                        ? "Refreshing…"
                        : fetchedAt
                          ? `Refresh. Updated ${age(fetchedAt).toLowerCase()}`
                          : "Refresh. Not checked yet"
                    }
                    title={
                      loading
                        ? "Refreshing…"
                        : fetchedAt
                          ? `Updated ${age(fetchedAt).toLowerCase()}`
                          : "Not checked yet"
                    }
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>
              </div>
              <div className="directory-toolbar">
                <div className="tabs">
                  {(page === "Watchlist"
                    ? ["All services", "Disruptions"]
                    : ["All services", "Disruptions", "Watching"]
                  ).map((f) => (
                    <button
                      className={filter === f ? "selected" : ""}
                      key={f}
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                    >
                      {page === "Watchlist" && f === "All services"
                        ? "All watched"
                        : f}
                      {/* The count's slot is always here, even before the
                          first reading lands. Letting it appear with the data
                          grew this pill by 28px and shoved "Watching" sideways
                          on every load, and again whenever the count crossed
                          zero or gained a digit. */}
                      {f === "Disruptions" && (
                        <span
                          className={directoryDisrupted > 0 ? "" : "is-empty"}
                          aria-hidden={directoryDisrupted === 0 || undefined}
                        >
                          {directoryDisrupted > 0 ? directoryDisrupted : "0"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="directory-search">
                  <div className="search-input">
                    <Search size={16} />
                    <input
                      ref={searchRef}
                      placeholder="Search services…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search services"
                    />
                    <kbd>/</kbd>
                  </div>
                  <FilterMenu
                    className="category-filter"
                    value={category}
                    options={["All categories", ...categories]}
                    onChange={setCategory}
                    icon={<Funnel size={16} />}
                    label="Filter service category"
                  />
                </div>
              </div>
              <div className="visually-hidden" role="status" aria-live="polite">
                {firstLoad
                  ? "Checking official provider feeds…"
                  : fetchedAt
                    ? `${visible.length} services loaded`
                    : ""}
              </div>
              <div
                className="service-table-wrap"
                ref={page === "Watchlist" ? watchWrapRef : null}
              >
                {firstLoad ? (
                  /* Before the first reading lands, every provider reads
                     "Status unavailable" — a wall of grey pills that looks like
                     a total failure rather than a page that is still loading. */
                  <ul className="service-list" aria-busy="true">
                    {Array.from({ length: 6 }, (_, i) => (
                      <li className="skeleton-row" key={i}>
                        <span className="skeleton skeleton-avatar" />
                        <div>
                          <span className="skeleton skeleton-line medium" />
                          <span className="skeleton skeleton-line short" />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : shown.length && compact ? (
                  /* One data path, two presentations. A phone gets list rows
                     whose whole surface is the tap target; a wide window gets
                     the full comparison table. */
                  <ul className="service-list">
                    {shown.map((p) => {
                      const watched = watchlist.includes(p.id);
                      const healthy = p.components.filter(
                        (c) => c.status === "operational",
                      ).length;
                      return (
                        <li className="service-row" key={p.id}>
                          <button
                            className="service-row-main"
                            onClick={() => openProvider(p)}
                          >
                            <ProviderLogo provider={p} />
                            <span className="service-row-text">
                              <strong>{p.name}</strong>
                              <span className="service-row-meta">
                                <Status status={p.status} />
                                <small>
                                  {p.stale
                                    ? "Stale reading"
                                    : p.components.length
                                      ? `${healthy}/${p.components.length} healthy`
                                      : p.category}
                                </small>
                              </span>
                            </span>
                            <ChevronRight size={20} />
                          </button>
                          <button
                            className={`star-button ${watched ? "watched" : ""}`}
                            aria-label={`Watch ${p.name}`}
                            aria-pressed={watched}
                            onClick={() => toggleWatch(p.id)}
                          >
                            <Star
                              size={20}
                              weight={watched ? "fill" : "regular"}
                              className={`watchlist-star ${watched ? "watched" : ""}`}
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : shown.length ? (
                  <table className="service-table">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Status</th>
                        <th>Category</th>
                        <th>
                          Component health{" "}
                          <button
                            title="Each bar is a reported component, not historical uptime"
                            onClick={() => openModal("methodology")}
                            aria-label="About component health"
                          >
                            <CircleHelp size={16} />
                          </button>
                        </th>
                        <th aria-label="Watchlist" />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <button
                              className="service-name"
                              onClick={() => openProvider(p)}
                            >
                              <ProviderLogo provider={p} />
                              <span>
                                <strong>{p.name}</strong>
                                <small>{p.product}</small>
                              </span>
                            </button>
                          </td>
                          <td>
                            <Status status={p.status} />
                          </td>
                          <td>
                            <span className="category-label">{p.category}</span>
                          </td>
                          <td>
                            <button
                              className="component-cell"
                              onClick={() => openProvider(p)}
                              aria-label={`View ${p.name} component health`}
                            >
                              <div className="health-bars">
                                {(p.components.length && !p.stale
                                  ? p.components.slice(0, 38)
                                  : Array.from({ length: 30 }, () => ({
                                      status: "unknown",
                                    }))
                                ).map((component, i) => (
                                  <i
                                    key={i}
                                    title={
                                      component.name
                                        ? `${component.name}: ${component.status.replaceAll("_", " ")}`
                                        : "No component data"
                                    }
                                    className={component.status}
                                  />
                                ))}
                              </div>
                              <span>
                                {p.stale
                                  ? "Stale component reading"
                                  : p.components.length
                                    ? `${p.components.filter((component) => component.status === "operational").length} / ${p.components.length} healthy`
                                    : "No component data"}
                              </span>
                            </button>
                          </td>
                          <td>
                            <button
                              className={`star-button ${watchlist.includes(p.id) ? "watched" : ""}`}
                              aria-label={`Watch ${p.name}`}
                              aria-pressed={watchlist.includes(p.id)}
                              onClick={() => toggleWatch(p.id)}
                            >
                              <Star
                                size={16}
                                weight={
                                  watchlist.includes(p.id) ? "fill" : "regular"
                                }
                                className={`watchlist-star ${watchlist.includes(p.id) ? "watched" : ""}`}
                              />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    {page === "Watchlist" && !watchlist.length ? (
                      <>
                        <Star size={24} />
                        <h3>Your watchlist is empty</h3>
                        <p>
                          Choose the services you depend on and Pulse will keep
                          them in one focused view, with alerts when one reports
                          a new issue.
                        </p>
                        <button
                          className="button primary"
                          onClick={() => openModal("monitor")}
                        >
                          <Plus size={16} />
                          Add services
                        </button>
                      </>
                    ) : (
                      <>
                        <Search size={24} />
                        <h3>No services match this view</h3>
                        <p>
                          Try another search term, or clear the filters to see
                          everything again.
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => {
                            setSearch("");
                            setCategory("All categories");
                            setFilter("All services");
                          }}
                        >
                          Clear filters
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {page === "Watchlist" && <ScrollHint shown={watchHint} />}
              {/* One control, not two: the footer line that used to report
                  "Showing 3 of 28" is the control that opens the rest. */}
              <div className="table-footer">
                {previewing ? (
                  <button
                    className="table-footer-toggle"
                    onClick={() => openModal("monitor")}
                    aria-haspopup="dialog"
                  >
                    View all {visible.length} services
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <span />
                )}
                <span>
                  <ShieldCheck size={16} />
                  {directoryVerified} fresh ·{" "}
                  {directoryItems.length - directoryVerified} unavailable
                </span>
              </div>
            </section>
          )}
          {page === "Incidents" && (
            <section className="panel incident-page">
              <div className="panel-heading">
                <div>
                  <h2>
                    Active incident feed{" "}
                    <span className="count-label">{allIncidents.length}</span>
                  </h2>
                </div>
                <button
                  className={`icon-button refresh-button ${loading ? "loading" : ""}`}
                  onClick={refresh}
                  disabled={loading}
                  aria-label={loading ? "Refreshing…" : "Refresh the feed"}
                  title={loading ? "Refreshing…" : "Refresh the feed"}
                >
                  <RefreshCw size={20} />
                </button>
              </div>
              {/* The feed is the only part of this page that scrolls; the bar
                  above it and the footer below hold their place in a page that
                  fills the viewport. */}
              <div className="incident-feed" ref={incidentFeedRef}>
                {allIncidents.length ? (
                  allIncidents.map((i) => (
                    <Incident
                      key={`${i.provider.id}-${i.id}`}
                      incident={i}
                      onClick={() => openProvider(i.provider)}
                      expanded
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    <CheckCheck size={32} />
                    <h3>No active incidents reported</h3>
                    <p>
                      {verified} feeds verified. Unavailable feeds are not
                      included.
                    </p>
                  </div>
                )}
              </div>
              <ScrollHint shown={incidentHint} />
            </section>
          )}
          {page === "Overview" && (
            <section className="insights-section">
              {/* The heading stands alone: the insight cards below it are
                  themselves the way through to Dependency insights, which
                  also has its own entry in the More sheet. */}
              <div className="section-title">
                <h2>
                  Small disruptions. <span>Wider ripples.</span>
                </h2>
              </div>
              <div className="insight-grid">
                {["AI products", "E-commerce", "Developer tools"].map(
                  (name, index) => {
                    const relevant = items.filter((p) =>
                      p.industries.includes(name),
                    );
                    const affected = explainIndustry(
                      items,
                      name,
                      watchlist,
                      now,
                    ).issues;
                    const Icon = [Zap, Globe2, Command][index];
                    return (
                      <button
                        className="insight-card"
                        key={name}
                        onClick={() => {
                          go("Dependency insights");
                        }}
                      >
                        <span className={`insight-icon color-${index}`}>
                          <Icon size={20} />
                        </span>
                        <ArrowUpRight className="insight-arrow" size={16} />
                        <h3>{name}</h3>
                        <p>
                          {
                            [
                              "The models and platforms powering intelligent products.",
                              "The networks behind storefronts and digital experiences.",
                              "The infrastructure behind your next build.",
                            ][index]
                          }
                        </p>
                        <div className="insight-card-bottom">
                          <span className="mini-logos">
                            {relevant.slice(0, 4).map((p) => (
                              <ProviderLogo key={p.id} provider={p} />
                            ))}
                          </span>
                          <span>
                            {affected.length ? (
                              <>
                                <i className="state-dot degraded" />
                                {affected.length} reporting issues
                              </>
                            ) : (
                              `${relevant.length} relevant providers`
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </section>
          )}
          {/* Dependency insights is a list destination like Incidents and
              Watchlist, so it stands directly in the page rather than inside
              the Overview's insight wrapper: the stylesheet needs the card to
              be a child of main to hold it between the title and the footer. */}
          {page === "Dependency insights" && (
            <InsightDetails
              items={items}
              watchlist={watchlist}
              onWatch={toggleWatch}
              onProvider={openProvider}
              now={now}
              listRef={insightListRef}
              hint={insightHint}
            />
          )}
          {page !== "Global map" && (
            <footer className="page-footer">
              <span>
                <PulseMark size={20} /> Stay informed. Build with confidence.
              </span>
              <button onClick={() => openModal("methodology")}>
                Independent monitoring · Official sources{" "}
                <ArrowUpRight size={16} />
              </button>
            </footer>
          )}
        </main>
      </div>
      {bottomNavigation}
      {toast && <Toast key={toast}>{toast}</Toast>}
      {modal && (
        <Modal
          title={
            modal === "provider"
              ? detail?.name || "Service details"
              : {
                  monitor: "Make it your watchlist",
                  notifications: "Your incident inbox",
                  settings: "Your preferences",
                  methodology: "Clarity starts with good sources",
                  apps: "Pulse, wherever you work",
                }[modal]
          }
          onClose={closeModal}
          wide={modal === "provider" || modal === "notifications"}
          actions={
            modal === "provider" && detail ? (
              <>
                <button
                  className="button secondary"
                  onClick={() => toggleWatch(detail.id)}
                >
                  <Star
                    size={16}
                    weight={watchlist.includes(detail.id) ? "fill" : "regular"}
                    className={`watchlist-star ${watchlist.includes(detail.id) ? "watched" : ""}`}
                  />
                  {watchlist.includes(detail.id)
                    ? "Remove from watchlist"
                    : "Add to watchlist"}
                </button>
                <a
                  className="button primary"
                  href={detail.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official status page <ExternalLink size={16} />
                </a>
              </>
            ) : modal === "monitor" ? (
              <button
                className="button primary full-width"
                onClick={() => {
                  dismiss();
                  setToast("Your watchlist is saved.");
                }}
              >
                Done · {watchlist.length} services selected
              </button>
            ) : null
          }
        >
          {modal === "monitor" && (
            <>
              <div className="search-input modal-search">
                <Search size={16} />
                <input
                  placeholder="Find a service…"
                  aria-label="Find a service to watch"
                  value={monitorSearch}
                  onChange={(e) => setMonitorSearch(e.target.value)}
                />
              </div>
              <div className="monitor-list">
                {items
                  .filter((p) =>
                    p.name.toLowerCase().includes(monitorSearch.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      role="checkbox"
                      aria-checked={watchlist.includes(p.id)}
                      onClick={() => toggleWatch(p.id)}
                    >
                      <ProviderLogo provider={p} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.product}</small>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`checkbox ${watchlist.includes(p.id) ? "checked" : ""}`}
                      >
                        {watchlist.includes(p.id) && <Check size={16} />}
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
          {modal === "provider" && detail && (
            <>
              <div className="provider-detail-header">
                <ProviderLogo provider={detail} />
                <div>
                  <h3>{detail.product}</h3>
                  <p>{detail.category}</p>
                </div>
                <Status status={detail.status} />
              </div>
              <p className="source-description">{detail.description}</p>
              {detail.stale && (
                <p className="error-banner" role="status">
                  This reading is stale. Last known status:{" "}
                  {statusLabels[detail.lastKnownStatus] || "unavailable"}.
                  Components and incidents below are historical until a
                  successful refresh.
                </p>
              )}
              {detail.error && (
                <p className="modal-description">
                  Feed diagnostic: {detail.error}
                </p>
              )}
              <div className="detail-meta">
                <span>
                  Last successful check
                  <strong>
                    {detail.checkedAt
                      ? timestamp(detail.checkedAt)
                      : "Not verified"}
                  </strong>
                </span>
                <span>
                  Source last changed
                  <strong>
                    {detail.sourceUpdatedAt
                      ? timestamp(detail.sourceUpdatedAt)
                      : "Not provided"}
                  </strong>
                </span>
              </div>
              {detail.incidents.length > 0 && (
                <div className="detail-incidents">
                  <h3>
                    {detail.stale ? "Last known incidents" : "Active incidents"}
                  </h3>
                  {detail.incidents.map((i) => (
                    <article key={i.id}>
                      <span className="incident-phase">
                        {(i.status || "active").replaceAll("_", " ")}
                      </span>
                      <h4>{i.name}</h4>
                      <p>{i.body}</p>
                      <small>Updated {age(i.updatedAt).toLowerCase()}</small>
                      {i.components?.length > 0 && (
                        <p>Affected services: {i.components.join(", ")}</p>
                      )}
                      {i.updates?.length > 1 && (
                        <details className="incident-update-history">
                          <summary>
                            Provider update timeline ({i.updates.length})
                          </summary>
                          {i.updates.map((u, index) => (
                            <div key={`${u.at}-${index}`}>
                              <small>
                                {u.at ? timestamp(u.at) : "Time not provided"} ·{" "}
                                {u.status?.replaceAll("_", " ")}
                              </small>
                              <p>{u.body}</p>
                            </div>
                          ))}
                        </details>
                      )}
                    </article>
                  ))}
                </div>
              )}
              <div className="components-list">
                <h3>
                  {detail.stale
                    ? "Last known components"
                    : "Reported components"}{" "}
                  <span className="count-label">
                    {detail.components.length}
                  </span>
                </h3>
                {detail.components.length ? (
                  detail.components.map((c) => (
                    <div key={c.id}>
                      <span>{c.name}</span>
                      <span className={`component-state ${c.status}`}>
                        <i />
                        {c.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Component data is unavailable. Visit the official source for
                    details.
                  </p>
                )}
              </div>
            </>
          )}
          {modal === "notifications" && (
            <IncidentInbox
              incidents={allIncidents}
              items={items}
              watchlist={watchlist}
              dismissed={dismissedIncidents}
              onDismiss={dismissIncident}
              read={readIncidents}
              onRead={markIncidentsRead}
              onProvider={openProvider}
              onRefresh={refresh}
              loading={loading}
              now={now}
              error={error}
            />
          )}
          {modal === "settings" && (
            <>
              <div className="setting-row">
                <span>
                  <strong>Appearance</strong>
                  <small>Choose light or dark mode.</small>
                </span>
                <button
                  className="theme-toggle"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                  <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                </button>
              </div>
              <BackgroundSettings watchlist={watchlist} />
              <div className="setting-row">
                <span>
                  <strong>Automatic refresh</strong>
                  <small>
                    Check official feeds every 30 seconds while visible. Hidden
                    pages pause automatically.
                  </small>
                </span>
                <button
                  className={`toggle ${autoRefresh ? "on" : ""}`}
                  role="switch"
                  aria-checked={autoRefresh}
                  aria-label="Automatic refresh"
                  onClick={() => setAutoRefresh((v) => !v)}
                >
                  <i />
                </button>
              </div>
              <div className="setting-row">
                <span>
                  <strong>Local watchlist</strong>
                  <small>
                    {watchlist.length} services saved on this device.
                  </small>
                </span>
                <button
                  className="text-button"
                  onClick={() => openModal("monitor")}
                >
                  Manage <ArrowRight size={16} />
                </button>
              </div>
              <p className="methodology-note">
                Preferences stay on this device. No account or tracking cookies
                are required.
              </p>
            </>
          )}
          {modal === "methodology" && (
            <div className="prose">
              <SignalArcs />
              <p>
                Pulse reads public, official provider status feeds. It is an
                independent aggregator and is not affiliated with the providers
                shown.
              </p>
              <h3>Provider-reported, with context</h3>
              <p>
                Feeds are checked every 30 seconds while connected. Results
                stream in as each check completes; the provider may publish with
                a delay. “Operational” reflects the provider’s overall status,
                not an independent availability test. “Status unavailable” means
                Pulse could not retrieve or understand the feed. Check
                timestamps before relying on a reading.
              </p>
              <h3>Components, not invented uptime</h3>
              <p>
                The bars show the first 38 current component readings. The
                adjacent count includes all reported components. Green means
                operational, amber degraded or maintenance, red outage, and gray
                unavailable. Historical uptime requires measurements over time
                and is not estimated here.
              </p>
              <h3>The map and industry insights</h3>
              <p>
                Map colors reflect fresh components that explicitly name each
                hub. Provider-wide incidents appear separately when their
                location is not reported. Industry groupings indicate potential
                relevance of a provider’s services, not verified company
                dependencies, financial losses, or confirmed downstream outages.
              </p>
              <h3>Verify at the source</h3>
              <p>
                Open any provider to see reported components, active incident
                details, and a link to its official status page.
              </p>
              <p className="methodology-byline">
                <strong>Built by Haroon K M</strong>
                Something would look broken and I would have eight status pages
                open trying to work out whose problem it was. That is the whole
                reason this exists: one question, asked once, in one place.
              </p>
            </div>
          )}
          {modal === "apps" && (
            <div className="prose">
              <p>One consistent view across the web, Windows, and Android.</p>
              <div className="app-option">
                <Globe2 size={24} />
                <span>
                  <strong>Web</strong>
                  <small>You’re using the shared Pulse experience.</small>
                </span>
                <Check size={16} />
              </div>
              <a
                className="app-option"
                href={downloads.windows}
                target="_blank"
                rel="noreferrer"
              >
                <Layers3 size={24} />
                <span>
                  <strong>Windows desktop</strong>
                  <small>
                    Download the portable EXE for Windows 10+ (64-bit).
                  </small>
                </span>
                <Download size={16} />
              </a>
              <a
                className="app-option"
                href={downloads.android}
                target="_blank"
                rel="noreferrer"
              >
                <PulseMark size={24} />
                <span>
                  <strong>Android</strong>
                  <small>
                    Installable APK with watchlist alerts and a home-screen
                    widget.
                  </small>
                </span>
                <Download size={16} />
              </a>
              <p className="methodology-note">
                Early-access builds: Windows is unsigned; Android uses a
                development signature.{" "}
                <a href={downloads.checksums} target="_blank" rel="noreferrer">
                  Verify downloads
                </a>
                .
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function Summary({ label, number, icon: Icon, note, color, onClick, loading }) {
  return (
    <button
      className={`summary-card ${color}`}
      data-motion-card
      onClick={onClick}
      disabled={!onClick}
      aria-busy={loading || undefined}
    >
      <div>
        <span>{label}</span>
        <Icon size={20} />
      </div>
      {/* The number is the message. The old bar-chart flourish drew a shape
          that looked like history this product does not measure. */}
      {loading ? (
        <span className="skeleton skeleton-metric" />
      ) : (
        <strong>{number}</strong>
      )}
      <small>
        {loading ? (
          <span className="skeleton skeleton-line medium" />
        ) : (
          <>
            {color === "green" && <i className="state-dot operational" />}
            {note}
          </>
        )}
      </small>
    </button>
  );
}
function Incident({ incident: i, onClick, expanded }) {
  return (
    <button
      className={`incident-item ${expanded ? "expanded-incident" : ""}`}
      data-motion-card
      onClick={onClick}
    >
      <div className="incident-meta">
        <ProviderLogo provider={i.provider} />
        <strong>{i.provider.name}</strong>
        <span>{age(i.updatedAt)}</span>
      </div>
      <h3>{i.name}</h3>
      {expanded && <p>{i.body}</p>}
      <div className="incident-bottom">
        <span
          className={`incident-phase ${i.impact === "critical" ? "critical" : ""}`}
        >
          <i />
          {(i.status || "active").replaceAll("_", " ")}
        </span>
        <span>
          {i.components.length
            ? `${i.components.length} component${i.components.length === 1 ? "" : "s"}`
            : "Provider update"}
          <ChevronRight size={16} />
        </span>
      </div>
    </button>
  );
}
