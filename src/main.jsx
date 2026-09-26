import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource/instrument-serif/latin-400.css";
import "./tokens.css";
import "./styles.css";
import "./theme.css";
import "./components.css";
import "./platform.css";
if (Capacitor.getPlatform() === "android")
  document.documentElement.dataset.platform = "android";

// A focus ring belongs to the keyboard. `:focus-visible` handles that for most
// controls, but a text field always matches it — the spec says so, because
// typing is expected there — so no selector can tell a tap from a Tab. This
// records which one the reader last used; the stylesheet shows the field's
// focus border only while that is the keyboard, and a tap gets nothing.
{
  const root = document.documentElement;
  const record = (kind) => {
    if (root.dataset.input !== kind) root.dataset.input = kind;
  };
  record("keyboard");
  addEventListener("pointerdown", () => record("pointer"), { capture: true });
  addEventListener(
    "keydown",
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        event.key === "Tab" ||
        event.key === "Escape" ||
        event.key.startsWith("Arrow")
      )
        record("keyboard");
    },
    { capture: true },
  );
}
// Only the hosted site registers a worker. The APK and the EXE serve this same
// bundle from their own local origins and are already installed applications with
// their own offline behaviour, so a second caching layer there would add a way for
// a packaged build to serve something other than the bytes the release gate
// verified. "poll" is the transport the web build compiles in, and it is already
// how this bundle knows which surface it is on.
//
// Scope is narrowed to /app deliberately, even though the script sits at the root
// and could claim everything: the marketing page is a separate document with its
// own bundle, and nothing about it should go through here.
if (
  import.meta.env.VITE_STATUS_TRANSPORT === "poll" &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator
)
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/app" }).catch(() => {
      // An unregistrable worker is not a failure worth showing anyone: the app
      // works exactly as it did before, it simply will not open offline.
    });
  });

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
