import React, { useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Plus, RefreshCw, Search } from "./icons";
import ProviderLogo from "./ProviderLogo";
import StatusGlyph from "./StatusGlyph";
import { overviewSnapshot } from "../shared/overview";
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
        {!data.watched.length && (
          <p className="mobile-quiet">
            Add the services you use to see their status here.
          </p>
        )}
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
    </div>
  );
}
