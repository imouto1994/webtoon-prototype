// electron/main.mjs
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processWebtoon, splitSegment } from "./processor.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WINDOW_WIDTH = 1000;
const WINDOW_HEIGHT = 800;

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("pick-input", async () => {
  const res = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle("pick-output", async () => {
  const res = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle("process-webtoon", async (_event, { inputDir, outputDir }) => {
  if (!inputDir) throw new Error("Input directory is required.");
  const finalOutput = outputDir || path.join(inputDir, "images_output");
  const files = await processWebtoon({ inputDir, outputDir: finalOutput });
  return { outputDir: finalOutput, files };
});

ipcMain.handle("split-segment", async (_event, { filePath, breakpoint }) => {
  if (!filePath || typeof breakpoint !== "number") {
    throw new Error("filePath and breakpoint are required.");
  }
  const files = await splitSegment({ filePath, breakpointPx: breakpoint });
  return { files };
});

function createWindow() {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
}
