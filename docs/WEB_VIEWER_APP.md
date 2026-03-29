# Web Segment Viewer (Vite + React) — Implementation & Specification

## Purpose

Browser-based **viewer** for **already-generated** segment images (for example, output from the Electron processor or `process_webtoon.mjs`). It does **not** stitch or split images; it loads files from a user-selected folder, lays them out in a **horizontal scroll** region with **column packing** under a fixed viewport height.

## Tech Stack

| Layer | Technology |
|--------|------------|
| Build | Vite 5 |
| UI | React 18 |
| Language | TypeScript |
| Styling | Global CSS (`src/styles.css`) |

## Repository Layout

```
frontend/
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.node.json
  index.html
  src/
    main.tsx       # React root
    App.tsx        # Folder picker, layout, packing algorithm
    styles.css     # Page, board, column, segment styles
```

## How to Run

```bash
cd frontend
pnpm install
pnpm dev
```

Production build:

```bash
pnpm build
pnpm preview
```

Default dev server port: **5173** (see `vite.config.ts`).

---

## Functional Specification

### Input

- User clicks **“Select segments folder”**.
- A **hidden** `<input type="file" webkitdirectory multiple accept="image/*">` is triggered programmatically via a ref + button `click()` (required for reliable UX across browsers).
- Only files whose MIME type starts with **`image/`** are kept (extension-only types may still vary by browser/OS).

### Ordering

- After filtering, files are sorted by **`File.name`** using **numeric-aware** `localeCompare` (same idea as the Node/Electron pipeline).
- The packing step **re-sorts** the same way so column order stays deterministic even if React state order differed.

### Layout Rules (Product Requirements)

1. **Horizontal scrolling**: Segments appear in a **single primary row of columns** inside `.board`; overflow is **`overflow-x: auto`**, **`overflow-y: hidden`** on the board so the main reading axis is horizontal, not vertical body scroll.
2. **Viewport height**: The scrollable **`.board`** uses **`flex: 1`** inside `.page` which is **`height: 100vh`**, so the board fills the viewport below the control strip (minus padding/gap).
3. **Per-segment size**:
   - **Maximum displayed width**: **360 px** (`MAX_WIDTH`).
   - **Aspect ratio**: Preserved; scale factor is applied uniformly to width and height.
   - **Height constraint**: Each segment is scaled so its **display height does not exceed** the measured **board inner height** (`boardHeight` from `ResizeObserver` on `.board` and window `resize`).
   - Effective scale:  
     `scale = min(1, MAX_WIDTH / naturalWidth, boardHeight / naturalHeight)`  
     then `scaledWidth = width * scale`, `scaledHeight = height * scale`.
4. **Columns**:
   - Segments are processed **in sorted order**.
   - A **column** is a vertical stack of consecutive segments.
   - The algorithm **appends** to the **current column** until adding the **next** segment would make **sum(scaled heights) > boardHeight**, then it **starts a new column**.
   - Therefore: **all segments stacked in one column are contiguous in chapter order** (sequential segments only).

### Empty State

- If no images loaded or `boardHeight` is non-positive, packing returns no columns and the UI shows **“No segments loaded.”**

### Object URLs & Cleanup

- Each chosen file gets `URL.createObjectURL`; URLs are tracked in state.
- On re-load, previous URLs are **revoked** before replacing.
- On component unmount, remaining URLs are **revoked** in a `useEffect` cleanup.

---

## Implementation Details (`App.tsx`)

### State & Refs

- `segments: SegmentMeta[]` — `name`, `url`, `width`, `height` (natural dimensions after decode).
- `boardHeight` — updated from `.board` client height.
- `fileInputRef` — triggers folder picker.
- `usedUrls` — for revocation lifecycle.

### Measurement

- `useLayoutEffect` installs `ResizeObserver` on the board element and listens to `window` resize to keep `boardHeight` accurate when the viewport or layout changes.

### `packSegments(segments, heightLimit)`

- Returns `PackedItem[][]`: each inner array is one column; each item includes `scaledWidth` / `scaledHeight`.
- **Greedy column fill** in sorted order (see Layout Rules).

### Styling Highlights (`styles.css`)

- `.page`: `height: 100vh`, column flex, small padding.
- `.board`: `flex: 1`, horizontal scroll, flex row of `.column` children.
- `.column`: `flex-direction: column`, centered items, gap between segments.
- `.segment`: card chrome around each image.

---

## Limitations & Browser Notes

- **Folder selection** relies on `webkitdirectory`; supported in Chromium-based browsers and Safari; behavior may vary if the browser blocks programmatic clicks (user gesture is satisfied via button click).
- Very large images consume memory in the browser; the Electron/Sharp path is better for huge chapters.
- The viewer does not persist last folder or support drag-and-drop of folders (only directory input).

---

## Relationship to the Electron App

| Concern | Electron app | Web viewer |
|---------|----------------|------------|
| Stitch + gap split | Yes (Sharp) | No |
| Manual split >2000px | Yes | No |
| View segments | Yes (`file://`) | Yes (`blob:` URLs) |
| Column packing / 360px max width | No | Yes |

Typical workflow: generate segments with **Electron** (or CLI script), then open **frontend** dev server and load the **output folder** for reading layout.
