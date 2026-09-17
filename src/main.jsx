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
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
