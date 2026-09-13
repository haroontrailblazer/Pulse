import React from "react";
import "./status-glyph.css";

export function StatusShape({ status }) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {status === "outage" ? (
        <>
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="5"
            fill="currentColor"
            fillOpacity=".12"
          />
          <path d="m9 9 6 6m0-6-6 6" />
        </>
      ) : status === "degraded" ? (
        <>
          <path
            d="m12 2 10 10-10 10L2 12Z"
            fill="currentColor"
            fillOpacity=".12"
          />
          <path d="M8 12h8" />
        </>
      ) : status === "maintenance" ? (
        <>
          <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
          <path d="M12 7v5l3 2" />
        </>
      ) : status === "operational" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="7" strokeDasharray="2 3" />
          <path d="M12 12h.01" />
        </>
      )}
    </g>
  );
}
export default function StatusGlyph({ status, size = 18 }) {
  return (
    <svg
      className={`status-glyph ${status}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <StatusShape status={status} />
    </svg>
  );
}
