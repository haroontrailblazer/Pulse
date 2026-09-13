const {
  app,
  BrowserWindow,
  shell,
  dialog,
  Tray,
  Menu,
  Notification,
  ipcMain,
  powerMonitor,
} = require("electron");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
let server,
  win,
  tray,
  background,
  quitting = false;
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
if (hasLock)
  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId("app.pulse.status");
      const { createServer } = await import(
        pathToFileURL(path.join(__dirname, "../server/index.js")).href
      );
      server = createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(47823, "127.0.0.1", resolve);
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      function open(watchlist = false) {
        if (!win || win.isDestroyed()) {
          win = new BrowserWindow({
            width: 1480,
            height: 960,
            minWidth: 390,
            minHeight: 620,
            title: "Pulse",
            icon: path.join(__dirname, "icon.png"),
            autoHideMenuBar: true,
            backgroundColor: "#ffffff",
            webPreferences: {
              preload: path.join(__dirname, "preload.cjs"),
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          });
          win.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith("https://")) shell.openExternal(url);
            return { action: "deny" };
          });
          win.webContents.on("will-navigate", (event, url) => {
            if (new URL(url).origin !== origin) {
              event.preventDefault();
              if (url.startsWith("https://")) shell.openExternal(url);
            }
          });
          win.on("close", (event) => {
            if (!quitting && background?.status().enabled) {
              event.preventDefault();
              win.hide();
            }
          });
          win.loadURL(origin + (watchlist ? "/?watchlist=1" : "/"));
        } else {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          if (watchlist)
            win.webContents.executeJavaScript(
              'window.dispatchEvent(new Event("pulse-open-watchlist"))',
            );
        }
      }
      background = await require("./background.cjs")({
        app,
        Notification,
        powerMonitor,
        open,
      });
      function trusted(event) {
        if (
          event.senderFrame !== win?.webContents.mainFrame ||
          new URL(event.senderFrame.url).origin !== origin
        )
          throw new Error("Untrusted sender");
      }
      ipcMain.handle("pulse:status", (event) => {
        trusted(event);
        return background.status();
      });
      ipcMain.handle("pulse:configure", (event, options) => {
        trusted(event);
        return background.configure(options);
      });
      tray = new Tray(path.join(__dirname, "icon.ico"));
      tray.setToolTip("Pulse · watchlist monitor");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open Pulse", click: () => open() },
          { label: "Watchlist", click: () => open(true) },
          { type: "separator" },
          { label: "Quit Pulse", click: () => app.quit() },
        ]),
      );
      tray.on("double-click", () => open());
      open();
      app.on("second-instance", () => open());
      app.on("activate", () => open());
    })
    .catch((error) => {
      dialog.showErrorBox(
        "Pulse could not start",
        error.code === "EADDRINUSE"
          ? "Pulse needs local port 47823. Close the application using that port and try again."
          : error.message,
      );
      app.quit();
    });
app.on("before-quit", () => {
  quitting = true;
  background?.stop();
  server?.close();
});
app.on("window-all-closed", () => {
  if (!background?.status().enabled) app.quit();
});
