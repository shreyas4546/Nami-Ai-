const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  openApp: (appName) => ipcRenderer.invoke("open-app", appName),
  openFolder: (folderKey) => ipcRenderer.invoke("open-folder", folderKey),
  writeNote: (text) => ipcRenderer.invoke("write-note", text),
});
