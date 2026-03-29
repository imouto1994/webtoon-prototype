# Electron Webtoon Processor — Implementation & Specification

## Purpose

Desktop application that stitches ordered chapter images into one vertical strip, removes large uniform vertical gaps (blank / single-color bands), exports `PNG` segments to a folder, and optionally splits oversized segments manually. The pipeline reuses **Sharp** (same family of algorithms as the standalone Node script in the repo root).

## Tech Stack

| Layer | Technology |
|--------|------------|
| Runtime | Electron (~v30) |
| Main / preload | ESM (`.mjs`), Node 18+ APIs |
| Image I/O | [Sharp](https://sharp.pixelplumbing.com/) |
| UI | Static HTML + vanilla JS renderer |

## Repository Layout

```
electron/
  main.mjs       # App lifecycle, BrowserWindow, IPC handlers
  preload.mjs    # contextBridge API exposed to renderer
  processor.mjs  # Stitching, gap detection, segment I/O, manual split
  index.html     # Shell UI (controls, list, grid, edit modal)
  renderer.mjs   # Folder pickers, process flow, previews, split editor UI
```

Root `package.json` entry: `"main": "electron/main.mjs"`, script `"electron": "electron ."`.

## How to Run

From the repository root (after `pnpm install`):

```bash
pnpm electron
```

Dependencies: `sharp` (production), `electron` (dev).

---

## Functional Specification

### Input

- **Input folder**: User-selected directory containing image files.
- **Accepted extensions** (current implementation): `.png`, `.jpg`, `.jpeg`, `.webp` (case-insensitive).
- **Order**: Files are sorted by **basename** using a **numeric-aware** `localeCompare` so names like `2.png` sort before `10.png`.

### Output

- **Output folder**: User may choose explicitly; if omitted, defaults to `<inputDir>/images_output`.
- **Pre-run behavior**: The output directory is **deleted and recreated** on each full “Process” run (existing segments in that folder are removed).
- **Segment files**: `segment_000.png`, `segment_001.png`, … zero-padded to three digits.

### Stitching

1. For each source file, Sharp reads metadata. **EXIF orientation** is accounted for when computing logical width/height (orientations 5–8 swap dimensions).
2. Each image is **auto-rotated** (`.rotate()`) then **resized** to a common target width: the **maximum** width among all oriented inputs. Height scales proportionally.
3. Frames are **composited top-to-bottom** on a transparent RGBA canvas of that width and total height.

### Gap Removal (Automatic Splitting)

1. The stitched image is rendered to **PNG buffer**, then re-opened as a Sharp pipeline to guarantee a concrete pixel grid before analysis.
2. Raw **RGBA** pixels are scanned row-by-row.
3. A row is **uniform** if every pixel in that row matches the first pixel within **`COLOR_TOLERANCE`** per channel (R, G, B, A). Current constants in `processor.mjs`:
   - `COLOR_TOLERANCE = 10`
   - `MIN_GAP_HEIGHT = 100` — contiguous runs of uniform rows **at least this tall** are treated as removable gaps; content between those runs becomes segments.

> **Note:** `MIN_GAP_HEIGHT` in this file may differ from `process_webtoon.mjs` in the repo root if you maintain both; align them if you want identical CLI vs Electron behavior.

### Manual Segment Split (Editor)

- **Trigger**: Segments with **height greater than 2000 px** show an **Edit** control in the grid.
- **UX**: Modal with the full segment image in a scrollable area; a **horizontal (green) drag line** sets the split **from the top** in **display space**, converted to **pixel coordinates** using `naturalHeight / scrollHeight`.
- **Save**: IPC calls `splitSegment` with `{ filePath, breakpoint }` (integer px from top, clamped `1 … height-1`).
- **Disk effect**:
  - Two new files: `<basename>_<timestamp>_a<ext>`, `<basename>_<timestamp>_b<ext>` in the **same directory** as the original.
  - The **original file is deleted** after successful split.
- **UI refresh**: The in-memory segment list removes the old path and appends metadata for the two new files; the grid re-sorts by path (numeric-aware).

### Preview & Listing

- **List**: Shows each absolute path and decoded height (px).
- **Grid**: Lazy-loaded `file://` thumbnails, index + height, “Open” link, optional “Edit”.
- After splits, filenames may no longer follow strict `segment_XXX.png` ordering; sorting is by full path string (numeric-aware basename compare).

---

## Architecture

### Main Process (`main.mjs`)

- **`pick-input`**: `dialog.showOpenDialog` — open directory only.
- **`pick-output`**: open directory, allow create.
- **`process-webtoon`**: `{ inputDir, outputDir? }` → runs `processWebtoon`, returns `{ outputDir, files }` where `files` is an array of absolute paths to written segments.
- **`split-segment`**: `{ filePath, breakpoint }` → `splitSegment`, returns `{ files: [pathA, pathB] }`.
- **Window**: Default ~1000×800; **preload** `electron/preload.mjs`; **contextIsolation: true**, **nodeIntegration: false**, **sandbox: false** (preload must run so `window.webtoonApi` exists).

### Preload (`preload.mjs`)

Exposes `webtoonApi` on `window`:

| Method | IPC channel |
|--------|----------------|
| `pickInput()` | `pick-input` |
| `pickOutput()` | `pick-output` |
| `process(payload)` | `process-webtoon` |
| `splitSegment(payload)` | `split-segment` |

### Processor (`processor.mjs`)

Pure Node/Sharp module; no Electron imports. Exports:

- `processWebtoon({ inputDir, outputDir })` → `string[]` paths
- `splitSegment({ filePath, breakpointPx })` → `[string, string]`

### Renderer (`renderer.mjs` + `index.html`)

- Vanilla DOM; no bundler.
- Guards if `window.webtoonApi` is missing (user is told to restart).
- Constants: `MAX_SEGMENT_HEIGHT = 2000` for showing the Edit affordance only (actual split position is user-chosen).

---

## Error Handling & Edge Cases

- Empty input folder → throws `No images found in …`.
- Missing dimensions on a file → throws from metadata check.
- Invalid split breakpoint (≤0 or ≥ height) → throws from `splitSegment`.
- First-time composite/extract issues were historically mitigated by materializing stitched image to buffer before raw read (same pattern as root script).

---

## Relationship to Other Project Artifacts

- **`process_webtoon.mjs`** (repo root): Standalone CLI-style script with the same conceptual pipeline; constants and supported extensions may differ slightly from `electron/processor.mjs`.
- **`web/`** folder (if present): Earlier browser-only experiment; **not** this Electron app.

---

## Configuration Knobs

Editable in `electron/processor.mjs`:

- `MIN_GAP_HEIGHT` — minimum height (px) of a uniform “gap” run to remove.
- `COLOR_TOLERANCE` — per-channel tolerance for “single-color” row detection.

Editable in `electron/renderer.mjs`:

- `MAX_SEGMENT_HEIGHT` — threshold above which the Edit button appears (does not auto-split).

---

## Security Notes

- Preload exposes only whitelisted IPC methods.
- Renderer loads local `file://` images for previews; acceptable for a local tool; do not expose this pattern to untrusted remote content without hardening.
