import React, { useMemo, useState } from "react";
import { explainDisruptions } from "../shared/insights";
import { statusLabels } from "../shared/providers";
import { ArrowUpRight, Copy, Star, ShieldCheck } from "./icons";
import "./insight-updates.css";
export default function InsightDetails({
  items,
  watchlist,
  onWatch,
  onProvider,
  now,
}) {
  const [onlyWatched, setOnlyWatched] = useState(false),
    [message, setMessage] = useState("");
  const data = useMemo(
    () => explainDisruptions(items, watchlist, now, onlyWatched),
    [items, watchlist, now, onlyWatched],
  );
  const issues = data.issues;
  async function copy() {
    const text = `Pulse · Major issues and degradation\nGenerated ${new Date(now).toLocaleString()}\n${data.fresh}/${data.relevant.length} feeds current; ${data.unavailable} unavailable.\n${onlyWatched ? "Watchlist issues" : "All provider issues"}: ${issues.length}\n\n${issues
      .map(
        (
          i,
        ) => `${i.provider.name}: ${i.status === "outage" ? "Major issue" : statusLabels[i.status]}\nProvider reports: ${i.headline}\nCould affect: ${i.meaning}\nNext check: ${i.action}\nFeed checked: ${i.provider.checkedAt}
Source: ${i.provider.url}`,
      )
      .join(
        "\n\n",
      )}\n\nThese are possible effects based on service categories, not confirmed outages in your application.`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Impact summary copied.");
    } catch {
      setMessage(
        "Clipboard unavailable. You can open each provider’s details to review the evidence.",
      );
    }
  }
  return (
    <section
      className="panel clear-insights"
      aria-label="Understand service impact"
    >
      <div className="impact-controls">
        {/* A pressed button rather than a checkbox-in-a-label: it sits on the
            same row as Copy summary and is the same control, so the two read
            as a pair instead of a form field beside a button. */}
        <button
          type="button"
          className="button secondary impact-watch-toggle"
          aria-pressed={onlyWatched}
          onClick={() => setOnlyWatched((value) => !value)}
        >
          <Star size={16} weight={onlyWatched ? "fill" : "regular"} />
          Only my watchlist
        </button>
        <button className="button secondary" onClick={copy}>
          <Copy size={16} />
          Copy summary
        </button>
      </div>
      <div className="impact-cards">
        {issues.map((i) => (
          <article
            className={`impact-explanation ${i.status}`}
            key={i.provider.id}
          >
            <div className="impact-card-heading">
              <h3>{i.provider.name}</h3>
              <span className={`status-pill ${i.status}`}>
                <i />
                {i.status === "outage" ? "Major issue" : statusLabels[i.status]}
              </span>
            </div>
            <p className="impact-source-time">
              Provider overall: {statusLabels[i.provider.status]} · Checked{" "}
              {new Date(i.provider.checkedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <dl>
              <div>
                <dt>What’s happening</dt>
                <dd>
                  {i.headline}
                  {i.sourceMessage && (
                    <span className="source-excerpt">
                      {i.sourceMessage.length > 360
                        ? `${i.sourceMessage.slice(0, 360)}…`
                        : i.sourceMessage}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>What you might notice</dt>
                <dd>If you use the affected feature: {i.meaning}</dd>
              </div>
              <div>
                <dt>What to check next</dt>
                <dd>
                  {i.action} Match the affected component to your own setup
                  before changing anything.
                </dd>
              </div>
            </dl>
            <details>
              <summary>See provider evidence ({i.evidence.length})</summary>
              <ul>
                {i.evidence.slice(0, 8).map((e, n) => (
                  <li key={n}>
                    <strong>{e.kind}:</strong> {e.name} ·{" "}
                    {statusLabels[e.status]}
                  </li>
                ))}
              </ul>
              {i.evidence.length > 8 && (
                <p>Open service details for the complete component list.</p>
              )}
            </details>
            <div className="impact-card-actions">
              <button
                className="text-button"
                onClick={() => onProvider(i.provider)}
              >
                Open service details <ArrowUpRight size={16} />
              </button>
              <button
                className="text-button"
                aria-pressed={i.watched}
                onClick={() => onWatch(i.provider.id)}
              >
                <Star
                  size={16}
                  weight={i.watched ? "fill" : "regular"}
                  className={`watchlist-star ${i.watched ? "watched" : ""}`}
                />
                {i.watched ? "Watching · remove" : "Add to watchlist"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!issues.length && (
        <div className="impact-empty">
          <ShieldCheck size={20} />
          <p>
            {onlyWatched
              ? "No major issues or degradation reported for your watched services."
              : "No major issues or degradation reported in current provider feeds."}{" "}
            {data.unavailable > 0
              ? `${data.unavailable} unavailable feeds are not counted as healthy.`
              : "This is provider-reported status; your own app may behave differently."}
          </p>
        </div>
      )}
      {message && (
        <p className="impact-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
