import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  RefreshCw,
  Search,
  Copy,
  ExternalLink,
  Terminal,
  Radio,
  Clock3,
  ChevronDown,
  TriangleAlert,
  Check,
} from "./icons";
import { feedUrl, statusLabels } from "../shared/providers.js";
import { isFresh } from "../shared/monitor.js";
import FilterMenu from "./FilterMenu";
import SecurityLab from "./SecurityLab";
import "./live.css";
// The APK gets a different arrangement of the same tools, so the surface is
// read at render time rather than shipped twice and half hidden: the site and
// the EXE render exactly the markup they rendered before. Off the same
// attribute the stylesheet keys on, the way WorldMap and InsightDetails do it
// — a module-scope read would run before main.jsx sets it.
const onAndroid = () =>
  typeof document !== "undefined" &&
  document.documentElement.dataset.platform === "android";
const TOOLS = [
  "My stack",
  "Registries",
  "Security lab",
  "Components",
  "Changes",
  "Feed health",
];
export function since(value, now) {
  if (!value) return "Not checked";
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  if (!Number.isFinite(seconds)) return "Time unavailable";
  return seconds < 60
    ? `${seconds}s ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : `${Math.floor(seconds / 3600)}h ago`;
}
const readable = (status) => (status || "unknown").replaceAll("_", " ");
export default function LiveConsole({
  items,
  watchlist,
  data,
  now,
  connection,
  loading,
  onRefresh,
  onProvider,
  listRef = null,
  hint = false,
  onView = null,
}) {
  const [view, setView] = useState("My stack");
  const [query, setQuery] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [copied, setCopied] = useState("");
  const fresh = items.filter((p) => isFresh(p, now));
  const stale = items.filter((p) => p.stale);
  const watched = items.filter((p) => watchlist.includes(p.id));
  const cards =
    view === "Registries"
      ? items.filter((p) => p.category === "Package registries")
      : watched;
  const impacted = watched.filter(
    (p) =>
      isFresh(p, now) && (p.status !== "operational" || p.incidents.length),
  );
  const components = useMemo(
    () =>
      items.flatMap((p) => p.components.map((c) => ({ ...c, provider: p }))),
    [items],
  );
  const matches = components.filter(
    (c) =>
      (!onlyIssues || c.status !== "operational") &&
      `${c.name} ${c.provider.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const changes = (data.history || []).filter((e) => e.kind !== "baseline");
  const next = data.nextCheckAt
    ? Math.max(0, Math.ceil((Date.parse(data.nextCheckAt) - now) / 1000))
    : 120;
  const transport = {
    streaming: "Live connection",
    polling:
      import.meta.env.VITE_STATUS_TRANSPORT === "poll"
        ? "Automatic checks"
        : "Polling fallback",
    connecting: "Connecting",
    native: "On-device monitor",
    paused: "Auto-refresh paused",
    sleeping: "Checks paused while hidden",
  }[connection];
  const android = onAndroid();
  // The page's own scroll hint is keyed on the selected tool, and the hook
  // that drives it lives in App beside the other three list pages. Reporting
  // the selection up costs the website nothing: App uses it only as the key.
  useEffect(() => {
    onView?.(view);
  }, [view, onView]);
  // What the bar counts, per tool. Security lab counts nothing — it is three
  // utilities, not a list of rows.
  const toolCount = {
    "My stack": cards.length,
    Registries: cards.length,
    Components: matches.length,
    Changes: changes.length,
    "Feed health": items.length,
  }[view];
  // Every tool's size, on the option itself. Five of the six tools are behind
  // the picker at rest, so the menu is where they have to advertise
  // themselves; a bare list of names would be a worse trade than the strip it
  // replaces. FilterMenu keys its options on the label, so the decorated
  // strings are translated back by index rather than parsed.
  const counts = {
    "My stack": watched.length,
    Registries: items.filter((p) => p.category === "Package registries").length,
    Components: matches.length,
    Changes: changes.length,
    "Feed health": items.length,
  };
  const options = TOOLS.map((name) =>
    counts[name] == null ? name : `${name} · ${counts[name]}`,
  );
  // One line, and only when there is something to say: a sweep in progress,
  // a paused monitor, or feeds that are not all current. On a clean reading it
  // is not rendered at all rather than saying so.
  const barNote = loading
    ? `Checking ${data.completedChecks || 0}/${items.length}`
    : connection === "paused" || connection === "sleeping"
      ? transport
      : fresh.length < items.length
        ? `${fresh.length}/${items.length} feeds current${stale.length ? ` · ${stale.length} stale` : ""}`
        : null;
  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${label} copied`);
    } catch {
      setCopied(
        "Clipboard unavailable. Open the source link to inspect the feed.",
      );
    }
  }
  return (
    <section className="live-console" aria-label="Developer live monitor">
      {android ? (
        <>
          {/* The bar is the page title's second line, the way the Incidents,
              Watchlist and Dependency insights bars already are. It carries
              the three things the 378px of chrome above it carried that were
              load-bearing: which tool you are in, how big it is, and the
              refresh. The tool name is the switch itself — see the picker
              note in live.css for why it is a menu and not a strip. */}
          <div className="tools-bar">
            {/* The bar's title is a button, so the document outline would go
                h1 to nothing. This costs no geometry and restores it. */}
            <h2 className="visually-hidden">{view}</h2>
            <FilterMenu
              className="tools-picker"
              value={options[TOOLS.indexOf(view)]}
              options={options}
              onChange={(label) =>
                setView(TOOLS[options.indexOf(label)] || view)
              }
              icon={
                <>
                  <span className="tools-picker-name">{view}</span>
                  <ChevronDown size={16} />
                </>
              }
              label="Developer tool"
              align="start"
              /* Every option is a tool, so none of them is a filter that is
                 "on" — the accent treatment would be reporting a state that
                 does not exist. */
              activeWhen={() => false}
            />
            {toolCount != null && (
              <span className="count-label">{toolCount}</span>
            )}
            <button
              className="icon-button tools-refresh"
              onClick={onRefresh}
              disabled={loading}
              aria-label={
                loading
                  ? `Checking ${data.completedChecks || 0} of ${items.length} feeds`
                  : "Check now"
              }
              title="Check now"
            >
              <RefreshCw size={16} className={loading ? "live-spin" : ""} />
            </button>
          </div>
          {barNote && <p className="tools-note">{barNote}</p>}
        </>
      ) : (
        <>
          <div className="live-console-heading">
            <div>
              <span className={`connection-state ${connection}`}>
                <i />
                {transport}
              </span>
              <h2>Your infrastructure. Right now.</h2>
              <p>
                Official feeds checked every 30 seconds. Changes appear as each
                check finishes.
              </p>
            </div>
            <button
              className="button secondary"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "live-spin" : ""} />
              {loading
                ? `Checking ${data.completedChecks || 0}/${items.length}`
                : "Check now"}
            </button>
          </div>
          <div className="live-metrics">
            <span>
              <Radio size={16} />
              <strong>
                {fresh.length}/{items.length}
              </strong>{" "}
              fresh feeds
            </span>
            <span>
              <Activity size={16} />
              <strong>{impacted.length}</strong> watched providers with issues
            </span>
            <span className={stale.length ? "live-warning" : ""}>
              <Clock3 size={16} />
              <strong>{stale.length}</strong> stale readings
            </span>
            <span>
              {connection === "paused"
                ? "Automatic checks paused"
                : loading
                  ? "Receiving provider readings…"
                  : `Next sweep in ${next}s`}
            </span>
          </div>
          <div
            className="live-tabs"
            role="tablist"
            aria-label="Developer tools"
          >
            {[
              "My stack",
              "Registries",
              "Security lab",
              "Components",
              "Changes",
              "Feed health",
            ].map((name) => (
              <button
                role="tab"
                aria-selected={view === name}
                aria-controls="live-tool-panel"
                key={name}
                onClick={() => setView(name)}
              >
                {name}
                {name === "Changes" && changes.length > 0 && (
                  <small>{changes.length}</small>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <div
        id="live-tool-panel"
        className="live-tool-panel"
        ref={android ? listRef : null}
        role={android ? undefined : "tabpanel"}
        aria-label={view}
      >
        {(view === "My stack" || view === "Registries") && (
          <>
            {view === "Registries" && (
              <div className="registry-intro">
                <h3>From install to publish</h3>
                <p>
                  Live package and container infrastructure. Open a provider for
                  installation, publishing, registry, and audit component
                  status.
                </p>
              </div>
            )}
            <div className="stack-grid">
              {cards.map((p) => (
                <button
                  className={`stack-provider ${isFresh(p, now) ? p.status : "unknown"}`}
                  key={p.id}
                  onClick={() => onProvider(p)}
                >
                  <div>
                    <strong>{p.name}</strong>
                    <ExternalLink size={16} />
                  </div>
                  <span className={`status-pill ${p.status}`}>
                    <i />
                    {p.stale ? "Stale reading" : statusLabels[p.status]}
                  </span>
                  <p>
                    {p.stale
                      ? `Last known: ${statusLabels[p.lastKnownStatus] || "unavailable"}. Recheck before acting.`
                      : p.status === "unknown"
                        ? "Feed unavailable. Check the official source."
                        : p.incidents[0]?.name ||
                          p.description ||
                          "Provider reports normal operation."}
                  </p>
                  <small>
                    {p.checkedAt
                      ? `Verified ${since(p.checkedAt, now)}`
                      : "No verified reading yet"}
                    {p.incidents.length > 1
                      ? ` · ${p.incidents.length} incidents`
                      : ""}
                  </small>
                </button>
              ))}
            </div>
            {!cards.length && (
              <p className="live-empty">
                Add your infrastructure providers to the watchlist to see your
                stack here.
              </p>
            )}
            <p className="live-footnote">
              {view === "Registries"
                ? "Python's official feed includes PyPI and wider Python infrastructure. Docker includes registry and other Docker services. Inspect individual components before attributing a failed install."
                : "Your watchlist defines this stack. Provider issues indicate potential exposure, not a confirmed outage in your application."}
            </p>
          </>
        )}
        {view === "Security lab" && (
          <>
            <div className="security-platforms">
              {items
                .filter((p) => p.category === "Security platforms")
                .map((p) => (
                  <button key={p.id} onClick={() => onProvider(p)}>
                    <strong>{p.name}</strong>
                    <span className={`status-pill ${p.status}`}>
                      <i />
                      {p.stale ? "Stale reading" : statusLabels[p.status]}
                    </span>
                    <ExternalLink size={16} />
                  </button>
                ))}
            </div>
            <SecurityLab />
          </>
        )}
        {view === "Components" && (
          <>
            <div className="live-filter">
              <label className="search-input">
                <Search size={16} />
                <input
                  aria-label="Search live components"
                  placeholder="Search API, database, region, provider…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="issues-filter">
                <input
                  type="checkbox"
                  checked={onlyIssues}
                  onChange={(e) => setOnlyIssues(e.target.checked)}
                />
                Only non-operational
              </label>
            </div>
            <div className="live-component-list">
              {matches.slice(0, 100).map((c) => (
                <button
                  key={`${c.provider.id}-${c.id}`}
                  onClick={() => onProvider(c.provider)}
                >
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.provider.name} ·{" "}
                      {c.provider.stale
                        ? "Last known; stale"
                        : `Checked ${since(c.provider.checkedAt, now)}`}
                    </small>
                  </span>
                  <span className={`component-state ${c.status}`}>
                    {readable(c.status)}
                  </span>
                </button>
              ))}
            </div>
            {!matches.length && (
              <p className="live-empty">
                {components.length
                  ? "No reported components match these filters. This does not cover providers without component feeds."
                  : "Waiting for component readings from official sources."}
              </p>
            )}
            <p className="live-footnote">
              Showing {Math.min(matches.length, 100)} of {matches.length}{" "}
              matching components · {components.length} reported in total. Stale
              rows are last-known values.
            </p>
          </>
        )}
        {view === "Changes" && (
          <>
            <p className="live-footnote">
              Observed since{" "}
              {data.startedAt
                ? new Date(data.startedAt).toLocaleString()
                : "monitor startup"}
              . Up to 250 events kept while this monitor runs; this is not
              historical uptime.
            </p>
            <div className="change-list">
              {changes.slice(0, 60).map((e) => (
                <button
                  key={e.id}
                  onClick={() =>
                    onProvider(items.find((p) => p.id === e.providerId))
                  }
                >
                  <span className="change-dot" />
                  <span>
                    <strong>{e.providerName}</strong>
                    <p>{e.text}</p>
                  </span>
                  <time title={e.observedAt}>{since(e.observedAt, now)}</time>
                </button>
              ))}
            </div>
            {!changes.length && (
              <div className="live-empty">
                <Activity size={24} />
                <strong>No changes observed yet.</strong>
                <p>
                  {
                    (data.history || []).filter((e) => e.kind === "baseline")
                      .length
                  }{" "}
                  initial readings recorded. Status, component, incident, and
                  feed-availability changes will appear here automatically.
                </p>
              </div>
            )}
          </>
        )}
        {view === "Feed health" && (
          <>
            <div className="feed-tools">
              <p>Check when a source was reached and why a reading failed.</p>
              <button
                className="text-button"
                onClick={() =>
                  copy(
                    JSON.stringify(
                      {
                        observedAt: new Date(now).toISOString(),
                        providers: items,
                      },
                      null,
                      2,
                    ),
                    "JSON snapshot",
                  )
                }
              >
                <Copy size={16} />
                Copy JSON snapshot
              </button>
            </div>
            <div className="feed-list">
              {items.map((p) => (
                <div className="feed-row" key={p.id}>
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.format === "source-only"
                        ? "Official dashboard only; no ingestion adapter"
                        : p.error ||
                          (p.stale
                            ? "Reading is older than five minutes"
                            : `Last verified ${since(p.checkedAt, now)}`)}
                    </small>
                  </span>
                  <span className="feed-duration">
                    {p.responseMs != null ? `${p.responseMs} ms` : "—"}
                    <small>feed request</small>
                  </span>
                  {p.format !== "source-only" && (
                    <button
                      className="icon-button"
                      aria-label={`Copy ${p.name} feed curl command`}
                      title="Copy feed curl command"
                      onClick={() =>
                        copy(
                          `curl --fail --silent --show-error '${feedUrl(p)}'`,
                          `${p.name} curl command`,
                        )
                      }
                    >
                      <Terminal size={16} />
                    </button>
                  )}
                  <a
                    className="icon-button"
                    href={p.format === "source-only" ? p.url : feedUrl(p)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${p.name} source`}
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              ))}
            </div>
            <p className="live-footnote">
              Request duration measures fetching the status feed, not the
              provider API’s latency. A source’s “last changed” timestamp may be
              old even when a fresh check confirms its status.
            </p>
          </>
        )}
        {copied && (
          <p className="copy-feedback" role="status">
            <Check size={16} />
            {copied}
          </p>
        )}
      </div>
      <div className="scroll-hint-anchor" aria-hidden="true">
        {hint && (
          <span className="scroll-hint">
            <ChevronDown size={20} />
          </span>
        )}
      </div>
    </section>
  );
}
