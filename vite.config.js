import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { statusApi } from "./server/api.js";
import { resolve } from "node:path";
import { cpSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { buildIdentity } from "./scripts/build-identity.mjs";
function installApi(server) {
  server.middlewares.use(async (req, res, next) => {
    if (!(await statusApi(req, res))) next();
  });
}
export default defineConfig(({ mode }) => ({
  // Installers are delivery assets, never application assets. Explicit copying
  // prevents APKs/EXEs from recursively embedding previous downloads.
  define: {
    "import.meta.env.VITE_STATUS_TRANSPORT": JSON.stringify(
      mode === "web" ? "poll" : "stream",
    ),
  },
  build: {
    copyPublicDir: false,
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
        for (const entry of readdirSync(resolve("public"))) {
          if (entry === "downloads" || (mode !== "web" && entry === "marketing")) continue;
          cpSync(resolve("public", entry), resolve("dist", entry), { recursive: true });
        }
        writeFileSync(resolve("dist/pulse-build.json"), JSON.stringify(buildIdentity(), null, 2));
        if (mode === "web") {
          // Make marketing the physical index so platform SPA defaults cannot
          // bypass a homepage rewrite and accidentally expose the dashboard.
          renameSync(
            resolve("dist/index.html"),
            resolve("dist/dashboard.html"),
          );
          renameSync(resolve("dist/landing.html"), resolve("dist/index.html"));
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
