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
      // Only the hosted dashboard is an installable web app. The APK and the EXE
      // are built from the same index.html and are already installed
      // applications, so they get neither the manifest link nor the files behind
      // it -- a packaged build asking its own local server for a manifest it does
      // not ship is a 404 and a console error for nothing, and a second caching
      // layer inside a package is a way for it to serve something other than the
      // bytes the release gate verified. The link is injected rather than written
      // into index.html so the decision lives next to the copy rule that enforces
      // it, instead of in two files that can drift.
      name: "pulse-installable-web-app",
      transformIndexHtml(html, context) {
        if (mode !== "web" || !context.filename.endsWith("index.html"))
          return html;
        return html.replace(
          "</head>",
          '  <link rel="manifest" href="/manifest.webmanifest" />\n  </head>',
        );
      },
    },
    {
      name: "pulse-entry-points",
      closeBundle() {
        const webOnly = new Set(["marketing", "manifest.webmanifest", "sw.js"]);
        for (const entry of readdirSync(resolve("public"))) {
          if (entry === "downloads" || (mode !== "web" && webOnly.has(entry))) continue;
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
