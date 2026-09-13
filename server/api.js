import { monitor } from "./status.js";
export async function statusApi(req, res, engine = monitor) {
  const url = new URL(req.url, "http://localhost");
  if (!["/api/status", "/api/status/stream"].includes(url.pathname))
    return false;
  res.setHeader("Cache-Control", "no-store");
  if (process.env.CORS_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN);
    res.setHeader("Vary", "Origin");
  }
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET" });
    res.end();
    return true;
  }
  if (url.pathname.endsWith("/stream")) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    let previous;
    const unsubscribe = engine.subscribe((data) => {
      const payload = previous
        ? {
            ...data,
            partial: true,
            providers: data.providers.filter(
              (p, i) => p !== previous.providers[i],
            ),
          }
        : data;
      previous = data;
      if (!res.destroyed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(": heartbeat\n\n");
    }, 15000);
    heartbeat.unref?.();
    res.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } else {
    try {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          await engine.refresh({
            force: url.searchParams.get("refresh") === "1",
          }),
        ),
      );
    } catch {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Status sources unavailable" }));
    }
  }
  return true;
}
