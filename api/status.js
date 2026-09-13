import { monitor } from "../server/status.js";

// Bounded requests suit Vercel's on-demand runtime; no long-lived subscription.
export function createStatusHandler(engine = monitor) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.statusCode = 405;
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const data = await engine.refresh();
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=30, must-revalidate",
      );
      res.end(JSON.stringify(data));
    } catch {
      res.statusCode = 503;
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "Status sources unavailable" }));
    }
  };
}
export default createStatusHandler();
