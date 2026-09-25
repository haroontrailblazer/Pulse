import { useState } from "react";
import { Plus, X } from "./icons.jsx";
import { statusLabels } from "../shared/providers.js";

// The manage view for providers the reader added themselves.
//
// Deliberately plain: one field, one button, one list. The honest description of
// what these do and do not do sits in the panel rather than in a tooltip,
// because "this one does not alert you" is the kind of thing a reader has to
// know before they rely on it, not after.
export default function CustomProviders({ list, readings, onAdd, onRemove }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    try {
      onAdd(url, { name });
      setUrl("");
      setName("");
      setError("");
    } catch (problem) {
      // makeCustomProvider throws with a sentence meant for a reader.
      setError(problem?.message || "That address could not be used.");
    }
  };

  const reading = (id) => readings.find((r) => r.id === id);

  return (
    <div className="prose">
      <p>
        Most vendors publish a machine-readable status feed at the address of
        their status page. Paste one and Pulse will read it beside the built-in
        services.
      </p>

      <form className="custom-add" onSubmit={submit}>
        <label className="custom-field">
          <span>Status page address</span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://status.yourvendor.com"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
            aria-invalid={error ? "true" : undefined}
          />
        </label>
        <label className="custom-field">
          <span>Name (optional)</span>
          <input
            type="text"
            placeholder="Taken from the address"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button className="button" type="submit" disabled={!url.trim()}>
          <Plus size={16} /> Add
        </button>
      </form>
      {error && (
        <p className="custom-error" role="alert">
          {error}
        </p>
      )}

      {list.length > 0 && (
        <ul className="custom-list">
          {list.map((provider) => {
            const current = reading(provider.id);
            return (
              <li key={provider.id}>
                <span className="custom-list-main">
                  <strong>{provider.name}</strong>
                  <small>{provider.url}</small>
                </span>
                <span className={`custom-list-state is-${current?.status || "unknown"}`}>
                  {statusLabels[current?.status] || "Checking…"}
                </span>
                <button
                  type="button"
                  className="custom-remove"
                  aria-label={`Remove ${provider.name}`}
                  onClick={() => onRemove(provider.id)}
                >
                  <X size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3>What these do, and what they do not</h3>
      <p>
        Your pages are read by this app directly, not by Pulse's servers, so the
        address you paste is never sent anywhere else. They refresh on the same
        thirty-second cadence as everything else while this window is open.
      </p>
      <p>
        They do <strong>not</strong> raise alerts, appear in the Android widget,
        or get checked while the app is closed. Those tiers read the built-in
        catalogue only. A page that cannot be read is reported unavailable, the
        same as any other feed, and never assumed healthy.
      </p>
    </div>
  );
}
