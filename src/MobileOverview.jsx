import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  Globe2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Star,
} from "./icons";
import ProviderLogo from "./ProviderLogo";
import StatusGlyph from "./StatusGlyph";
import { overviewSnapshot } from "../shared/overview";
import { incidentDay, incidentSeverity } from "../shared/presentation";
import "./mobile-overview.css";

const labels = {
  operational: "Operational",
  outage: "Major outage",
  degraded: "Degraded",
  maintenance: "Maintenance",
  unknown: "Unavailable",
  update: "Incident update",
};
function ServiceRow({ row, onProvider }) {
  return (
    <button className="mobile-service" onClick={() => onProvider(row.provider)}>
      <ProviderLogo provider={row.provider} />
      <span className="mobile-service-name">{row.provider.name}</span>
      <span className={`mobile-service-state ${row.status}`}>
        <StatusGlyph status={row.status} size={14} />
        {labels[row.status]}
      </span>
      <ChevronRight size={14} />
    </button>
  );
}

export default function MobileOverview({
  items,
  watchlist,
  now,
  fetchedAt,
  loading,
  onRefresh,
  onProvider,
  onNavigate,
  onAdd,
  searchRef,
}) {
  const data = useMemo(
    () => overviewSnapshot(items, watchlist, now),
    [items, watchlist, now],
  );
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [limit, setLimit] = useState(6);
  const matches = data.services.filter(({ provider }) =>
    `${provider.name} ${provider.product} ${provider.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const watchedUpdates = data.incidents.filter((incident) =>
    watchlist.includes(incident.provider.id),
  );
  const updates = watchedUpdates.length ? watchedUpdates : data.incidents;
  const empty = !data.watched.length;
  const state = data.disrupted.length
    ? data.disrupted[0].status
    : data.unavailable.length
      ? "unknown"
      : data.maintenance.length
        ? "maintenance"
        : data.updates.length
          ? "update"
          : "operational";
  const headline = empty
    ? "Keep your services close"
    : loading && !data.fresh
      ? "Checking your services…"
      : data.disrupted.length
        ? `${data.disrupted.length} ${data.disrupted.length === 1 ? "service needs" : "services need"} attention`
        : data.unavailable.length
          ? data.unavailable.length === 1
            ? "One status is unavailable"
            : "Some statuses are unavailable"
          : data.maintenance.length
            ? "Maintenance on your stack"
            : data.updates.length
              ? "Incident update on your stack"
              : "Your stack is operational";
  const description = empty
    ? "Add the services you rely on to build your personal overview."
    : loading && !data.fresh
      ? "Getting the latest readings from official sources."
      : data.disrupted.length
        ? data.disrupted.map((row) => row.provider.name).join(", ")
        : data.unavailable.length
          ? `${data.unavailable.length} of ${data.watched.length} watched ${data.watched.length === 1 ? "service has" : "services have"} no current reading.`
          : data.maintenance.length
            ? `${data.maintenance.length} watched ${data.maintenance.length === 1 ? "service is" : "services are"} reporting maintenance.`
            : data.updates.length
              ? "An active incident has no reported severity. Open the service for details."
              : `No disruptions reported by your ${data.watched.length} watched ${data.watched.length === 1 ? "service" : "services"}.`;

  return (
    <div className="mobile-overview">
      <header className="mobile-overview-heading">
        <div>
          <h1>Internet status</h1>
          <p>
            {loading
              ? "Checking official sources…"
              : `${data.fresh} of ${items.length} feeds current`}
          </p>
        </div>
        <button
          className="mobile-refresh"
          disabled={loading}
          onClick={onRefresh}
          aria-label={
            loading ? "Checking status feeds" : "Refresh status feeds"
          }
        >
          <RefreshCw size={18} />
        </button>
      </header>

      <section
        className={`mobile-stack-summary ${empty ? "empty" : state}`}
        aria-labelledby="mobile-stack-title"
      >
        <span className="mobile-stack-eyebrow">
          <Star size={13} /> YOUR WATCHLIST
        </span>
        <h2 id="mobile-stack-title">{headline}</h2>
        <p>{description}</p>
        <button onClick={empty ? onAdd : () => onNavigate("Watchlist")}>
          {empty ? "Add your first service" : "Open watchlist"}
          <ArrowRight size={16} />
        </button>
      </section>

      {!!data.watched.length && (
        <section
          className="mobile-section"
          aria-labelledby="mobile-watched-title"
        >
          <div className="mobile-section-heading">
            <h2 id="mobile-watched-title">
              Your services <span>{data.watched.length}</span>
            </h2>
            <button onClick={onAdd}>
              <Plus size={15} />
              Add
            </button>
          </div>
          <div className="mobile-service-list">
            {data.watched.slice(0, 5).map((row) => (
              <ServiceRow
                key={row.provider.id}
                row={row}
                onProvider={onProvider}
              />
            ))}
          </div>
          {data.watched.length > 5 && (
            <button
              className="mobile-more"
              onClick={() => onNavigate("Watchlist")}
            >
              View all {data.watched.length} watched services
              <ArrowRight size={15} />
            </button>
          )}
        </section>
      )}

      <section
        className="mobile-section mobile-latest"
        aria-labelledby="mobile-latest-title"
      >
        <div className="mobile-section-heading">
          <h2 id="mobile-latest-title">
            {watchedUpdates.length ? "Watchlist updates" : "Latest updates"}
          </h2>
          <button onClick={() => onNavigate("Incidents")}>
            All updates
            <ArrowRight size={14} />
          </button>
        </div>
        {updates.length ? (
          updates.slice(0, 2).map((incident) => (
            <button
              className="mobile-incident"
              key={incident.key}
              onClick={() => onProvider(incident.provider)}
            >
              <span className="mobile-incident-meta">
                <ProviderLogo provider={incident.provider} />
                <strong>{incident.provider.name}</strong>
                <span>
                  {incident.updatedAt
                    ? `${incidentDay(incident.updatedAt, now)} · ${new Date(incident.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Time unavailable"}
                </span>
              </span>
              <span className="mobile-incident-title">
                <StatusGlyph status={incidentSeverity(incident)} size={17} />
                <strong>{incident.name}</strong>
                <ChevronRight size={15} />
              </span>
              <span className="mobile-incident-phase">
                {(incident.status || "active").replaceAll("_", " ")}
                {watchlist.includes(incident.provider.id)
                  ? " · On your watchlist"
                  : ""}
              </span>
            </button>
          ))
        ) : (
          <p className="mobile-quiet">
            {loading
              ? "Checking for the latest updates…"
              : data.fresh
                ? "No active incidents in current feeds."
                : "Incident updates are currently unavailable."}
          </p>
        )}
      </section>

      <section className="mobile-section" aria-labelledby="mobile-find-title">
        <div className="mobile-section-heading">
          <h2 id="mobile-find-title">Find a service</h2>
          <span>{items.length} tracked</span>
        </div>
        <div className="mobile-search">
          <Search size={18} />
          <input
            ref={searchRef}
            aria-label="Find a service"
            placeholder="Search OpenAI, npm, PyPI…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(6);
            }}
          />
          {query && <button onClick={() => setQuery("")}>Clear</button>}
        </div>
        {(query.trim() || browsing) && (
          <div className="mobile-search-results">
            <div className="mobile-service-list">
              {matches.slice(0, limit).map((row) => (
                <ServiceRow
                  key={row.provider.id}
                  row={row}
                  onProvider={onProvider}
                />
              ))}
            </div>
            {!matches.length && (
              <p className="mobile-quiet">
                No matching services. Try another name.
              </p>
            )}
            {matches.length > limit && (
              <button
                className="mobile-more"
                onClick={() => setLimit((value) => value + 6)}
              >
                Show more services ({matches.length - limit})<Plus size={15} />
              </button>
            )}
          </div>
        )}
        {!query.trim() && (
          <button
            className="mobile-more"
            aria-expanded={browsing}
            onClick={() => {
              setBrowsing((value) => !value);
              setLimit(6);
            }}
          >
            {browsing
              ? "Close directory"
              : `Browse all ${items.length} services`}
            <ArrowRight size={15} />
          </button>
        )}
      </section>

      <nav className="mobile-explore" aria-label="Explore status insights">
        <button onClick={() => onNavigate("Global map")}>
          <Globe2 size={22} />
          <span>
            <strong>Global map</strong>
            <small>
              {data.regionalIssues
                ? `${data.regionalIssues} hubs with reported issues`
                : "Explore regional status"}
            </small>
          </span>
          <ChevronRight size={16} />
        </button>
        <button onClick={() => onNavigate("Dependency insights")}>
          <Network size={22} />
          <span>
            <strong>Impact insights</strong>
            <small>What disruptions could mean for you</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </nav>
      <p className="mobile-feed-note">
        {data.fresh} of {items.length} feeds current
        {fetchedAt
          ? ` · Checked ${new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : ""}
        <br />
        {loading
          ? "Checking official sources…"
          : "Unavailable feeds do not confirm service health."}
      </p>
    </div>
  );
}
