const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("API", {
  // info varie (se ti servono)
  openSettings: () => ipcRenderer.send("open-settings"),
  getBattery: () => ipcRenderer.invoke("get-battery"),
  getCpuLoad: () => ipcRenderer.invoke("get-cpu"),
  getMemory: () => ipcRenderer.invoke("get-mem"),
  getCpuInfo: () => ipcRenderer.invoke("get-cpu-info"),
  getProcesses: () => ipcRenderer.invoke("get-processes"),
  getTimeInfo: () => ipcRenderer.invoke("get-time-info"),
  getMousePosition: () => ipcRenderer.invoke("get-mouse-position"),

  // export PNG/SVG
  saveHourAssets: (payload) => ipcRenderer.invoke("save-hour-assets", payload),
});
