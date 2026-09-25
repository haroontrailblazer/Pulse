import React, { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Bell, Layers3, LayoutDashboard, ShieldCheck } from "./icons";
import { providers } from "../shared/providers";
import { nativeWatchlist } from "../shared/custom-providers.js";
import { requestBudget } from "../shared/alerts";
import "./background.css";

const android = Capacitor.getPlatform() === "android";
const native = android
  ? registerPlugin("PulseBackground")
  : window.pulseDesktop;
let bridgeState = { enabled: false, permission: "prompt", ready: false };
// Whole hours only. The decision is an integer comparison on both tiers so the
// shared table can assert it without encoding a timezone, and minutes would
// mean a second number to agree about for very little.
const hourLabel = (hour) => `${String(hour ?? 0).padStart(2, "0")}:00`;
const HOURS = Array.from({ length: 24 }, (_, hour) => (
  <option key={hour} value={hour}>
    {hourLabel(hour)}
  </option>
));
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
// The newer release the native side found this morning, or null. Both natives
// report it inside the same state object status() and configure() resolve, so it
// arrives with the configure call the app already makes on every boot rather than
// needing a bridge call of its own -- and the website has no `native`, so it is
// null there and the row never renders.
// Ask the native side to fetch the update, or to install what it fetched. Both
// are reader-initiated: a download spends their bandwidth and an install loses
// what is on screen, so neither ever happens on a schedule.
export async function updateAction(action) {
  if (!native) return null;
  if (android) {
    const call =
      action === "install" ? native.installUpdate : native.downloadUpdate;
    return call ? call.call(native, {}) : null;
  }
  return native.update ? native.update(action) : null;
}

export function useUpdateNotice() {
  const [state, setState] = useState(bridgeState);
  useEffect(() => {
    subscribers.add(setState);
    return () => subscribers.delete(setState);
  }, []);
  return state.update
    ? {
        ...state.update,
        download: state.download || null,
        canInstall: state.canInstall !== false,
      }
    : null;
}

// Progress, pushed from Android as the bytes arrive. The EXE reports through the
// same bridge state instead, so this listener is Android-only.
export function useDownloadProgress() {
  const [at, setAt] = useState(null);
  useEffect(() => {
    if (!android) return;
    const listener = native.addListener("updateDownload", (event) =>
      setAt(event),
    );
    return () => {
      listener.then((handle) => handle.remove());
    };
  }, []);
  return at;
}

// Tapping the update notification asks for the sheet the notice lives in, because
// on a phone the row is behind the More button and opening the app alone would
// show an unchanged screen.
export function useUpdateIntent(onOpen) {
  useEffect(() => {
    if (!android) return;
    const listener = native.addListener("openUpdate", () => onOpen());
    return () => {
      listener.then((handle) => handle.remove());
    };
  }, [onOpen]);
}

export function useBackgroundSync(watchlist, data) {
  // Only ids the native catalog can resolve. A custom provider sent here makes
  // PulseBackground.configure purge on every round trip and never alerts.
  const ids = JSON.stringify(nativeWatchlist(watchlist));
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
  const setQuiet = (quietFrom, quietTo) => {
    // Optimistic: the bridge is the source of truth and republishes on resolve,
    // but a select that does not move until a round trip completes feels broken.
    publish({ ...bridgeState, quietFrom, quietTo });
    configure({ quietFrom, quietTo }).catch((e) =>
      publish({ ...bridgeState, error: e.message }),
    );
  };
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
          {/* An h3, not an h2. This panel lives inside the preferences sheet,
              whose title is already the dialog's h2, and a second one at the
              same level gave the sheet two competing headings. The copy is
              unchanged: it says something the rows beneath it do not. */}
          <h3>Your stack. Even when you step away.</h3>
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
                ? `Pulse keeps a visible background-monitor notification. Every ${state.intervalSeconds || 20} seconds it asks your ${automated} watched feeds whether their published status has moved, and reads one in full when it has, or every five minutes regardless. With the screen off a wake-up alarm carries the checks about every five minutes, which Android can stretch to roughly nine on an idle device. You are alerted both when a watched service reports a new issue and when it recovers. Android can still stop monitoring after force-stop or under battery restrictions.`
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
      {native && state.enabled && (
        <div className="quiet-hours">
          <label>
            <span>Quiet from</span>
            <select
              value={state.quietFrom ?? 0}
              disabled={busy || !state.ready}
              onChange={(e) => setQuiet(Number(e.target.value), state.quietTo ?? 0)}
            >
              {HOURS}
            </select>
          </label>
          <label>
            <span>until</span>
            <select
              value={state.quietTo ?? 0}
              disabled={busy || !state.ready}
              onChange={(e) => setQuiet(state.quietFrom ?? 0, Number(e.target.value))}
            >
              {HOURS}
            </select>
          </label>
          <p>
            {(state.quietFrom ?? 0) === (state.quietTo ?? 0)
              ? "Quiet hours are off. Set two different times to silence watchlist alerts overnight."
              : `Watchlist alerts and recoveries are held between ${hourLabel(state.quietFrom)} and ${hourLabel(state.quietTo)} on this device's clock. Nothing is dropped: an issue that is still there when the window closes is reported once. Update notices are not affected.`}
          </p>
        </div>
      )}
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
