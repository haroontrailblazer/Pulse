import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Plus,
  Minus,
  LocateFixed,
  Globe2,
  ChevronRight,
  ArrowRight,
  X,
  CircleHelp,
  Star,
  ArrowLeft,
  Funnel,
} from "./icons";
import { buildAtlas, severityRank, workflowHints } from "../shared/atlas.js";
import {
  filterIssueRows,
  issueStates,
  issueLabels,
} from "../shared/presentation";
import { latestIncident } from "../shared/incidents";
import { statusLabels } from "../shared/providers";
import ProviderLogo from "./ProviderLogo";
import StatusGlyph, { StatusShape } from "./StatusGlyph";
import mapData from "./map-data.json";
import { arrangeMapPins } from "../shared/map-layout";
import { gsap, motionEnabled } from "./motion";
import { dismiss, useDismissible } from "./navigation";
import FilterMenu from "./FilterMenu";
import "./map.css";

// The dock sits var(--space-2) off the bottom edge, the control row stands
// var(--space-3) above it, and that row is 46px tall. Mirrored by the narrow
// `bottom` calc in components.css.
const DOCK_STACK = 8 + 12 + 46;
// One press of the + button, which steps by 0.5.
const MAP_PAGE_ZOOM = 1.5;
const onAndroid = () =>
  typeof document !== "undefined" &&
  document.documentElement.dataset.platform === "android";
const views = {
  Global: [435, 210, 1],
  "North America": [250, 132, 1.85],
  Europe: [455, 110, 2.8],
  "Asia Pacific": [630, 222, 1.65],
  "South America": [325, 276, 2.2],
};
export default function WorldMap({
  expanded = false,
  providers = [],
  watchlist = [],
  now = Date.now(),
  onToggleWatch,
  feedError,
  onOpen,
  initialView,
}) {
  const frame = useRef(null),
    closeRef = useRef(null),
    triggerRef = useRef(null),
    bodyRef = useRef(null),
    headerRef = useRef(null),
    inspectorRef = useRef(null),
    dockRef = useRef(null);
  const [size, setSize] = useState({ width: 870, height: 600 });
  // The overlay header is four rows tall on a phone and one on a desktop, so
  // the space reserved for it has to be measured rather than assumed — markers
  // placed under it are unreadable and untappable.
  const [headerBottom, setHeaderBottom] = useState(140);
  const [region, setRegion] = useState("Global"),
    [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null),
    [panel, setPanel] = useState(null);
  const [severity, setSeverity] = useState("all"),
    [stackOnly, setStackOnly] = useState(false);
  const [service, setService] = useState(null),
    [evidenceLimit, setEvidenceLimit] = useState(6);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const measure = () => setHeaderBottom(node.offsetTop + node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // The corner controls are stacked on top of the dock, so the dock's height
  // decides where they sit. It is not a constant: the line wraps to a third
  // row on a 320px screen, where a fixed offset would either collide with it
  // or leave a hole everywhere else.
  const [dockHeight, setDockHeight] = useState(70);
  useEffect(() => {
    const node = dockRef.current;
    if (!node) return;
    const measure = () => setDockHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [panel]);
  useEffect(() => {
    if (panel) closeRef.current?.focus({ preventScroll: true });
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [panel, service, severity]);
  const atlas = useMemo(
    () =>
      buildAtlas(
        stackOnly
          ? providers.filter((p) => watchlist.includes(p.id))
          : providers,
        now,
        { includeMaintenance: true },
      ),
    [providers, watchlist, stackOnly, now],
  );
  const counts = Object.fromEntries(
    issueStates.map((state) => [
      state,
      filterIssueRows(atlas.issues, state).length,
    ]),
  );
  const hub = selected === null ? null : atlas.locations[selected];
  const regionalRows = Object.values(
    (hub?.signals || []).reduce((rows, signal) => {
      const row = (rows[signal.provider.id] ||= {
        provider: signal.provider,
        status: "unknown",
        evidence: [],
      });
      row.evidence.push(signal);
      if (severityRank[signal.status] > severityRank[row.status])
        row.status = signal.status;
      return rows;
    }, {}),
  )
    .map((row) =>
      row.status === "operational" &&
      row.evidence.some((e) => e.status === "unknown")
        ? { ...row, status: "unknown" }
        : row,
    )
    .sort((a, b) => severityRank[b.status] - severityRank[a.status]);
  const rows = filterIssueRows(
    panel === "region" ? regionalRows : atlas.issues,
    severity,
  );
  const focused = rows.find((row) => row.provider.id === service);
  const openPanel = (next, event) => {
    triggerRef.current = event?.currentTarget || null;
    setService(null);
    setEvidenceLimit(6);
    setPanel(next);
  };
  // What the stack calls when the inspector's entry is popped: state and focus
  // only. Everything a reader can touch calls dismiss() instead, so the entry
  // leaves with the panel.
  const closePanel = () => {
    setPanel(null);
    setService(null);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const clearService = () => {
    setService(null);
    setEvidenceLimit(6);
  };
  // Two levels, so two entries: the map, then the inspector, then the one
  // provider inside it. A back press unwinds exactly one of them, which is what
  // the inspector's own ArrowLeft already promised and nothing delivered.
  // Registered only while this instance is the Map destination -- the Overview
  // mounts the same component as a preview, and a preview never has an
  // inspector.
  useDismissible(expanded && !!panel, closePanel, "map-panel");
  useDismissible(expanded && !!service, clearService, "map-service");
  const chooseHub = (index, event) => {
    if (motionEnabled() && event?.currentTarget)
      gsap.fromTo(
        event.currentTarget,
        { scale: 1, transformOrigin: "50% 50%" },
        {
          scale: 1.14,
          duration: 0.13,
          yoyo: true,
          repeat: 1,
          ease: "power2.out",
        },
      );
    setSelected(index);
    setSeverity("all");
    openPanel("region", event);
  };
  const preview = !expanded && typeof onOpen === "function";
  // The Overview and the Map destination share one instance of this component,
  // so panel state survives the navigation between them. A preview never shows
  // an inspector: leaving the destination closes it, which also restores the
  // dock and the chips that a `has-inspector` card hides.
  useEffect(() => {
    if (!preview) return;
    setPanel(null);
    setSelected(null);
    setService(null);
  }, [preview]);
  // The APK's map page opens one zoom step in. On a phone the globe is
  // width-limited — 360px of usable width against 870 map units — so at zoom 1
  // it is drawn about 160px tall inside a 411px surface, with 120px of empty
  // sky above it. One step is exactly what the + button gives.
  //
  // Not initial state: there is a single WorldMap whose `expanded` prop flips
  // between the Overview card and the Map page, so an initial value would never
  // fire for the page. Leaving the page returns it to 1 so the Overview's
  // preview card is never zoomed.
  //
  // Arriving on a marker is left exactly as it was: `focus` is derived from
  // zoom, so zooming in on arrival would pan the map onto the marker instead of
  // showing it where the Overview showed it.
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    if (wasExpanded.current === expanded) return;
    wasExpanded.current = expanded;
    if (!onAndroid()) return;
    const landingOnMarker =
      expanded &&
      initialView?.panel === "region" &&
      Number.isInteger(initialView?.hub);
    setZoom(expanded && !landingOnMarker ? MAP_PAGE_ZOOM : 1);
  }, [expanded, initialView]);
  const appliedView = useRef(null);
  useEffect(() => {
    if (!expanded || !initialView || appliedView.current === initialView) return;
    appliedView.current = initialView;
    setService(null);
    setEvidenceLimit(6);
    if (initialView.panel === "region" && Number.isInteger(initialView.hub)) {
      setSelected(initialView.hub);
      setSeverity("all");
      setPanel("region");
      return;
    }
    if (initialView.panel === "services") {
      setSeverity(initialView.severity || "all");
      setPanel("services");
      return;
    }
    if (initialView.panel === "about") setPanel("about");
  }, [expanded, initialView]);
  const wide = size.width > 700 || (size.width > 570 && size.height < 430);
  const side = panel && wide ? Math.min(350, size.width * 0.43) : 0;
  // Fixed, and mirrored by the narrow inspector rules in map.css: the card
  // grows to fit the panel, so there is nothing for a percentage to adapt to.
  // The APK gives the card 340 and sits it 8 off the edge; the site and the EXE
  // keep 260 and 12. Both numbers exist in map.css too and have to move together.
  const android = onAndroid();
  const cardHeight = panel && !wide ? (android ? 340 : 260) : 0;
  // Opening the panel on a narrow card does not park it on top of the map: the
  // drawing surface gives up the space instead, so the map moves up and shrinks
  // into what is left. Everything below measures that surface, not the card, or
  // the globe would be laid out for a height it no longer has.
  const panelBelow = cardHeight ? cardHeight + (android ? 8 : 12) : 0;
  const board = Math.max(200, size.height - panelBelow);
  // The 105/140 floor is for a header that still has its region picker and its
  // chips: it reserves room the measurement cannot see until they have laid
  // out. With the panel open those fold away and the header really is ~12px
  // tall, so the floor was holding back 77px of sky above a globe that had
  // been squeezed to 61px. Once the panel is up, the header's own measured
  // bottom is the honest reserve.
  const top = cardHeight
    ? Math.max(24, headerBottom + 16)
    : Math.max(board < 430 ? 105 : 140, headerBottom + 16);
  // What sits along the bottom edge of a narrow map: the service dock, and the
  // control row standing on it. Markers have to clear all of it, so the reserve
  // is that stack's real height — the dock, its 8px from the edge, the 12px
  // above it and the 46px row. DOCK_STACK mirrors the same sum in components.css.
  const narrowFooter = cardHeight ? 56 : dockHeight + DOCK_STACK;
  const footer = wide ? 85 : narrowFooter;
  const bottomReserve = wide ? 50 : narrowFooter;
  const spaceHeight = Math.max(80, board - top - footer);
  const spaceWidth = Math.max(160, size.width - side - 30);
  const base = Math.min(spaceWidth / 870, spaceHeight / 420) * 0.95;
  const [rx, ry, rs] = views[region];
  const magnification = base * rs * zoom;
  const focus = selected !== null ? Math.min(1, (zoom - 1) * 2) : 0;
  const point = selected !== null ? mapData.points[selected] : [rx, ry];
  const tx =
    spaceWidth / 2 + 15 - (rx + (point[0] - rx) * focus) * magnification;
  const ty =
    top + spaceHeight / 2 - (ry + (point[1] - ry) * focus) * magnification;
  const visibleHubs = atlas.locations.filter(
    (h) =>
      (region === "Global" || h.region === region) &&
      (!(panel && (board < 430 || (!wide && board < 600))) ||
        (panel === "region"
          ? h.index === selected
          : panel === "about"
            ? false
            : h.signals.some((signal) =>
                severity === "all"
                  ? issueStates.includes(signal.status)
                  : signal.status === severity,
              ))),
  );
  const pins = arrangeMapPins(
    visibleHubs
      .map((h) => ({
        ...h,
        x: mapData.points[h.index][0] * magnification + tx,
        y: mapData.points[h.index][1] * magnification + ty,
      }))
      .filter(
        (h) =>
          h.x >= 18 &&
          h.x <= size.width - side - 18 &&
          h.y >= top - 15 &&
          h.y <= board - bottomReserve + 15,
      ),
    {
      left: 25,
      right: size.width - side - 25,
      top: top + 25,
      bottom: Math.max(top + 50, board - bottomReserve),
    },
  );
  useLayoutEffect(() => {
    if (!motionEnabled()) return;
    const hubs = frame.current?.querySelectorAll(".atlas-hub:not(.filtered)");
    if (!hubs?.length) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        hubs,
        { autoAlpha: 0, scale: 0.45, transformOrigin: "50% 50%" },
        {
          autoAlpha: 1,
          scale: 1,
          duration: 0.34,
          stagger: 0.025,
          ease: "back.out(1.7)",
          clearProps: "opacity,transform,visibility",
        },
      );
    }, frame);
    return () => context.revert();
  }, [expanded, pins.length, region, severity, stackOnly]);
  useLayoutEffect(() => {
    if (!panel || !motionEnabled()) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        inspectorRef.current,
        { autoAlpha: 0, y: 12, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.3,
          ease: "power3.out",
          clearProps: "opacity,transform,visibility",
        },
      );
    }, frame);
    return () => context.revert();
  }, [panel, service]);
  const panelTitle =
    focused?.provider.name ||
    (panel === "about"
      ? "Reading this map"
      : panel === "region"
        ? hub?.name
        : severity === "all"
          ? "Service conditions"
          : issueLabels[severity]);
  // On the Overview the map is a preview, not a workspace. Anything touched
  // inside it opens the Map destination instead of an inspector that would sit
  // on top of the page you are already reading. Captured on the way down, so
  // markers, chips and the region picker all resolve to the same destination —
  // and because a keyboard Enter on any of them still dispatches a click, this
  // needs no extra keyboard path and no nested interactive wrapper.
  // Opening the Map destination should land on whatever was touched here, not
  // on a bare map the reader then has to find their way around again. Each
  // control says what it is, and the destination reopens that same view.
  const intentFor = (target) => {
    const node = target instanceof Element ? target : null;
    if (!node) return null;
    const hub = node.closest?.("[data-hub]");
    if (hub) return { panel: "region", hub: Number(hub.dataset.hub) };
    const chip = node.closest?.(".atlas-filter");
    if (chip) return { panel: "services", severity: chip.dataset.state };
    if (node.closest?.(".atlas-service-dock"))
      return { panel: "services", severity: "all" };
    if (node.closest?.(".atlas-coverage")) return { panel: "about" };
    return null;
  };
  const coverageLabel = feedError
    ? "Connection needs attention"
    : `${atlas.fresh}/${stackOnly ? providers.filter((p) => watchlist.includes(p.id)).length : providers.length} feeds current`;
  return (
    <section
      ref={frame}
      className={`atlas atlas-map ${expanded ? "expanded" : ""} ${panel ? "has-inspector" : ""} ${wide ? "wide" : "narrow"} ${preview ? "is-preview" : ""}`}
      style={{ "--dock-h": `${dockHeight}px` }}
      aria-label={
        preview
          ? "Infrastructure map preview. Opens the full map."
          : "Interactive infrastructure map"
      }
      onClickCapture={
        preview
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpen(intentFor(event.target));
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (event.key === "Escape" && panel) {
          event.stopPropagation();
          closePanel();
        }
      }}
    >
      <svg
        className="atlas-world"
        viewBox={`0 0 ${size.width} ${board}`}
        aria-label="Regional provider signals"
        role="group"
      >
        <g
          transform={`translate(${tx} ${ty}) scale(${magnification})`}
          aria-hidden="true"
        >
          <path className="atlas-graticule" d={mapData.graticule} />
          <path className="atlas-land" d={mapData.outline} />
          <path className="atlas-borders" d={mapData.borders} />
        </g>
        {pins.map((h) => {
          const matching =
            severity === "all" ||
            h.signals.some((signal) => signal.status === severity);
          const state = matching && severity !== "all" ? severity : h.status;
          return (
            <React.Fragment key={h.name}>
              <path
                className="atlas-pin-leader"
                d={`M${h.x} ${h.y}L${h.markerX} ${h.markerY}`}
                aria-hidden="true"
              />
              <g
                role="button"
                tabIndex={0}
                aria-label={`Explore ${h.name}: ${issueLabels[state]}`}
                aria-pressed={selected === h.index && panel === "region"}
                className={`atlas-hub ${state} ${h.global ? "global" : ""} ${matching ? "" : "filtered"}`}
                data-hub={h.index}
                onClick={(event) => chooseHub(h.index, event)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    chooseHub(h.index, event);
                  }
                }}
              >
                <title>
                  {h.name}: {issueLabels[state]} · {h.signals.length} matching
                  {h.global ? " service-wide reports" : " components"}
                </title>
                <circle
                  className="atlas-hit"
                  cx={h.markerX}
                  cy={h.markerY}
                  r={22}
                />
                <circle
                  className="atlas-ring"
                  cx={h.markerX}
                  cy={h.markerY}
                  r={selected === h.index && panel === "region" ? 19 : 14}
                />
                <g transform={`translate(${h.markerX - 12} ${h.markerY - 12})`}>
                  <circle
                    className="atlas-symbol-back"
                    cx={12}
                    cy={12}
                    r={12}
                  />
                  <StatusShape status={state} />
                </g>
              </g>
              {selected === h.index && panel === "region" && (
                <text
                  className="atlas-city-name"
                  x={h.markerX}
                  y={h.markerY + 34}
                  textAnchor="middle"
                  aria-hidden="true"
                >
                  {h.name}
                </text>
              )}
            </React.Fragment>
          );
        })}
      </svg>

      <div className="atlas-map-header" ref={headerRef}>
        {/* Condition filters and the watchlist toggle share one row so a phone
            keeps every control in a single scrollable strip instead of
            stacking four bands of chrome over the map. */}
        <div className="atlas-map-controls">
          <div
            className="atlas-map-filters"
            aria-label="Service condition filters"
          >
            {issueStates.map((state) => (
              <button
                key={state}
                className={`atlas-filter ${state}`}
                data-state={state}
                aria-pressed={panel === "services" && severity === state}
                onClick={(event) => {
                  setSeverity(state);
                  openPanel("services", event);
                }}
              >
                <StatusGlyph status={state} size={16} />
                <strong>{counts[state]}</strong>
                <span>
                  {state === "outage"
                    ? "Outage"
                    : state === "degraded"
                      ? "Degraded"
                      : "Maintenance"}
                </span>
              </button>
            ))}
          </div>
          <label className="atlas-watch-filter">
            <input
              type="checkbox"
              checked={stackOnly}
              onChange={(event) => {
                setStackOnly(event.target.checked);
                setService(null);
              }}
            />
            <Star size={16} /> My watchlist
          </label>
        </div>
      </div>

      <FilterMenu
        className="atlas-region"
        value={region}
        options={Object.keys(views)}
        onChange={(name) => {
          setRegion(name);
          setZoom(1);
          setPanel(null);
          setSelected(null);
        }}
        icon={<Funnel size={16} />}
        label="Map region"
        placement="above"
        align="start"
      />
      <button
        className={`atlas-coverage ${feedError ? "is-error" : ""}`}
        aria-label={coverageLabel}
        title={coverageLabel}
        onClick={(event) => openPanel("about", event)}
      >
        <CircleHelp size={16} />
      </button>
      <div className="atlas-map-tools" aria-label="Map controls">
        <button
          title="Reset map"
          aria-label="Reset map"
          onClick={() => {
            setRegion("Global");
            setZoom(1);
            setSelected(null);
            setSeverity("all");
            setPanel(null);
          }}
        >
          <LocateFixed size={20} />
        </button>
        <button
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
        >
          <Plus size={20} />
        </button>
        <button
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          <Minus size={20} />
        </button>
      </div>
      {!panel && (
        <button
          ref={dockRef}
          className="atlas-service-dock"
          onClick={(event) => {
            setSeverity("all");
            openPanel("services", event);
          }}
        >
          <Globe2 size={20} />
          <span>
            <strong>
              {atlas.issues.length} services with active conditions
            </strong>
            <small>Service-wide issues & maintenance</small>
          </span>
          <ChevronRight size={16} />
        </button>
      )}

      {panel && (
        <section
          ref={inspectorRef}
          className="atlas-inspector"
          aria-labelledby="atlas-inspector-title"
        >
          <header className="atlas-inspector-header">
            <div>
              {focused && (
                <button className="atlas-back" onClick={dismiss}>
                  <ArrowLeft size={16} />
                  {panel === "region" ? hub?.name : "All matching services"}
                </button>
              )}
              <h2 id="atlas-inspector-title">{panelTitle}</h2>
              <p>
                {focused
                  ? labelsFor(focused.status)
                  : panel === "region"
                    ? hub?.global
                      ? "Official service-wide reports with no regional scope"
                      : "Only components naming this location"
                    : panel === "about"
                      ? "Official feeds. Clear boundaries."
                      : "Provider signals, not inferred city outages"}
              </p>
            </div>
            <button
              ref={closeRef}
              className="atlas-close"
              aria-label="Close map insights"
              onClick={dismiss}
            >
              <X size={20} />
            </button>
          </header>
          <div ref={bodyRef} className="atlas-inspector-body">
            {panel === "about" ? (
              <>
                <p>
                  Markers describe components that explicitly name a location.
                  They do not mean an entire city is down.
                </p>
                <div className="atlas-map-legend">
                  {[...issueStates, "operational", "unknown"].map((state) => (
                    <span key={state}>
                      <StatusGlyph status={state} />
                      {issueLabels[state]}
                    </span>
                  ))}
                </div>
                <p>
                  Top counts are services reporting each condition. A service
                  can have both an outage and maintenance.
                </p>
                <p>
                  {atlas.unavailable} feeds unavailable. Missing or old readings
                  are never counted as healthy.
                </p>
                {feedError && <p role="alert">{feedError}</p>}
                <p>
                  With automatic refresh on, checks run every 30 seconds while
                  this app is visible. Background alerts follow your saved
                  watchlist and device settings.
                </p>
              </>
            ) : focused ? (
              <>
                <div className="atlas-provider-heading">
                  <ProviderLogo provider={focused.provider} />
                  <span>
                    Provider summary
                    <br />
                    <strong>{statusLabels[focused.provider.status]}</strong>
                  </span>
                  {onToggleWatch && (
                    <button
                      aria-pressed={watchlist.includes(focused.provider.id)}
                      onClick={() => onToggleWatch(focused.provider.id)}
                    >
                      <Star
                        size={16}
                        weight={
                          watchlist.includes(focused.provider.id)
                            ? "fill"
                            : "regular"
                        }
                        className={`watchlist-star ${watchlist.includes(focused.provider.id) ? "watched" : ""}`}
                      />
                      {watchlist.includes(focused.provider.id)
                        ? "Watching"
                        : "Watch"}
                    </button>
                  )}
                </div>
                {focused.evidence.slice(0, evidenceLimit).map((e, index) => {
                  const incident = e.incident
                    ? latestIncident(e.incident)
                    : null;
                  return (
                    <article
                      className="atlas-source-card"
                      key={`${e.kind}-${index}`}
                    >
                      <span>
                        <StatusGlyph status={e.status} size={16} />
                        {e.kind} · {labelsFor(e.status)}
                      </span>
                      <h3>{e.name || "Provider status update"}</h3>
                      {incident && (
                        <>
                          <p>{incident.body}</p>
                          <small>
                            {incident.status?.replaceAll("_", " ")}
                            {incident.updatedAt
                              ? ` · Updated ${new Date(incident.updatedAt).toLocaleString()}`
                              : ""}
                          </small>
                        </>
                      )}
                    </article>
                  );
                })}
                {focused.evidence.length > evidenceLimit && (
                  <button
                    className="atlas-inline-button"
                    onClick={() => setEvidenceLimit((value) => value + 6)}
                  >
                    Show more signals ({focused.evidence.length - evidenceLimit}
                    )<Plus size={16} />
                  </button>
                )}
                {["outage", "degraded"].includes(focused.status) && (
                  <div className="atlas-next-step">
                    <strong>What to check</strong>
                    <p>
                      {focused.evidence.some((e) => e.incident)
                        ? "Check whether you use the feature named in this incident. Follow the provider’s latest guidance before retrying or changing your setup."
                        : workflowHints[focused.provider.category] ||
                          "Compare your application errors with the provider’s latest update."}
                    </p>
                  </div>
                )}
                <div className="atlas-source-footer">
                  <span>
                    Feed checked{" "}
                    {new Date(focused.provider.checkedAt).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </span>
                  <a
                    href={focused.provider.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official source
                    <ArrowRight size={16} />
                  </a>
                </div>
              </>
            ) : (
              <>
                {rows.length ? (
                  rows.map((row) => (
                    <button
                      className="atlas-provider-row"
                      key={row.provider.id}
                      onClick={() => {
                        setService(row.provider.id);
                        setEvidenceLimit(6);
                      }}
                    >
                      <ProviderLogo provider={row.provider} />
                      <span>
                        <strong>{row.provider.name}</strong>
                        <small>
                          <StatusGlyph status={row.status} size={16} />
                          {labelsFor(row.status)}
                          {watchlist.includes(row.provider.id)
                            ? " · Watching"
                            : ""}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))
                ) : (
                  <div className="atlas-no-signals">
                    <Globe2 size={24} />
                    <h3>
                      {stackOnly && !watchlist.length
                        ? "No watched services yet"
                        : "No matching signals"}
                    </h3>
                    <p>
                      {panel === "region"
                        ? "The current feeds don’t name a component here. Check service-wide conditions for broader incidents."
                        : "No current evidence matches this filter. Unavailable feeds are excluded."}
                    </p>
                  </div>
                )}
                {panel === "region" || severity !== "all" ? (
                  <button
                    className="atlas-inline-button"
                    onClick={() => {
                      setSeverity("all");
                      setPanel("services");
                    }}
                  >
                    All service conditions
                    <ArrowRight size={16} />
                  </button>
                ) : null}
              </>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
function labelsFor(status) {
  return status === "unknown" ? "Status unavailable" : issueLabels[status];
}
