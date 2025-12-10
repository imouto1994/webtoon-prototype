// electron/renderer.mjs
const pickInputBtn = document.querySelector("#pickInput");
const pickOutputBtn = document.querySelector("#pickOutput");
const processBtn = document.querySelector("#processBtn");
const inputPathEl = document.querySelector("#inputPath");
const outputPathEl = document.querySelector("#outputPath");
const statusEl = document.querySelector("#status");
const resultSummaryEl = document.querySelector("#resultSummary");
const resultListEl = document.querySelector("#resultList");

const api = window.webtoonApi;
if (!api) {
  const msg = "Preload bridge is unavailable. Restart the app.";
  console.error(msg);
  if (statusEl) statusEl.textContent = msg;
}

let inputDir = "";
let outputDir = "";

pickInputBtn.addEventListener("click", async () => {
  if (!api) return;
  const selection = await api.pickInput();
  if (selection) {
    inputDir = selection;
    inputPathEl.textContent = inputDir;
  }
});

pickOutputBtn.addEventListener("click", async () => {
  if (!api) return;
  const selection = await api.pickOutput();
  if (selection) {
    outputDir = selection;
    outputPathEl.textContent = outputDir;
  }
});

processBtn.addEventListener("click", async () => {
  if (!inputDir) {
    setStatus("Please choose an input folder first.", "warn");
    return;
  }

  setStatus("Processing…");
  resultSummaryEl.textContent = "";
  resultListEl.innerHTML = "";

  try {
    const res = await api.process({ inputDir, outputDir });
    const { files, outputDir: resolvedOutput } = res;
    setStatus(`Done. Wrote ${files.length} files.`, "ok");
    resultSummaryEl.textContent = `Output folder: ${resolvedOutput}`;
    files.forEach((file) => {
      const li = document.createElement("li");
      li.textContent = file;
      resultListEl.append(li);
    });
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, "error");
  }
});

function setStatus(message, mode = "info") {
  const colors = {
    info: "#7bd88f",
    ok: "#7bd88f",
    warn: "#f5a524",
    error: "#ef5b77",
  };
  statusEl.style.color = colors[mode] ?? colors.info;
  statusEl.textContent = message;
}
