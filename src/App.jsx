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
import BackgroundSettings, { useBackgroundSync } from "./BackgroundSettings";
import { isFresh } from "../shared/monitor";
import { providers, categories, statusLabels } from "../shared/providers";
import WorldMap from "./WorldMap";
import PulseMark from "./PulseMark";
import ProviderLogo from "./ProviderLogo";
import { downloads } from "../shared/downloads";
import { gsap, hoverMotionEnabled, motionEnabled } from "./motion";

const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Incidents", icon: Radio },
  { name: "Watchlist", icon: Star },
  { name: "Global map", icon: Globe2 },
  { name: "Developer tools", icon: Command },
  { name: "Dependency insights", icon: Network },
];
function saved(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
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
function Status({ status }) {
  return (
    <span className={`status-pill ${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  const backdropRef = useRef();
  useLayoutEffect(() => {
    if (!motionEnabled()) return;
    const context = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          backdropRef.current,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.18 },
        )
        .fromTo(
          ref.current,
          { autoAlpha: 0, y: 18, scale: 0.985 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.32 },
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
        const nodes = ref.current?.querySelectorAll(
          'button, a, input, select, [tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
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
      previous?.focus();
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
        {children}
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
      <Check size={17} />
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
      theme === "dark" ? "#161616" : "#ffffff";
  }, [theme]);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("pulse-theme", next);
    } catch {}
  }
  const [page, setPage] = useState("Overview");
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
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
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
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const [monitorSearch, setMonitorSearch] = useState("");
  const [readIncidents, setReadIncidents] = useState(() => {
    const value = saved("pulse-inbox-read", {});
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  });
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
  const sidebarRef = useRef();
  const menuRef = useRef();
  const pageStageRef = useRef();
  const scrimRef = useRef();
  const closeNavigation = () => {
    setMobileNav(false);
    menuRef.current?.focus();
  };
  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const scrollArea = sidebarRef.current?.querySelector(".sidebar-scroll");
    if (scrollArea) scrollArea.scrollTop = 0;
    sidebarRef.current?.querySelector(".sidebar-close")?.focus();
    const viewport = window.matchMedia("(max-width: 760px)");
    const resize = () => {
      if (!viewport.matches) setMobileNav(false);
    };
    viewport.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      viewport.removeEventListener("change", resize);
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
  useEffect(() => {
    const open = () => setPage("Watchlist");
    window.addEventListener("pulse-open-watchlist", open);
    if (new URLSearchParams(location.search).has("watchlist")) open();
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
      if (e.key === "Escape" && mobileNav) closeNavigation();
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
  const go = (name) => {
    setPage(name);
    setMobileNav(false);
    setSearch("");
    setFilter("All services");
    setCategory("All categories");
  };
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
          { autoAlpha: 0, x: -8 },
          { autoAlpha: 1, x: 0, duration: 0.24, stagger: 0.025 },
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
  const closeModal = useCallback(() => {
    setModal(null);
    setSelected(null);
  }, []);
  const openProvider = (p) => {
    setSelected(p.id);
    setModal("provider");
  };
  const detailProvider = items.find((p) => p.id === selected);
  const detail = detailProvider
    ? {
        ...detailProvider,
        incidents: detailProvider.incidents.map(latestIncident),
      }
    : undefined;
  const navigationButton = compact ? (
    <button
      className="icon-button page-menu"
      ref={menuRef}
      aria-label="Open navigation"
      aria-expanded={mobileNav}
      aria-controls="workspace-navigation"
      onClick={() => setMobileNav(true)}
    >
      <Menu size={20} />
    </button>
  ) : null;
  const notificationButton = (
    <button
      className="icon-button notification-button"
      aria-label="Open incident notifications"
      onClick={() => {
        setModal("notifications");
        void refresh();
      }}
    >
      <Bell size={20} />
      {unreadIncidents > 0 && (
        <i aria-label={`${unreadIncidents} unread incident updates`} />
      )}
    </button>
  );
  return (
    <div className="app-shell">
      {mobileNav && (
        <div ref={scrimRef} className="nav-scrim" onClick={closeNavigation} />
      )}
      <aside
        id="workspace-navigation"
        ref={sidebarRef}
        className={`sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="Workspace navigation"
        role={mobileNav ? "dialog" : undefined}
        aria-modal={mobileNav || undefined}
        onClickCapture={(e) => {
          if (mobileNav && e.target.closest("button, a")) closeNavigation();
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
              <PulseMark size={28} />
            </span>
            pulse<span className="brand-period">.</span>
          </a>
          <button
            className="icon-button sidebar-close"
            aria-label="Close navigation"
            onClick={closeNavigation}
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
          <button className="workspace" onClick={() => go("Watchlist")}>
            <span className="workspace-symbol">
              <Globe2 size={17} />
            </span>
            <span>
              Your saved services
              <small>{watchlist.length} on your watchlist</small>
            </span>
            <ChevronDown size={14} />
          </button>
          <div className="nav-label">EXPLORE</div>
          <nav aria-label="Main navigation">
            {navigation.map(({ name, icon: Icon }) => (
              <button
                key={name}
                onClick={() => go(name)}
                className={`nav-item ${page === name ? "active" : ""}`}
                aria-current={page === name ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{name}</span>
                {name === "Incidents" && allIncidents.length > 0 && (
                  <b className="nav-count">{allIncidents.length}</b>
                )}
                {name === "Watchlist" && <small>{watchlist.length}</small>}
              </button>
            ))}
          </nav>
          <div className="nav-label following-label">
            YOUR WATCHLIST{" "}
            <button
              aria-label="Edit watchlist"
              onClick={() => setModal("monitor")}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="sidebar-watches">
            {items
              .filter((p) => watchlist.includes(p.id))
              .slice(0, 5)
              .map((p) => (
                <button key={p.id} onClick={() => openProvider(p)}>
                  <ProviderLogo provider={p} />
                  <span>{p.name}</span>
                  <i className={`state-dot ${p.status}`} />
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
              <ArrowRight size={13} />
            </button>
          )}
          <div className="download-card">
            <span className="download-card-icon">
              <Layers3 size={19} />
            </span>
            <h3>A little peace of mind.</h3>
            <p>
              Your infrastructure, in view.
              <br />
              Wherever you work.
            </p>
            <button onClick={() => setModal("apps")}>
              Get Pulse for your device <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
        <div className="sidebar-bottom">
          {compact && import.meta.env.VITE_STATUS_TRANSPORT === "poll" && (
            <button className="nav-item" onClick={() => setModal("apps")}>
              <Download size={18} />
              <span>Get the app</span>
              <ArrowUpRight size={14} />
            </button>
          )}
          <button className="nav-item" onClick={() => setModal("methodology")}>
            <CircleHelp size={18} />
            <span>Help & methodology</span>
            <ArrowUpRight size={14} />
          </button>
          <button
            className="nav-item sidebar-settings"
            onClick={() => setModal("settings")}
          >
            <Settings size={18} />
            <span>Settings</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <main
          ref={pageStageRef}
          className={page === "Global map" ? "map-main" : ""}
        >
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> A CLEARER PICTURE OF THE INTERNET
              </div>
              <div className="page-title-row">
                {navigationButton}
                <h1>
                  {page === "Overview" ? (
                    <>
                      Internet health, <span>in view.</span>
                    </>
                  ) : page === "Global map" ? (
                    "A connected world."
                  ) : page === "Incidents" ? (
                    "Every signal. Less noise."
                  ) : page === "Watchlist" ? (
                    "Your stack, at a glance."
                  ) : page === "Developer tools" ? (
                    "Built for your next deploy."
                  ) : (
                    "See the bigger picture."
                  )}
                </h1>
                {notificationButton}
              </div>
              <p>
                {page === "Overview"
                  ? "Know what’s down. Understand what it means. Stay one step ahead."
                  : page === "Global map"
                    ? "Explore the infrastructure hubs behind a connected digital economy."
                    : page === "Incidents"
                      ? "Active incidents, straight from the services you rely on."
                      : page === "Watchlist"
                        ? "A focused view of the services that matter most to you."
                        : page === "Developer tools"
                          ? "Registry health, component signals, and security utilities in one place."
                          : "Major issues and degradation across services, with practical next checks."}
              </p>
            </div>
          </div>
          {error && page !== "Global map" && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={17} />
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
            />
          )}
          {page === "Overview" && (
            <div className="summary-grid">
              <Summary
                label="Services tracked"
                number={items.length}
                icon={Layers3}
                note={`${categories.length} essential technology sectors`}
                color="neutral"
              />
              <Summary
                label="Operational"
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
              />
              {page === "Overview" && (
                <section className="panel incidents-panel">
                  <div className="panel-heading">
                    <h2>
                      <span className="signal-icon">
                        <Radio size={17} />
                      </span>
                      Live incidents{" "}
                      <span className="count-label">{allIncidents.length}</span>
                    </h2>
                    <span className="live-label">
                      <i />
                      {loading ? "SYNCING" : "FEED"}
                    </span>
                  </div>
                  <div className="incident-stream">
                    {allIncidents.length ? (
                      allIncidents.map((i) => (
                        <Incident
                          key={`${i.provider.id}-${i.id}`}
                          incident={i}
                          onClick={() => openProvider(i.provider)}
                        />
                      ))
                    ) : (
                      <div className="quiet-state">
                        <ShieldCheck size={31} />
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
                    View all incidents <ArrowRight size={15} />
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
                  <p>The building blocks of your digital world.</p>
                </div>
                <div className="overview-heading-actions">
                  {page === "Overview" && (
                    <BackgroundSettings
                      watchlist={watchlist}
                      compact
                      onConfigure={() => setModal("settings")}
                    />
                  )}
                  <button
                    className={`text-button refresh-button ${loading ? "loading" : ""}`}
                    disabled={loading}
                    onClick={refresh}
                  >
                    <RefreshCw size={13} />
                    {loading
                      ? "Refreshing…"
                      : `Updated ${age(fetchedAt).toLowerCase()}`}
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
                      onClick={() => setFilter(f)}
                    >
                      {page === "Watchlist" && f === "All services"
                        ? "All watched"
                        : f}
                      {f === "Disruptions" && directoryDisrupted > 0 && (
                        <span>{directoryDisrupted}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="directory-search">
                  <div className="search-input">
                    <Search size={15} />
                    <input
                      ref={searchRef}
                      placeholder="Search services…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search services"
                    />
                    <kbd>/</kbd>
                  </div>
                  <select
                    aria-label="Filter service category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option>All categories</option>
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="service-table-wrap">
                {visible.length ? (
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
                            onClick={() => setModal("methodology")}
                            aria-label="About component health"
                          >
                            <CircleHelp size={12} />
                          </button>
                        </th>
                        <th aria-label="Watchlist" />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((p) => (
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
                              aria-label={`${watchlist.includes(p.id) ? "Remove" : "Add"} ${p.name} ${watchlist.includes(p.id) ? "from" : "to"} watchlist`}
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
                    <Search size={26} />
                    <h3>No services in this view</h3>
                    <p>
                      Try another search or add a service to your watchlist.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setSearch("");
                        setCategory("All categories");
                        setFilter("All services");
                        if (page === "Watchlist") setModal("monitor");
                      }}
                    >
                      Reset view
                    </button>
                  </div>
                )}
              </div>
              <div className="table-footer">
                <span>
                  Showing {visible.length} of {directoryItems.length} services
                </span>
                <span>
                  <ShieldCheck size={13} />
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
                  <p>
                    Provider updates are checked every 30 seconds while
                    automatic refresh is enabled.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={refresh}
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
              </div>
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
                  <CheckCheck size={34} />
                  <h3>No active incidents reported</h3>
                  <p>
                    {verified} feeds verified. Unavailable feeds are not
                    included.
                  </p>
                </div>
              )}
            </section>
          )}
          {(page === "Overview" || page === "Dependency insights") && (
            <section className="insights-section">
              {page === "Overview" && (
                <>
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">BEYOND THE STATUS LIGHT</span>
                      <h2>Small disruptions. Wider ripples.</h2>
                    </div>
                    {page === "Overview" && (
                      <button
                        className="text-button"
                        onClick={() => go("Dependency insights")}
                      >
                        Explore dependencies <ArrowUpRight size={15} />
                      </button>
                    )}
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
                              <Icon size={19} />
                            </span>
                            <ArrowUpRight className="insight-arrow" size={17} />
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
                </>
              )}
              {page === "Dependency insights" && (
                <InsightDetails
                  items={items}
                  watchlist={watchlist}
                  onWatch={toggleWatch}
                  onProvider={openProvider}
                  now={now}
                />
              )}
            </section>
          )}
          {page !== "Global map" && (
            <footer className="page-footer">
              <span>
                <PulseMark size={20} /> Stay informed. Build with confidence.
              </span>
              <button onClick={() => setModal("methodology")}>
                Independent monitoring · Official sources{" "}
                <ArrowUpRight size={12} />
              </button>
            </footer>
          )}
        </main>
      </div>
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
        >
          {modal === "monitor" && (
            <>
              <p className="modal-description">
                Keep the services you rely on in one focused view. Your choices
                are saved on this device.
              </p>
              <div className="search-input modal-search">
                <Search size={17} />
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
                    <button key={p.id} onClick={() => toggleWatch(p.id)}>
                      <ProviderLogo provider={p} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.product}</small>
                      </span>
                      <span
                        className={`checkbox ${watchlist.includes(p.id) ? "checked" : ""}`}
                      >
                        {watchlist.includes(p.id) && <Check size={13} />}
                      </span>
                    </button>
                  ))}
              </div>
              <button
                className="button primary full-width"
                onClick={() => {
                  closeModal();
                  setToast("Your watchlist is saved.");
                }}
              >
                Done · {watchlist.length} services selected
              </button>
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
                      ? new Date(detail.checkedAt).toLocaleString()
                      : "Not verified"}
                  </strong>
                </span>
                <span>
                  Source last changed
                  <strong>
                    {detail.sourceUpdatedAt
                      ? new Date(detail.sourceUpdatedAt).toLocaleString()
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
                                {u.at
                                  ? new Date(u.at).toLocaleString()
                                  : "Time not provided"}{" "}
                                · {u.status?.replaceAll("_", " ")}
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
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => toggleWatch(detail.id)}
                >
                  <Star
                    size={15}
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
                  Official status page <ExternalLink size={14} />
                </a>
              </div>
            </>
          )}
          {modal === "notifications" && (
            <IncidentInbox
              incidents={allIncidents}
              items={items}
              watchlist={watchlist}
              read={readIncidents}
              onRead={markIncidentsRead}
              onProvider={openProvider}
              onRefresh={refresh}
              loading={loading}
              now={now}
              error={error}
              fetchedAt={fetchedAt}
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
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
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
                  onClick={() => setModal("monitor")}
                >
                  Manage <ArrowRight size={14} />
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
            </div>
          )}
          {modal === "apps" && (
            <div className="prose">
              <p>One consistent view across the web, Windows, and Android.</p>
              <div className="app-option">
                <Globe2 size={23} />
                <span>
                  <strong>Web</strong>
                  <small>You’re using the shared Pulse experience.</small>
                </span>
                <Check size={17} />
              </div>
              <a
                className="app-option"
                href={downloads.windows}
                target="_blank"
                rel="noreferrer"
              >
                <Layers3 size={23} />
                <span>
                  <strong>Windows desktop</strong>
                  <small>
                    Download the portable EXE for Windows 10+ (64-bit).
                  </small>
                </span>
                <Download size={17} />
              </a>
              <a
                className="app-option"
                href={downloads.android}
                target="_blank"
                rel="noreferrer"
              >
                <PulseMark size={28} />
                <span>
                  <strong>Android</strong>
                  <small>
                    Installable APK with watchlist alerts and a home-screen
                    widget.
                  </small>
                </span>
                <Download size={17} />
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
function Summary({ label, number, icon: Icon, note, color, onClick }) {
  return (
    <button
      className={`summary-card ${color}`}
      data-motion-card
      onClick={onClick}
      disabled={!onClick}
    >
      <div>
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <strong>
        {number}
        <span className="summary-decoration">
          {color === "green" ? (
            <>
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </>
          ) : color === "amber" ? (
            <Activity size={51} />
          ) : null}
        </span>
      </strong>
      <small>
        {color === "green" && <i className="state-dot operational" />}
        {note}
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
          <ChevronRight size={13} />
        </span>
      </div>
    </button>
  );
}
