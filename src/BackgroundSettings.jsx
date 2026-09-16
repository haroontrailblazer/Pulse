import React, { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Bell, Layers3, LayoutDashboard, ShieldCheck } from "./icons";
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
// Installed builds turn watchlist alerts on themselves the first time they run.
// Android still has to ask for the notification permission — that prompt is the
// user's choice and cannot be skipped — but if it is granted, monitoring starts
// without a second trip to Settings. Declining is remembered, so the prompt is
// asked once and never again; Settings still turns it on or off afterwards.
const FIRST_RUN_KEY = "pulse-alerts-first-run";
function alertsAlreadyOffered() {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) === "done";
  } catch {
    return true;
  }
}
function rememberAlertsOffered() {
  try {
    localStorage.setItem(FIRST_RUN_KEY, "done");
  } catch {}
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
    if (!native || alertsAlreadyOffered()) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await native.status();
        if (cancelled) return;
        publish(status);
        if (status.enabled) return rememberAlertsOffered();
        if (android) {
          const permission = await native.requestAlerts();
          if (cancelled) return;
          publish(permission);
          if (permission.permission !== "granted") return rememberAlertsOffered();
        }
        await configure({ enabled: true, watchlist: JSON.parse(ids) });
        rememberAlertsOffered();
      } catch {
        // A bridge that is not ready yet gets another chance on the next run.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per install, not per watchlist edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  async function pin(widget) {
    setBusy(true);
    try {
      const result = await native.pinWidget({ widget });
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
    // Icon only, on the directory's title line. The label the text used to
    // carry moves to the accessible name so nothing is lost to a screen
    // reader or a hover.
    const on = native && state.enabled && state.permission === "granted";
    const label = on ? "Alerts enabled" : "Enable alerts";
    return (
      <button
        className={`icon-button overview-alerts ${on ? "is-on" : ""}`}
        onClick={onConfigure}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
      >
        <Bell size={20} weight={on ? "fill" : "regular"} />
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
                ? `Pulse keeps a visible background-monitor notification and checks your ${automated} watched feeds about every ${state.intervalSeconds || 30} seconds while the screen is on. With the screen off Android spaces checks out to roughly every 10 minutes, and you are alerted both when a watched service reports a new issue and when it recovers. Android can still stop monitoring after force-stop or under battery restrictions.`
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
              <Layers3 size={16} /> Pulse home-screen widget
            </strong>
            <p>
              Issue count, last-check time, and a refresh button above your
              watched services. Resize it taller to read more of the list. Works
              without keeping the app open.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => pin("stack")}
          >
            Add widget
          </button>
        </div>
      )}
      {android && (
        <div className="background-actions widget-action">
          <div>
            <strong>
              <LayoutDashboard size={16} /> Service icons widget
            </strong>
            <p>
              Just your watched services, each in its own brand colour. An icon
              turns amber when its official feed reports a degradation and red
              during an outage. Choose a transparent or dark background as you
              add it, and resize it — the marks grow to fill the space.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => pin("icons")}
          >
            Add icons widget
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
