import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource-variable/manrope/wght.css";
import Landing from "./Landing";
import "./marketing.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Landing />
  </React.StrictMode>,
);
