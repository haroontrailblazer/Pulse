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
          // Windows delivers a mouse's own back and forward buttons as app
          // commands rather than as keys, so they have to be picked up here.
          // Alt+Left and Alt+Right are bound in the renderer instead, because
          // only that side can tell that the reader is typing in a field and
          // leave the keystroke alone.
          //
          // The main process deliberately knows nothing about what is on screen.
          // It does not need to: in Pulse a sheet is a history entry too, so one
          // step back closes the sheet when one is open and changes the place
          // when none is. That is the whole reason this needs no new IPC channel
          // and no change to preload.cjs or its trusted-sender check.
          win.on("app-command", (event, command) => {
            const history = win.webContents.navigationHistory;
            if (command === "browser-backward" && history.canGoBack())
              history.goBack();
            if (command === "browser-forward" && history.canGoForward())
              history.goForward();
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
      // One channel rather than two, and behind the same sender check: the row
      // asks to download, then asks to restart. Nothing here happens on a timer.
      ipcMain.handle("pulse:update", (event, action) => {
        trusted(event);
        if (action === "download") return background.download();
        if (action === "install") return background.install();
        return background.status();
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
      // A login start must not throw a 1480x960 window at the reader every
      // boot. The tray is what holds the process alive, and it exists by the
      // time this runs, so there is nothing else to keep open.
      if (!process.argv.includes("--hidden")) open();
      // Scanning a watchlist square on a phone opens Pulse there; on Windows the
      // same link arrives because Pulse registers the scheme, and Windows hands it
      // to a second instance as an argument. Single-instance means that second
      // process quits immediately, so the URL is read from what it passed over.
      //
      // A private scheme, not an https link, deliberately: a link would carry the
      // reader's whole watchlist in a request line to a server. Nothing about the
      // code is trusted here -- it goes to the paste field, and the reader still
      // sees what it would add before agreeing.
      app.setAsDefaultProtocolClient("pulse");
      const handTransfer = (argv) => {
        const link = (argv || []).find((argument) =>
          /^pulse:\/\/transfer\?/i.test(argument),
        );
        if (!link) return;
        const code = link.slice(link.indexOf("c=") + 2);
        if (!code.startsWith("PULSE") || code.length > 4000) return;
        // A link can arrive before there is a window to show it in, and on a cold
        // start the window exists well before the app inside it is listening. Both
        // would drop the code silently, so the window is opened first and the
        // dispatch waits for the load to finish when one is still in progress.
        open();
        if (!win) return;
        const deliver = () =>
          win.webContents.executeJavaScript(
            `window.dispatchEvent(new CustomEvent("pulse-transfer-code",{detail:${JSON.stringify(code)}}))`,
          );
        if (win.webContents.isLoading())
          win.webContents.once("did-finish-load", deliver);
        else deliver();
      };
      app.on("second-instance", (event, argv) => {
        open();
        handTransfer(argv);
      });
      app.on("activate", () => open());
      // macOS delivers it as an event rather than an argument. Pulse ships for
      // Windows, but leaving this out would make the scheme silently dead there.
      app.on("open-url", (event, url) => {
        event.preventDefault();
        open();
        handTransfer([url]);
      });
      handTransfer(process.argv);
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
