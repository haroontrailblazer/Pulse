import React, { useState } from "react";
import { Bell, CheckCheck, RefreshCw, Search, ArrowUpRight, X } from "./icons";
import { incidentRevision } from "../shared/incidents";
import { isFresh } from "../shared/monitor";
import ProviderLogo from "./ProviderLogo";
import StatusGlyph from "./StatusGlyph";
import {
  incidentSeverity,
  incidentDay,
  issueLabels,
} from "../shared/presentation";
import "./insight-updates.css";
export default function IncidentInbox({
  incidents,
  items,
  watchlist,
  read,
  onRead,
  onProvider,
  onRefresh,
  loading,
  now,
  error,
  fetchedAt,
  dismissed = {},
  onDismiss,
  onRestore,
}) {
  const [scope, setScope] = useState("All services"),
    [unreadOnly, setUnreadOnly] = useState(false),
    [query, setQuery] = useState("");
  const kept = incidents.filter(
    (i) => dismissed[i.key] !== incidentRevision(i),
  );
  const dismissedCount = incidents.length - kept.length;
  const scoped = kept.filter(
    (i) => scope === "All services" || watchlist.includes(i.provider.id),
  );
  const matches = scoped.filter(
    (i) =>
      (!unreadOnly || read[i.key] !== incidentRevision(i)) &&
      `${i.name} ${i.provider.name} ${i.body}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const providers = items.filter(
    (p) => scope === "All services" || watchlist.includes(p.id),
  );
  const fresh = providers.filter((p) => isFresh(p, now));
  const unreadCount = scoped.filter(
    (i) => read[i.key] !== incidentRevision(i),
  ).length;
  return (
    <div className="inbox-content">
      <div className="inbox-toolbar">
        <div className="tabs">
          {["All services", "My watchlist"].map((name) => (
            <button
              key={name}
              className={scope === name ? "selected" : ""}
              aria-pressed={scope === name}
              onClick={() => setScope(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          className={`icon-button refresh-button ${loading ? "loading" : ""}`}
          onClick={onRefresh}
          disabled={loading}
          aria-label={loading ? "Checking feeds…" : "Check for the latest"}
          title={loading ? "Checking feeds…" : "Check for the latest"}
        >
          <RefreshCw size={20} />
        </button>
      </div>
      <div className="inbox-search">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search incident inbox"
            placeholder="Search incidents or services…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          Unread only
        </label>
      </div>
      <div className="inbox-coverage">
        <span>
          {fetchedAt
            ? `Latest check completed at ${new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Waiting for the first check"}
          {dismissedCount > 0 && (
            <>
              {" · "}
              <button className="inbox-restore" onClick={onRestore}>
                Restore {dismissedCount} dismissed
              </button>
            </>
          )}
        </span>
        <button
          className="text-button"
          disabled={!matches.some((i) => read[i.key] !== incidentRevision(i))}
          onClick={() => onRead(matches)}
        >
          <CheckCheck size={16} />
          Mark shown as read
        </button>
      </div>
      {error && (
        <p className="inbox-warning" role="alert">
          {error}
        </p>
      )}
      {providers.length > fresh.length && (
        <p className="inbox-warning">
          {providers.length - fresh.length} feeds unavailable. Their last known
          incidents remain in service details; they are excluded from this
          current inbox.
        </p>
      )}
      <div className="inbox-list">
        {matches.map((i, index) => {
          const unread = read[i.key] !== incidentRevision(i);
          const severity = incidentSeverity(i);
          const day = incidentDay(i.updatedAt, now);
          const startsDay =
            index === 0 ||
            incidentDay(matches[index - 1].updatedAt, now) !== day;
          return (
            <React.Fragment key={i.key}>
              {startsDay && (
                <h4 className="inbox-day">
                  {day}
                  <span>Latest updates first</span>
                </h4>
              )}
              <div className="inbox-row">
              <button
                className={`inbox-update ${severity} ${unread ? "is-unread" : ""}`}
                onClick={() => {
                  onRead([i]);
                  onProvider(i.provider);
                }}
              >
                <span className="inbox-meta">
                  <ProviderLogo provider={i.provider} />
                  <strong>{i.provider.name}</strong>
                  {watchlist.includes(i.provider.id) && (
                    <span className="inbox-watching">Watching</span>
                  )}
                  {unread && (
                    <b>
                      <i />
                      Unread
                    </b>
                  )}
                </span>
                <span className={`inbox-severity ${severity}`}>
                  <StatusGlyph status={severity} size={16} />
                  {issueLabels[severity]}
                </span>
                <h3>{i.name}</h3>
                <p>{i.body}</p>
                <span className="inbox-update-footer">
                  <span className="inbox-phase">
                    {(i.status || "active").replaceAll("_", " ")}
                  </span>
                  <span className="inbox-source-time">
                    {i.updatedAt
                      ? `Source update · ${new Date(i.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Update time unavailable"}
                  </span>
                  <ArrowUpRight size={16} />
                </span>
              </button>
              {/* Only once it has been read: an unread update is the one thing
                  the inbox exists to show, so it cannot be swiped away before
                  it has been seen. Opening it marks it read and the control
                  appears. A sibling, not a child — a button inside a button is
                  invalid markup and the inner one never receives the click. */}
              {!unread && (
                <button
                  className="inbox-dismiss"
                  aria-label={`Dismiss the ${i.provider.name} update`}
                  title="Dismiss"
                  onClick={() => onDismiss?.(i)}
                >
                  <X size={16} />
                </button>
              )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {!matches.length && (
        <div className="empty-state">
          <Bell size={24} />
          <h3>
            {loading
              ? "Checking for the latest updates…"
              : !providers.length
                ? "Your watchlist is empty"
                : !fresh.length
                  ? "Current incidents are unavailable"
                  : unreadOnly
                    ? "You’re caught up"
                    : "No matching active incidents"}
          </h3>
          <p>
            {!fresh.length
              ? "Check again or visit the official source. This is not an all-clear."
              : "Try another filter or search. Resolved incidents are not included in active provider feeds."}
          </p>
        </div>
      )}
    </div>
  );
}
