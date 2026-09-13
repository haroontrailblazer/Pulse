export const issueStates = ["outage", "degraded", "maintenance"];
export const issueLabels = {
  outage: "Major outage",
  degraded: "Degradation",
  maintenance: "Maintenance",
  operational: "Operational",
  unknown: "No regional signal",
  update: "Incident update",
};

// A service can report maintenance and an outage at the same time.
export function filterIssueRows(rows, severity) {
  if (severity === "all") return rows;
  return rows.flatMap((row) => {
    const evidence = row.evidence.filter((e) => e.status === severity);
    return evidence.length ? [{ ...row, status: severity, evidence }] : [];
  });
}
export function incidentSeverity(incident) {
  return (
    {
      critical: "outage",
      major: "outage",
      minor: "degraded",
      maintenance: "maintenance",
    }[incident.impact] || "update"
  );
}
export function incidentDay(timestamp, now) {
  const date = new Date(timestamp);
  if (!timestamp || !Number.isFinite(date.getTime()))
    return "Update time unavailable";
  const today = new Date(now),
    yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
