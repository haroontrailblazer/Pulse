import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statusApi } from "./api.js";
const root = path.resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (await statusApi(req, res)) return;
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const resolved = path.resolve(
        root,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      let file = resolved;
      let content;
      try {
        content = await readFile(file);
      } catch {
        if (path.extname(file)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        file = path.join(root, "index.html");
        content = await readFile(file);
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end("Unable to serve application");
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Pulse is running at http://localhost:${port}`),
  );
}
