import React, { useState } from "react";
import { Bell, CheckCheck, RefreshCw, Search, ArrowUpRight } from "./icons";
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
}) {
  const [scope, setScope] = useState("All services"),
    [unreadOnly, setUnreadOnly] = useState(false),
    [query, setQuery] = useState("");
  const scoped = incidents.filter(
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
      <div className="inbox-hero">
        <span className="inbox-hero-icon">
          <Bell size={24} />
        </span>
        <div>
          <span className="inbox-eyebrow">YOUR SIGNAL, WITHOUT THE NOISE</span>
          <h3>
            {unreadCount
              ? `${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}`
              : loading
                ? "Checking for updates…"
                : !fresh.length
                  ? "Waiting for current feeds"
                  : "No unread updates"}
          </h3>
          <p>
            Official incident updates. Background alerts follow your watchlist.
          </p>
        </div>
      </div>
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
          className="button secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {loading ? "Checking feeds…" : "Check latest"}
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
          {fresh.length}/{providers.length} feeds current · {matches.length}{" "}
          matching updates
          <br />
          {fetchedAt
            ? `Latest check completed at ${new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Waiting for the first check"}
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
