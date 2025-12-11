// electron/renderer.mjs
const pickInputBtn = document.querySelector("#pickInput");
const pickOutputBtn = document.querySelector("#pickOutput");
const processBtn = document.querySelector("#processBtn");
const inputPathEl = document.querySelector("#inputPath");
const outputPathEl = document.querySelector("#outputPath");
const statusEl = document.querySelector("#status");
const resultSummaryEl = document.querySelector("#resultSummary");
const resultListEl = document.querySelector("#resultList");
const gridEl = document.querySelector("#grid");
const editorModal = document.querySelector("#editorModal");
const editorImage = document.querySelector("#editorImage");
const dragLine = document.querySelector("#dragLine");
const dragHandle = document.querySelector("#dragHandle");
const editorInfo = document.querySelector("#editorInfo");
const cancelEditBtn = document.querySelector("#cancelEdit");
const saveEditBtn = document.querySelector("#saveEdit");
const editorCanvas = document.querySelector("#editorCanvas");

const api = window.webtoonApi;
if (!api) {
  const msg = "Preload bridge is unavailable. Restart the app.";
  console.error(msg);
  if (statusEl) statusEl.textContent = msg;
}

let inputDir = "";
let outputDir = "";
let segments = [];
let editing = null;
let dragState = { dragging: false, displayHeight: 0, naturalHeight: 0, y: 0 };

const MAX_SEGMENT_HEIGHT = 2000;

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
  gridEl.innerHTML = "";
  segments = [];

  try {
    const res = await api.process({ inputDir, outputDir });
    const { files, outputDir: resolvedOutput } = res;
    setStatus(`Done. Wrote ${files.length} files.`, "ok");
    resultSummaryEl.textContent = `Output folder: ${resolvedOutput}`;
    segments = await loadSegmentMetadata(files);
    renderAll();
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

function renderList(items) {
  resultListEl.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.path} (${item.height}px)`;
    resultListEl.append(li);
  });
}

function renderGrid(items) {
  gridEl.innerHTML = "";
  items.forEach((item, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "segment";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = `file://${item.path}`;
    img.alt = `Segment ${idx}`;

    const footer = document.createElement("footer");
    const meta = document.createElement("span");
    meta.textContent = `#${idx} • ${item.height}px`;

    const link = document.createElement("a");
    link.href = `file://${item.path}`;
    link.download = item.path.split("/").pop();
    link.textContent = "Open";

    footer.append(meta, link);

    if (item.height > MAX_SEGMENT_HEIGHT) {
      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.style.marginLeft = "8px";
      editBtn.addEventListener("click", () => openEditor(item));
      footer.append(editBtn);
    }

    wrapper.append(img, footer);
    gridEl.append(wrapper);
  });
}

async function loadSegmentMetadata(files) {
  const metas = await Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () =>
            resolve({
              path: file,
              width: img.naturalWidth || 0,
              height: img.naturalHeight || 0,
            });
          img.onerror = () => resolve({ path: file, width: 0, height: 0 });
          img.src = `file://${file}`;
        })
    )
  );
  return metas;
}

function renderAll() {
  const sorted = [...segments].sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" })
  );
  segments = sorted;
  renderList(sorted);
  renderGrid(sorted);
}

function openEditor(segment) {
  editing = segment;
  editorModal.classList.add("open");
  editorInfo.textContent = `${segment.path} • ${segment.height}px`;
  dragState = { dragging: false, displayHeight: 0, naturalHeight: 0, y: 0 };
  editorImage.src = `file://${segment.path}`;
}

editorImage?.addEventListener("load", () => {
  const scrollHeight = editorCanvas.scrollHeight || editorImage.getBoundingClientRect().height;
  dragState.displayHeight = scrollHeight;
  dragState.naturalHeight = editorImage.naturalHeight || 0;
  const defaultY = Math.min(
    scrollHeight - 10,
    Math.max(
      10,
      (MAX_SEGMENT_HEIGHT / (dragState.naturalHeight || 1)) * scrollHeight
    )
  );
  setLinePosition(defaultY);
});

dragLine?.addEventListener("mousedown", (e) => {
  dragState.dragging = true;
  e.preventDefault();
});

window.addEventListener("mouseup", () => {
  dragState.dragging = false;
});

window.addEventListener("mousemove", (e) => {
  if (!dragState.dragging) return;
  const rect = editorCanvas.getBoundingClientRect();
  const y = e.clientY - rect.top + editorCanvas.scrollTop;
  setLinePosition(y);
});

cancelEditBtn?.addEventListener("click", () => {
  closeEditor();
});

saveEditBtn?.addEventListener("click", async () => {
  if (!editing || !api) return;
  if (!dragState.displayHeight || !dragState.naturalHeight) {
    setStatus("Cannot read image dimensions.", "warn");
    return;
  }
  const ratio = dragState.naturalHeight / dragState.displayHeight;
  const breakpoint = Math.round(dragState.y * ratio);
  const safeBreakpoint = Math.min(
    Math.max(1, breakpoint),
    dragState.naturalHeight - 1
  );

  try {
    setStatus("Splitting segment…");
    const res = await api.splitSegment({
      filePath: editing.path,
      breakpoint: safeBreakpoint,
    });
    const newMetas = await loadSegmentMetadata(res.files);
    segments = segments.filter((s) => s.path !== editing.path).concat(newMetas);
    renderAll();
    setStatus(
      `Split into ${newMetas.length} parts. Heights: ${newMetas
        .map((m) => m.height)
        .join(", ")}px`,
      "ok"
    );
    closeEditor();
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, "error");
  }
});

function setLinePosition(y) {
  if (!editorCanvas) return;
  const maxY = Math.max(8, editorCanvas.scrollHeight - 8);
  const clamped = Math.min(Math.max(8, y), maxY);
  dragState.y = clamped;
  const ratio = dragState.naturalHeight
    ? dragState.naturalHeight / (editorCanvas.scrollHeight || 1)
    : 1;
  const approxPx = Math.round(clamped * ratio);
  dragLine.style.top = `${clamped}px`;
  dragHandle.textContent = `${approxPx}px`;
}

function closeEditor() {
  editorModal.classList.remove("open");
  editing = null;
}
