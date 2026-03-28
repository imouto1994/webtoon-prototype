// frontend/src/App.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type SegmentMeta = {
  name: string;
  url: string;
  width: number;
  height: number;
};

type PackedItem = SegmentMeta & {
  scaledWidth: number;
  scaledHeight: number;
};

const MAX_WIDTH = 360;

export default function App() {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [segments, setSegments] = useState<SegmentMeta[]>([]);
  const [status, setStatus] = useState<string>(
    "Pick your output segments folder.",
  );
  const [boardHeight, setBoardHeight] = useState<number>(window.innerHeight);
  const [usedUrls, setUsedUrls] = useState<string[]>([]);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setBoardHeight(el.clientHeight || window.innerHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      usedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [usedUrls]);

  const columns = useMemo(
    () => packSegments(segments, boardHeight),
    [segments, boardHeight],
  );

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setStatus("Loading segments…");
    const imgs = Array.from(files)
      .filter((f: File) => f.type.startsWith("image/"))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
    const metas = await Promise.all(imgs.map((f) => readImageMeta(f)));
    const urls = metas.map((m) => m.url);
    setUsedUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return urls;
    });
    setSegments(metas);
    setStatus(`Loaded ${metas.length} segments.`);
  }

  return (
    <div className="page">
      <div className="controls">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          multiple
          // @ts-expect-error webkitdirectory is widely supported but not typed
          webkitdirectory="true"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Select segments folder
        </button>
        <span className="status">{status}</span>
      </div>

      <div className="board" ref={boardRef}>
        {columns.length === 0 ? (
          <div className="empty">No segments loaded.</div>
        ) : (
          columns.map((col, i) => (
            <div className="column" key={`col-${i}`}>
              {col.map((item) => (
                <div
                  className="segment"
                  key={item.url}
                  style={{ width: `${item.scaledWidth}px` }}
                  title={`${item.name} • ${item.width}×${item.height}`}
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    width={item.scaledWidth}
                    height={item.scaledHeight}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

async function readImageMeta(file: File): Promise<SegmentMeta> {
  const url = URL.createObjectURL(file);
  const dims = await loadDimensions(url);
  return {
    name: file.name,
    url,
    width: dims.width,
    height: dims.height,
  };
}

function loadDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function packSegments(
  segments: SegmentMeta[],
  heightLimit: number,
): PackedItem[][] {
  if (!heightLimit || heightLimit <= 0) return [];
  const cols: PackedItem[][] = [];
  const ordered = [...segments].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  let currentCol: PackedItem[] = [];
  let currentHeight = 0;

  for (const seg of ordered) {
    const width = Math.max(1, seg.width);
    const height = Math.max(1, seg.height);
    const scale = Math.min(1, MAX_WIDTH / width, heightLimit / height);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    // If it doesn't fit in the current column, start a new one
    if (currentCol.length && currentHeight + scaledHeight > heightLimit) {
      cols.push(currentCol);
      currentCol = [];
      currentHeight = 0;
    }

    currentCol.push({ ...seg, scaledWidth, scaledHeight });
    currentHeight += scaledHeight;
  }

  if (currentCol.length) {
    cols.push(currentCol);
  }

  return cols;
}
