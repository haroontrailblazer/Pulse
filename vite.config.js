import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { statusApi } from "./server/api.js";
import { resolve } from "node:path";
import { rmSync, renameSync } from "node:fs";
function installApi(server) {
  server.middlewares.use(async (req, res, next) => {
    if (!(await statusApi(req, res))) next();
  });
}
export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_STATUS_TRANSPORT": JSON.stringify(
      mode === "web" ? "poll" : "stream",
    ),
  },
  build: {
    rollupOptions: {
      input:
        mode === "web"
          ? { app: resolve("index.html"), landing: resolve("landing.html") }
          : { app: resolve("index.html") },
    },
  },
  server: {
    watch: {
      ignored: [
        "**/.cache/**",
        "**/android/**",
        "**/releases/**",
        "**/dist/**",
      ],
    },
  },
  plugins: [
    react(),
    {
      name: "pulse-entry-points",
      closeBundle() {
        if (mode === "web") {
          // Make marketing the physical index so platform SPA defaults cannot
          // bypass a homepage rewrite and accidentally expose the dashboard.
          renameSync(
            resolve("dist/index.html"),
            resolve("dist/dashboard.html"),
          );
          renameSync(resolve("dist/landing.html"), resolve("dist/index.html"));
        } else {
          rmSync(resolve("dist/marketing"), { recursive: true, force: true });
        }
      },
    },
    {
      name: "pulse-status-api",
      configureServer: installApi,
      configurePreviewServer: installApi,
    },
  ],
}));
