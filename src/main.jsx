import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource-variable/manrope/wght.css";
import "./styles.css";
import "./refinements.css";
import "./theme.css";
if (Capacitor.getPlatform() === "android")
  document.documentElement.dataset.platform = "android";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
