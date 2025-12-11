// electron/preload.mjs
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("webtoonApi", {
  pickInput: () => ipcRenderer.invoke("pick-input"),
  pickOutput: () => ipcRenderer.invoke("pick-output"),
  process: (payload) => ipcRenderer.invoke("process-webtoon", payload),
  splitSegment: (payload) => ipcRenderer.invoke("split-segment", payload),
});
