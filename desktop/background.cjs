const { readFileSync, writeFileSync, renameSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
module.exports = async function background({
  app,
  Notification,
  powerMonitor,
  open,
}) {
  const load = (file) => import(pathToFileURL(path.join(__dirname, file)).href);
  const [{ providers }, { fetchProvider, monitor }, { nextAlert }] =
    await Promise.all([
      load("../shared/providers.js"),
      load("../server/status.js"),
      load("../shared/alerts.js"),
    ]);
  const file = path.join(app.getPath("userData"), "watchlist-monitor.json");
  let state = { enabled: false, watchlist: [], signatures: {} };
  try {
    state = { ...state, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {}
  let busy = false,
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
  });
  function accept(reading) {
    if (!state.enabled || !state.watchlist.includes(reading.id)) return;
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
      for (const provider of providers.filter(
        (p) => state.watchlist.includes(p.id) && p.format !== "source-only",
      )) {
        if (stopped || suspended || !state.enabled) break;
        const cached = monitor
          .snapshot()
          .providers.find((p) => p.id === provider.id);
        const reading =
          cached?.checkedAt &&
          !cached.stale &&
          Date.now() - Date.parse(cached.checkedAt) < 120000
            ? cached
            : await fetchProvider(provider);
        accept(reading);
      }
      persist();
    } finally {
      busy = false;
    }
  }
  // Visible sweeps already fetch these readings; piggyback without a second collector.
  const original = monitor.subscribe;
  monitor.subscribe = (listener) =>
    original((snapshot) => {
      listener(snapshot);
      if (!snapshot.refreshing && state.enabled) {
        snapshot.providers.forEach(accept);
        persist();
      }
    });
  function schedule() {
    clearInterval(timer);
    timer = setInterval(() => void sweep().catch(() => {}), 300000);
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
      if (Array.isArray(options.watchlist)) {
        state.watchlist = [
          ...new Set(
            options.watchlist.filter((id) =>
              providers.some((p) => p.id === id),
            ),
          ),
        ];
        for (const id of Object.keys(state.signatures))
          if (!state.watchlist.includes(id)) delete state.signatures[id];
      }
      const enabling = options.enabled === true && !state.enabled;
      if (typeof options.enabled === "boolean") state.enabled = options.enabled;
      persist();
      if (enabling) void sweep().catch(() => {});
      return status();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
};
