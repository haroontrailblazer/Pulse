# Monitoring API


- `GET /api/status`: full normalized snapshot, diagnostic metadata, and observed event history.
- `GET /api/status?refresh=1`: request a new sweep (5-second global cooldown; concurrent refresh requests share the same work).
- `GET /api/status/stream`: SSE snapshot followed by per-provider deltas. When `partial` is true, merge providers by `id`; metadata and history replace the previous values. Comment heartbeats arrive every 15 seconds. Disable proxy buffering and allow long-lived connections when deploying. Browser clients fall back to polling when streaming is unavailable.

The server runs automatic sweeps while stream subscribers are connected. REST-only clients initiate sweeps through their requests. Production hosting must keep the Node server running; static hosting alone cannot collect provider feeds.

