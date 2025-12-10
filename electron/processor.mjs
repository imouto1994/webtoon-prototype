// electron/processor.mjs
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MIN_GAP_HEIGHT = 30;
const COLOR_TOLERANCE = 10;

/**
 * Stitches input images vertically and splits them into segments, writing to outputDir.
 */
export async function processWebtoon({ inputDir, outputDir }) {
  const imagePaths = await readImagePaths(inputDir);
  if (!imagePaths.length) {
    throw new Error(`No images found in ${inputDir}`);
  }

  await resetOutputDir(outputDir);

  const stitched = await createStitchedImage(imagePaths);
  const stitchedBuffer = await stitched.png().toBuffer();
  const stitchedSharp = sharp(stitchedBuffer);

  const { data, info } = await stitchedSharp
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const uniformRuns = findUniformRowRuns(
    data,
    info.width,
    info.height,
    COLOR_TOLERANCE
  );
  const slices = buildSlicesFromRuns(uniformRuns, info.height, MIN_GAP_HEIGHT);

  const written = await writeSlices(
    stitchedSharp,
    slices,
    outputDir,
    info.width
  );
  return written;
}

async function readImagePaths(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) =>
      path.basename(a).localeCompare(path.basename(b), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
}

async function resetOutputDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function createStitchedImage(imagePaths) {
  const metadata = await Promise.all(
    imagePaths.map(async (file) => {
      const meta = await sharp(file).metadata();
      if (!meta.width || !meta.height) {
        throw new Error(`Missing dimensions for ${file}`);
      }
      const orientation = meta.orientation ?? 1;
      const orientedWidth =
        orientation >= 5 && orientation <= 8 ? meta.height : meta.width;
      const orientedHeight =
        orientation >= 5 && orientation <= 8 ? meta.width : meta.height;
      return { file, width: orientedWidth, height: orientedHeight };
    })
  );

  const targetWidth = Math.max(...metadata.map((meta) => meta.width));
  const composites = [];
  let totalHeight = 0;

  for (const meta of metadata) {
    const { data, info } = await sharp(meta.file)
      .rotate()
      .resize({ width: targetWidth })
      .toBuffer({ resolveWithObject: true });

    composites.push({ input: data, top: totalHeight, left: 0 });
    totalHeight += info.height;
  }

  return sharp({
    create: {
      width: targetWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites);
}

function findUniformRowRuns(data, width, height, tolerance) {
  const runs = [];
  let runStart = -1;

  for (let y = 0; y < height; y += 1) {
    const uniform = isUniformRow(data, width, y, tolerance);
    if (uniform && runStart === -1) {
      runStart = y;
    }
    if (!uniform && runStart !== -1) {
      runs.push({ start: runStart, end: y });
      runStart = -1;
    }
  }

  if (runStart !== -1) {
    runs.push({ start: runStart, end: height });
  }

  return runs;
}

function buildSlicesFromRuns(runs, imageHeight, minGapHeight) {
  const slices = [];
  let cursor = 0;

  for (const run of runs) {
    const runHeight = run.end - run.start;
    if (runHeight < minGapHeight) {
      continue;
    }

    if (run.start > cursor) {
      slices.push({ top: cursor, height: run.start - cursor });
    }
    cursor = run.end;
  }

  if (cursor < imageHeight) {
    slices.push({ top: cursor, height: imageHeight - cursor });
  }

  return slices;
}

async function writeSlices(stitched, slices, dir, width) {
  const files = [];
  let index = 0;
  for (const slice of slices) {
    if (slice.height <= 0) {
      continue;
    }
    const filename = `segment_${String(index).padStart(3, "0")}.png`;
    const outPath = path.join(dir, filename);
    await stitched
      .clone()
      .extract({ left: 0, top: slice.top, width, height: slice.height })
      .toFile(outPath);
    files.push(outPath);
    index += 1;
  }
  return files;
}

function isUniformRow(data, width, rowIndex, tolerance) {
  const start = rowIndex * width * 4;
  const end = start + width * 4;
  const r = data[start];
  const g = data[start + 1];
  const b = data[start + 2];
  const a = data[start + 3];

  for (let i = start + 4; i < end; i += 4) {
    if (
      Math.abs(data[i] - r) > tolerance ||
      Math.abs(data[i + 1] - g) > tolerance ||
      Math.abs(data[i + 2] - b) > tolerance ||
      Math.abs(data[i + 3] - a) > tolerance
    ) {
      return false;
    }
  }

  return true;
}
