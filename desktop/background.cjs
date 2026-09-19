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
  const [
    { providers },
    { fetchProvider, monitor },
    { nextAlert },
    { DESKTOP_REFRESH_MS, REFRESH_MS },
    updates,
  ] =
    services || await Promise.all([
      load("../shared/providers.js"),
      load("../server/status.js"),
      load("../shared/alerts.js"),
      load("../shared/monitor.js"),
      load("../shared/updates.js"),
    ]);
  const running = app.getVersion();
  const file = path.join(app.getPath("userData"), "watchlist-monitor.json");
  // updateCheckedDay is the reader's local day, so "once a day" means a day they
  // would recognise. updateNotified is the version already announced, so the
  // notification arrives once per release rather than once per morning.
  // What the in-app download is doing. Deliberately not persisted: a download
  // does not survive the process, and a stored "downloading" with nothing
  // running is how a row ends up frozen at a percentage.
  let download = { state: "idle" };
  let state = {
    enabled: false,
    watchlist: [],
    signatures: {},
    update: null,
    updateCheckedDay: "",
    updateNotified: "",
  };
  try {
    state = { ...state, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {}
  let busy = false,
    pendingSweep = false,
    stopped = false,
    timer,
    updateTimer,
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
    // Re-checked on every read rather than trusted from disk, so the row
    // disappears by itself once the reader has installed the build it names.
    //
    // It belongs in status() and not merged in by main.cjs, and that is the one
    // wiring fact in this feature worth writing down: configure() returns
    // status(), and configure({watchlist}) is the only bridge call the renderer
    // makes on every boot -- nothing calls status() at startup on a second run.
    // Put the field anywhere else and the sidebar row is missing until the reader
    // opens Settings, and is wiped again by every watchlist edit.
    update: updates.newerVersion(state.update?.version, running)
      ? state.update
      : null,
    download,
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
  // The daily update check. Deliberately not on the sweep interval: the reader
  // asked for one look each morning, not a poll, and a release is not a thing
  // that changes between breakfast and lunch.
  //
  // A timeout alone would not be enough. Windows does not advance a pending
  // setTimeout across system suspend, so a machine asleep at 08:00 would fire
  // late by however long it slept. So the decision is always re-derived from the
  // clock -- on start, on resume, and when the timer lands -- and the timer is
  // only what makes it punctual on a machine that stays awake.
  async function checkUpdate() {
    const now = new Date();
    if (
      !updates.dueFrom(
        state.updateCheckedDay,
        updates.localDay(now),
        now.getHours(),
      )
    )
      return;
    let manifest = null;
    try {
      const answer = await fetch(updates.latestManifestUrl, {
        // A manifest that can be redirected is a manifest that can be moved.
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });
      if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
      manifest = await answer.json();
    } catch {
      // No network, a 500, or something that is not JSON. The day is left
      // unmarked so the next resume tries again, and nothing is announced --
      // silence is the only honest output of a check that did not happen.
      return;
    }
    const update = updates.readUpdate(manifest, "windows", running);
    state.update = update;
    state.updateCheckedDay = updates.localDay(new Date());
    if (update && state.updateNotified !== update.version) {
      state.updateNotified = update.version;
      if (Notification.isSupported()) {
        const note = new Notification({
          title: `Pulse ${update.version} is available`,
          body: "Open Pulse to download the new version for Windows.",
          icon: path.join(__dirname, "icon.png"),
        });
        note.on("click", () => open());
        note.show();
      }
    }
    persist();
  }
  function armUpdate() {
    clearTimeout(updateTimer);
    if (stopped) return;
    updateTimer = setTimeout(
      () => {
        void checkUpdate().catch(() => {});
        armUpdate();
      },
      Math.max(1000, updates.nextRunAt(new Date()) - Date.now()),
    );
    // Nothing holds the process open for this on its own: the tray already does,
    // because the first run enables monitoring for itself.
    if (typeof updateTimer.unref === "function") updateTimer.unref();
  }
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
    // A laptop that slept through 08:00 -- or through three of them -- checks once
    // here, and the timer is re-armed against the clock it woke up to rather than
    // the one it went to sleep on.
    void checkUpdate().catch(() => {});
    armUpdate();
  });
  const downloader = require("./download.cjs")({
    app,
    updates,
    report(next) {
      download = { ...next };
    },
  });
  schedule();
  void sweep().catch(() => {});
  // On start too, for the machine that was simply switched off this morning.
  armUpdate();
  void checkUpdate().catch(() => {});
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
    // The row asks for these; nothing happens on a schedule. A download is the
    // reader deciding to spend their bandwidth, and a restart is the reader
    // deciding to lose what is on screen.
    download() {
      const offered = updates.newerVersion(state.update?.version, running)
        ? state.update
        : null;
      downloader.start(offered);
      return status();
    },
    install() {
      return downloader.restart();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      clearTimeout(updateTimer);
      downloader.stop();
      detach();
    },
  };
};
