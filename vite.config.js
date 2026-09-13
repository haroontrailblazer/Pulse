import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { statusApi } from "./server/api.js";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
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
      name: "pulse-native-assets",
      closeBundle() {
        if (mode !== "web")
          rmSync(resolve("dist/marketing"), { recursive: true, force: true });
      },
    },
    {
      name: "pulse-status-api",
      configureServer: installApi,
      configurePreviewServer: installApi,
    },
  ],
}));
