import React, { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Bell, Layers3, ShieldCheck } from "./icons";
import { providers } from "../shared/providers";
import { requestBudget } from "../shared/alerts";
import "./background.css";

const android = Capacitor.getPlatform() === "android";
const native = android
  ? registerPlugin("PulseBackground")
  : window.pulseDesktop;
let bridgeState = { enabled: false, permission: "prompt", ready: false };
const subscribers = new Set();
function publish(state) {
  bridgeState = { ...state, ready: true };
  subscribers.forEach((fn) => fn(bridgeState));
}
let pending = Promise.resolve();
function configure(options) {
  pending = pending
    .catch(() => {})
    .then(() => native.configure(options))
    .then((state) => {
      publish(state);
      return state;
    });
  return pending;
}
export function useBackgroundSync(watchlist, data) {
  const ids = JSON.stringify(watchlist);
  useEffect(() => {
    if (!native) return;
    configure({ watchlist: JSON.parse(ids) }).catch((e) =>
      publish({ ...bridgeState, error: e.message }),
    );
  }, [ids]);
  useEffect(() => {
    if (!native) return;
    const check = () => {
      if (!document.hidden)
        native
          .status()
          .then(publish)
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  useEffect(() => {
    if (!android) return;
    const listener = native.addListener("openWatchlist", () =>
      window.dispatchEvent(new Event("pulse-open-watchlist")),
    );
    return () => {
      listener.then((handle) => handle.remove());
    };
  }, []);
}
export default function BackgroundSettings({
  watchlist,
  compact = false,
  onConfigure,
}) {
  const [state, setState] = useState(bridgeState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    subscribers.add(setState);
    native
      ?.status()
      .then(publish)
      .catch((e) => setMessage(e.message));
    return () => subscribers.delete(setState);
  }, []);
  const automated = watchlist.filter((id) =>
    providers.some((p) => p.id === id && p.format !== "source-only"),
  ).length;
  const budget = requestBudget(automated);
  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      if (!state.enabled && android) {
        const permission = await native.requestAlerts();
        publish(permission);
        if (permission.permission !== "granted") {
          setMessage(
            "Allow Pulse notifications in Android Settings, then enable alerts again.",
          );
          return;
        }
      }
      await configure({ enabled: !state.enabled, watchlist });
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function pin() {
    setBusy(true);
    try {
      const result = await native.pinWidget();
      setMessage(
        result.supported
          ? "Confirm placement in your launcher. You can also find Pulse in your home screen’s Widgets menu."
          : "Long-press your home screen, open Widgets, and choose Pulse.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (compact) {
    return (
      <button
        className="overview-alerts"
        onClick={onConfigure}
        aria-haspopup="dialog"
      >
        <Bell size={15} />
        {native && state.enabled && state.permission === "granted"
          ? "Alerts enabled"
          : "Enable alerts"}
      </button>
    );
  }
  return (
    <section
      className="background-panel"
      aria-label="Watchlist alerts and widget"
    >
      <div className="background-heading">
        <span className="background-symbol">
          <Bell size={24} />
        </span>
        <div>
          <h2>Your stack. Even when you step away.</h2>
          <p>
            Quiet monitoring. Alerts when a watched service reports a new issue.
          </p>
        </div>
      </div>
      <div className="background-actions">
        <div>
          <strong>
            {native
              ? state.enabled
                ? "Background alerts enabled"
                : "Turn on watchlist alerts"
              : "Background alerts in the installed apps"}
          </strong>
          <p>
            {android
              ? state.enabled
                ? `Pulse keeps a visible background-monitor notification and checks your ${automated} watched feeds about every ${state.intervalSeconds || 30} seconds. The interval grows with your watchlist to limit requests; Android can still stop monitoring after force-stop or under system restrictions.`
                : "Enable alerts to keep Pulse monitoring after you close the app. The widget also has a 15-minute Android-scheduled fallback when alerts are off."
              : native
                ? "Pulse stays in the Windows tray after closing the window. Your watched feeds are checked every 30 seconds; Quit stops monitoring."
                : "Install the APK or Windows app to monitor your watchlist after closing the window. This browser pauses checks when hidden."}
          </p>
          {native && state.enabled && state.permission !== "granted" && (
            <p className="background-warning">
              Notifications are blocked in system settings. Monitoring can run,
              but alerts cannot be delivered.
            </p>
          )}
          {!!(watchlist.length - automated) && (
            <p>
              {watchlist.length - automated} watched source-only services
              require a visit to their official page and cannot send automatic
              alerts.
            </p>
          )}
        </div>
        {native && (
          <button
            className="button primary"
            disabled={busy || !state.ready}
            onClick={toggle}
          >
            {state.enabled ? "Disable alerts" : "Enable alerts"}
          </button>
        )}
      </div>
      <div className="background-foot">
        {native && state.lastCheckedAt && (
          <span>
            Last verified check:{" "}
            {new Date(state.lastCheckedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        <span>
          <ShieldCheck size={16} /> {native ? "Checks" : "Installed apps check"}{" "}
          only your {automated} automated watched feeds in the background.
        </span>
        {native && (
          <span>
            Up to {android ? budget.androidHourly : budget.desktopHourly}{" "}
            scheduled feed requests/hour.
          </span>
        )}
      </div>
      {android && (
        <div className="background-actions widget-action">
          <div>
            <strong>
              <Layers3 size={17} /> Pulse home-screen widget
            </strong>
            <p>
              Issue count, watched services, last-check time, and a refresh
              button. Works without keeping the app open.
            </p>
          </div>
          <button className="button secondary" disabled={busy} onClick={pin}>
            Add widget
          </button>
        </div>
      )}
      {(message || state.error) && (
        <p className="background-message" role="status">
          {message || state.error}
        </p>
      )}
    </section>
  );
}
