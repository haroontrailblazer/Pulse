import React, { useMemo, useState } from "react";
import { explainDisruptions } from "../shared/insights";
import { statusLabels } from "../shared/providers";
import { ArrowUpRight, ChevronDown, Copy, Star, ShieldCheck } from "./icons";
import "./insight-updates.css";
// The controls row differs by surface, so it is chosen in JavaScript rather
// than shipped twice and half hidden: the site and the EXE render exactly the
// markup they rendered before, and the APK never carries the arrangement it
// does not use. Read at render time, off the same attribute the stylesheet
// keys on, the way WorldMap does it — a module-scope read would run before
// main.jsx sets it.
const onAndroid = () =>
  typeof document !== "undefined" &&
  document.documentElement.dataset.platform === "android";
export default function InsightDetails({
  items,
  watchlist,
  onWatch,
  onProvider,
  now,
  listRef = null,
  hint = false,
}) {
  const [onlyWatched, setOnlyWatched] = useState(false),
    [message, setMessage] = useState("");
  const data = useMemo(
    () => explainDisruptions(items, watchlist, now, onlyWatched),
    [items, watchlist, now, onlyWatched],
  );
  const issues = data.issues;
  const android = onAndroid();
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
        {android ? (
          /* The scope is a filter, not an action, and this app settled how a
             two-way scope filter looks twice already — the incident inbox and
             the service directory both render it as a segmented control, and
             this row was the one place that made it a button. A button is
             stretched to half the row by `.impact-controls > .button`, and
             half of 328px is less than "Only my watchlist" needs, which is
             why it clipped. Pills sized by their own labels cannot. It also
             names the unfiltered state, which a lone toggle never did. */
          <div className="tabs" role="group" aria-label="Show issues for">
            {[false, true].map((scope) => (
              <button
                key={String(scope)}
                type="button"
                className={onlyWatched === scope ? "selected" : ""}
                aria-pressed={onlyWatched === scope}
                onClick={() => setOnlyWatched(scope)}
              >
                {scope ? "My watchlist" : "All services"}
              </button>
            ))}
          </div>
        ) : (
          /* A pressed button rather than a checkbox-in-a-label: it sits on the
             same row as Copy summary and is the same control, so the two read
             as a pair instead of a form field beside a button. */
          <button
            type="button"
            className="button secondary impact-watch-toggle"
            aria-pressed={onlyWatched}
            onClick={() => setOnlyWatched((value) => !value)}
          >
            <Star size={16} weight={onlyWatched ? "fill" : "regular"} />
            Only my watchlist
          </button>
        )}
        {/* On the APK the frame comes off, the same move the page itself just
            made: a filled, bordered pill for a once-in-a-while export was the
            other half of what did not fit, and this page already speaks in
            `.text-button` — it uses one twice inside every card below. The
            label stays whole; "Copy" alone drops the object of the verb. */}
        <button
          type="button"
          className={android ? "text-button impact-copy" : "button secondary"}
          onClick={copy}
        >
          <Copy size={16} />
          Copy summary
        </button>
      </div>
      {/* The list is the only part of this page that scrolls; the controls
          above it and the page footer below hold their place. An empty state
          takes the list's place rather than sitting under an empty grid, which
          would otherwise claim the whole scrolling band for nothing. */}
      {issues.length ? (
        <div className="impact-cards" ref={listRef}>
          {issues.map((i) => (
            <article
              className={`impact-explanation ${i.status}`}
              key={i.provider.id}
            >
              <div className="impact-card-heading">
                <h3>{i.provider.name}</h3>
                <span className={`status-pill ${i.status}`}>
                  <i />
                  {i.status === "outage"
                    ? "Major issue"
                    : statusLabels[i.status]}
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
      ) : (
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
      {/* The chevron the other list destinations use, for the same reason:
          a fixed-height scroller gives no other sign that more is below. */}
      <div className="scroll-hint-anchor" aria-hidden="true">
        {hint && (
          <span className="scroll-hint">
            <ChevronDown size={20} />
          </span>
        )}
      </div>
      {message && (
        <p className="impact-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
