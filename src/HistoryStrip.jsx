import { BUCKETS, bucketStates, bucketTime } from "../shared/history.js";

// Thirty days of what this device saw, one mark per five minutes.
//
// The honesty of this component is the whole point of it. Pulse does not measure
// availability - it reads what providers publish - and it only reads while it is
// open. So a gap is drawn as a gap and labelled as one, and the caption says
// where the data came from rather than letting a long green bar imply uptime
// this app never measured.

const LABELS = {
  unrecorded: "Not recorded",
  unknown: "Status unavailable",
  operational: "Operational",
  under_maintenance: "Maintenance",
  degraded_performance: "Degraded",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
};

// A month at five-minute resolution is 8,640 marks and no screen has room for
// them, so the strip is drawn at day resolution: 30 columns, each the worst
// state seen that day. Worst rather than average for the same reason the bucket
// keeps the worst - an averaged day hides the hour that mattered.
const RANK = {
  unrecorded: -1,
  unknown: 0,
  operational: 1,
  under_maintenance: 2,
  degraded_performance: 3,
  partial_outage: 3,
  major_outage: 4,
};
const DAYS = 30;
const PER_DAY = BUCKETS / DAYS;

export default function HistoryStrip({ entry, degraded = false }) {
  if (!entry) return null;
  const states = bucketStates(entry);
  const days = Array.from({ length: DAYS }, (_, day) => {
    const slice = states.slice(day * PER_DAY, (day + 1) * PER_DAY);
    let worst = "unrecorded";
    let seen = 0;
    for (const state of slice) {
      if (state !== "unrecorded") seen++;
      if (RANK[state] > RANK[worst]) worst = state;
    }
    return {
      state: worst,
      seen,
      at: bucketTime(entry, day * PER_DAY),
    };
  });
  const recorded = days.filter((d) => d.seen).length;

  return (
    <div className="history-strip">
      <div className="history-strip-row" role="img" aria-label={`Thirty days of recorded status for ${entry.name}`}>
        {days.map((day, i) => (
          <i
            key={i}
            className={`history-mark is-${day.state}`}
            title={`${new Date(day.at).toLocaleDateString()} — ${LABELS[day.state]}${
              day.seen ? "" : " (Pulse was not open)"
            }`}
          />
        ))}
      </div>
      {degraded && (
        <p className="history-caption is-degraded" role="status">
          Pulse could not save to this device&rsquo;s storage, so the strip above
          has stopped recording. It is incomplete rather than wrong.
        </p>
      )}
      <p className="history-caption">
        {recorded === 0
          ? "Nothing recorded yet. Pulse builds this while it is open."
          : `Recorded on ${recorded} of the last 30 days, while Pulse was open on this device. Grey means Pulse was not watching, not that the service was healthy.`}
      </p>
    </div>
  );
}
