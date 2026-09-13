import React, { useMemo, useState } from "react";
import { explainIndustry } from "../shared/insights";
import { statusLabels } from "../shared/providers";
import { ArrowUpRight, Copy, Star, ShieldCheck } from "./icons";
import "./insight-updates.css";
export default function InsightDetails({
  items,
  industry,
  onIndustry,
  watchlist,
  onWatch,
  onProvider,
  now,
}) {
  const [onlyWatched, setOnlyWatched] = useState(false),
    [message, setMessage] = useState("");
  const data = useMemo(
    () => explainIndustry(items, industry, watchlist, now),
    [items, industry, watchlist, now],
  );
  const issues = data.issues.filter((i) => !onlyWatched || i.watched);
  async function copy() {
    const text = `Pulse · ${industry}\nGenerated ${new Date(now).toLocaleString()}\n${data.fresh}/${data.relevant.length} feeds current; ${data.unavailable} unavailable.\n${onlyWatched ? "Watchlist issues" : "Relevant provider issues"}: ${issues.length}\n\n${issues
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
      <div className="clear-insights-heading">
        <div>
          <h2>What does this mean for you?</h2>
          <p>
            Start with the services you use, then check the specific feature or
            region.
          </p>
        </div>
        <select
          value={industry}
          onChange={(e) => {
            onIndustry(e.target.value);
            setMessage("");
          }}
          aria-label="Select industry"
        >
          {[...new Set(items.flatMap((p) => p.industries))].map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
      </div>
      <div className="impact-summary">
        <div>
          <strong>{data.issues.length}</strong>
          <span>Relevant services with issues</span>
        </div>
        <div>
          <strong>{data.watchedIssues}</strong>
          <span>On your watchlist</span>
        </div>
        <div>
          <strong>{data.unavailable}</strong>
          <span>Feeds unavailable</span>
        </div>
      </div>
      <p className="impact-lead">
        {data.issues.length
          ? `${data.issues.length} relevant ${data.issues.length === 1 ? "service reports" : "services report"} issues. ${data.watchedIssues ? `${data.watchedIssues} ${data.watchedIssues === 1 ? "is" : "are"} on your watchlist. Start there.` : "None are on your watchlist. Check whether your tools use them."}`
          : data.fresh
            ? `No issues are reported in the ${data.fresh} current feeds for this view.`
            : "Current feeds are unavailable. Check the official sources before making a decision."}
      </p>
      <div className="impact-controls">
        <label>
          <input
            type="checkbox"
            checked={onlyWatched}
            onChange={(e) => setOnlyWatched(e.target.checked)}
          />
          Only my watchlist
        </label>
        <button className="button secondary" onClick={copy}>
          <Copy size={14} />
          Copy impact summary
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
                Open service details <ArrowUpRight size={14} />
              </button>
              <button
                className="text-button"
                aria-pressed={i.watched}
                onClick={() => onWatch(i.provider.id)}
              >
                <Star size={14} />
                {i.watched ? "Watching · remove" : "Add to watchlist"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!issues.length && (
        <div className="impact-empty">
          <ShieldCheck size={22} />
          <p>
            {onlyWatched
              ? "No current issues match your watched services in this category."
              : "No current provider issues to explain here."}{" "}
            {data.unavailable > 0
              ? `${data.unavailable} unavailable feeds are not counted as healthy.`
              : "This is provider-reported status; your own app may behave differently."}
          </p>
        </div>
      )}
      <details className="relevant-services">
        <summary>Browse all {data.relevant.length} relevant services</summary>
        <div>
          {data.relevant.map((p) => (
            <button key={p.id} onClick={() => onProvider(p)}>
              <span>{p.name}</span>
              <span className={`status-pill ${p.status}`}>
                <i />
                {statusLabels[p.status]}
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      </details>
      <p className="methodology-note">
        Possible effects are explained from each provider’s service category.
        They do not prove an outage in your product or a dependency between
        companies. {data.fresh}/{data.relevant.length} feeds are current.
      </p>
      {message && (
        <p className="impact-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
