import React, { useEffect, useMemo, useRef, useState } from "react";
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
import "./map.css";

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
}) {
  const frame = useRef(null),
    closeRef = useRef(null),
    triggerRef = useRef(null),
    bodyRef = useRef(null);
  const [size, setSize] = useState({ width: 870, height: 600 });
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
  const closePanel = () => {
    setPanel(null);
    setService(null);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const chooseHub = (index, event) => {
    setSelected(index);
    setSeverity("all");
    openPanel("region", event);
  };
  const wide = size.width > 700 || (size.width > 570 && size.height < 430);
  const side = panel && wide ? Math.min(350, size.width * 0.43) : 0;
  const cardHeight = panel && !wide ? Math.min(350, size.height * 0.44) : 0;
  const top = size.height < 430 ? 105 : 140;
  const spaceHeight = Math.max(80, size.height - top - (cardHeight || 85));
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
      (!(panel && (size.height < 430 || (!wide && size.height < 600))) ||
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
          h.y <= size.height - cardHeight - 35,
      ),
    {
      left: 25,
      right: size.width - side - 25,
      top: top + 25,
      bottom: Math.max(top + 50, size.height - cardHeight - 50),
    },
  );
  const Heading = expanded ? "h1" : "h2";
  const panelTitle =
    focused?.provider.name ||
    (panel === "about"
      ? "Reading this map"
      : panel === "region"
        ? hub?.name
        : severity === "all"
          ? "Service conditions"
          : issueLabels[severity]);
  return (
    <section
      ref={frame}
      className={`atlas atlas-map ${expanded ? "expanded" : ""} ${panel ? "has-inspector" : ""} ${wide ? "wide" : "narrow"}`}
      aria-label="Interactive infrastructure map"
      onKeyDown={(event) => {
        if (event.key === "Escape" && panel) {
          event.stopPropagation();
          closePanel();
        }
      }}
    >
      <svg
        className="atlas-world"
        viewBox={`0 0 ${size.width} ${size.height}`}
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
                className={`atlas-hub ${state} ${matching ? "" : "filtered"}`}
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
                  components
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

      <div className="atlas-map-header">
        <div className="atlas-map-title">
          <div className="map-title-with-menu">
            <div>
              <Heading>Infrastructure map</Heading>
              <button
                className="atlas-coverage"
                onClick={(event) => openPanel("about", event)}
              >
                {feedError
                  ? "Connection needs attention"
                  : `${atlas.fresh}/${stackOnly ? providers.filter((p) => watchlist.includes(p.id)).length : providers.length} feeds current`}
                <CircleHelp size={13} />
              </button>
            </div>
          </div>
          <select
            aria-label="Map region"
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              setZoom(1);
              setPanel(null);
              setSelected(null);
            }}
          >
            {Object.keys(views).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div
          className="atlas-map-filters"
          aria-label="Service condition filters"
        >
          {issueStates.map((state) => (
            <button
              key={state}
              className={`atlas-filter ${state}`}
              aria-pressed={panel === "services" && severity === state}
              onClick={(event) => {
                setSeverity(state);
                openPanel("services", event);
              }}
            >
              <StatusGlyph status={state} size={17} />
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
          <Star size={13} /> My watchlist
        </label>
      </div>

      {!panel && (
        <div className="atlas-map-prompt">
          Tap a marker to see what’s happening
        </div>
      )}
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
          <LocateFixed size={18} />
        </button>
        <button
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          <Minus size={18} />
        </button>
      </div>
      {!panel && (
        <button
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
          <ChevronRight size={17} />
        </button>
      )}

      {panel && (
        <section
          className="atlas-inspector"
          aria-labelledby="atlas-inspector-title"
        >
          <header className="atlas-inspector-header">
            <div>
              {focused && (
                <button
                  className="atlas-back"
                  onClick={() => {
                    setService(null);
                    setEvidenceLimit(6);
                  }}
                >
                  <ArrowLeft size={13} />
                  {panel === "region" ? hub?.name : "All matching services"}
                </button>
              )}
              <h2 id="atlas-inspector-title">{panelTitle}</h2>
              <p>
                {focused
                  ? labelsFor(focused.status)
                  : panel === "region"
                    ? "Only components naming this location"
                    : panel === "about"
                      ? "Official feeds. Clear boundaries."
                      : "Provider signals, not inferred city outages"}
              </p>
            </div>
            <button
              ref={closeRef}
              className="atlas-close"
              aria-label="Close map insights"
              onClick={closePanel}
            >
              <X size={19} />
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
                        size={15}
                        weight={watchlist.includes(focused.provider.id) ? "fill" : "regular"}
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
                        <StatusGlyph status={e.status} size={14} />
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
                    )<Plus size={14} />
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
                    <ArrowRight size={13} />
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
                          <StatusGlyph status={row.status} size={13} />
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
                    <Globe2 size={28} />
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
                    <ArrowRight size={14} />
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
