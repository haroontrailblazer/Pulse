const { readFileSync, writeFileSync, renameSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
module.exports = async function background({
  app,
  Notification,
  powerMonitor,
  open,
  services,
}) {
  const load = (file) => import(pathToFileURL(path.join(__dirname, file)).href);
  const [{ providers }, { fetchProvider, monitor }, { nextAlert }, { DESKTOP_REFRESH_MS, REFRESH_MS }] =
    services || await Promise.all([
      load("../shared/providers.js"),
      load("../server/status.js"),
      load("../shared/alerts.js"),
      load("../shared/monitor.js"),
    ]);
  const file = path.join(app.getPath("userData"), "watchlist-monitor.json");
  let state = { enabled: false, watchlist: [], signatures: {} };
  try {
    state = { ...state, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {}
  let busy = false,
    pendingSweep = false,
    stopped = false,
    timer,
    suspended = false;
  function persist() {
    writeFileSync(file + ".tmp", JSON.stringify(state));
    renameSync(file + ".tmp", file);
  }
  const status = () => ({
    enabled: state.enabled,
    permission: Notification.isSupported() ? "granted" : "denied",
    lastCheckedAt: state.lastCheckedAt || null,
    intervalSeconds: DESKTOP_REFRESH_MS / 1000,
  });
  function accept(reading) {
    if (!state.enabled || !state.watchlist.includes(reading.id)) return;
    if (reading.checkedAt && !reading.stale) {
      const previousTime = state.checkedAt?.[reading.id];
      if (previousTime && Date.parse(reading.checkedAt) < Date.parse(previousTime)) return;
      state.checkedAt = { ...state.checkedAt, [reading.id]: reading.checkedAt };
      state.lastCheckedAt = reading.checkedAt;
    }
    const result = nextAlert(state.signatures[reading.id], reading);
    if (result.notify && Notification.isSupported()) {
      const notification = new Notification({
        title: `${reading.name} · service issue`,
        body:
          reading.incidents?.[0]?.name ||
          reading.description ||
          "A watched service reports a disruption. Open Pulse for details.",
        icon: path.join(__dirname, "icon.png"),
      });
      notification.on("click", () => open(true));
      notification.show();
    }
    if (result.signature !== undefined)
      state.signatures[reading.id] = result.signature;
  }
  async function sweep() {
    if (busy) { pendingSweep = true; return; }
    if (
      busy ||
      stopped ||
      suspended ||
      !state.enabled ||
      !state.watchlist.length
    )
      return;
    busy = true;
    try {
      const queue = providers.filter(
        (p) => state.watchlist.includes(p.id) && p.format !== "source-only",
      );
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length && !stopped && !suspended && state.enabled) {
        const provider = queue.shift();
        try {
        const cached = monitor
          .snapshot()
          .providers.find((p) => p.id === provider.id);
        const reading =
          cached?.checkedAt &&
          !cached.stale &&
          Date.now() - Date.parse(cached.checkedAt) < REFRESH_MS
            ? cached
            : await fetchProvider(provider);
        accept(reading);
        persist();
        } catch { /* A failed feed must not block the other watched services. */ }
        }
      }));
    } finally {
      busy = false;
      if (pendingSweep) {
        pendingSweep = false;
        void sweep().catch(() => {});
      }
    }
  }
  // Visible sweeps already fetch these readings; piggyback without a second collector.
  const detach = monitor.observeReadings((reading) => {
    if (!state.enabled || !state.watchlist.includes(reading.id)) return;
    accept(reading);
    persist();
  });
  function schedule() {
    clearInterval(timer);
    if (state.enabled && state.watchlist.length && !stopped)
      timer = setInterval(() => void sweep().catch(() => {}), DESKTOP_REFRESH_MS);
  }
  powerMonitor.on("suspend", () => {
    suspended = true;
  });
  powerMonitor.on("resume", () => {
    suspended = false;
    void sweep().catch(() => {});
  });
  schedule();
  void sweep().catch(() => {});
  return {
    status,
    configure(options = {}) {
      const before = new Set(state.watchlist);
      if (Array.isArray(options.watchlist)) {
        state.watchlist = [
          ...new Set(
            options.watchlist.filter((id) =>
              providers.some((p) => p.id === id),
            ),
          ),
        ];
        for (const id of Object.keys(state.signatures))
          if (!state.watchlist.includes(id)) { delete state.signatures[id]; delete state.checkedAt?.[id]; }
      }
      const enabling = options.enabled === true && !state.enabled;
      if (typeof options.enabled === "boolean") state.enabled = options.enabled;
      persist();
      schedule();
      if (enabling || state.watchlist.some((id) => !before.has(id))) void sweep().catch(() => {});
      return status();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      detach();
    },
  };
};
