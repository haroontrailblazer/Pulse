const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pulseDesktop", {
  configure: (options) => ipcRenderer.invoke("pulse:configure", options),
  status: () => ipcRenderer.invoke("pulse:status"),
});
