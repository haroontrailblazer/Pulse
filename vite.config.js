import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { statusApi } from "./server/api.js";
function installApi(server) {
  server.middlewares.use(async (req, res, next) => {
    if (!(await statusApi(req, res))) next();
  });
}
export default defineConfig({
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
      name: "pulse-status-api",
      configureServer: installApi,
      configurePreviewServer: installApi,
    },
  ],
});
