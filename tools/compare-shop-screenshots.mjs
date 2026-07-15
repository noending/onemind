#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const defaults = {
  design: path.join(root, "docs/ui-parity/screenshots/design/shop.png"),
  mini: path.join(root, "docs/ui-parity/screenshots/miniapp/shop.png"),
  diff: path.join(root, "docs/ui-parity/screenshots/diff/shop-diff.png"),
  threshold: 0.1,
  maxDiffRatio: 0.01
};

function parseArgs(argv) {
  const args = {
    design: defaults.design,
    mini: defaults.mini,
    diff: defaults.diff,
    threshold: defaults.threshold,
    maxDiffRatio: defaults.maxDiffRatio,
    autoResizeMini: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) continue;
    if (key === "--design") args.design = value;
    if (key === "--mini") args.mini = value;
    if (key === "--diff") args.diff = value;
    if (key === "--threshold") args.threshold = Number(value);
    if (key === "--max-diff-ratio") args.maxDiffRatio = Number(value);
    if (key === "--auto-resize-mini") args.autoResizeMini = value !== "false";
  }

  return args;
}

function ensureFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing screenshot: ${file}`);
  }
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function resizeWithSips(inputFile, outputFile, height, width) {
  const result = spawnSync("sips", ["-z", String(height), String(width), inputFile, "--out", outputFile], {
    encoding: "utf8"
  });

  if ((result.status ?? 1) !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const details = stderr || stdout || "unknown sips error";
    throw new Error(`Auto resize failed: ${details}`);
  }
}

async function loadImageDeps() {
  try {
    const [{ PNG }, { default: pixelmatch }] = await Promise.all([
      import("pngjs"),
      import("pixelmatch")
    ]);
    return { PNG, pixelmatch };
  } catch (error) {
    const message = [
      "Missing dependencies for screenshot diff.",
      "Run:",
      "  cd tools && npm install",
      `Original error: ${error.message}`
    ].join("\n");
    throw new Error(message);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { PNG, pixelmatch } = await loadImageDeps();

  ensureFile(args.design);
  ensureFile(args.mini);
  ensureDir(args.diff);

  const img1 = PNG.sync.read(fs.readFileSync(args.design));
  let miniPathInUse = args.mini;
  let img2 = PNG.sync.read(fs.readFileSync(miniPathInUse));

  if (img1.width !== img2.width || img1.height !== img2.height) {
    if (!args.autoResizeMini) {
      throw new Error(
        `Image size mismatch: design=${img1.width}x${img1.height}, mini=${img2.width}x${img2.height}. ` +
        "Use the same export resolution (recommended: 390x844), or pass --auto-resize-mini true."
      );
    }

    const resizedMiniPath = path.join(path.dirname(args.mini), "shop.auto-resized.png");
    resizeWithSips(miniPathInUse, resizedMiniPath, img1.height, img1.width);
    miniPathInUse = resizedMiniPath;
    img2 = PNG.sync.read(fs.readFileSync(miniPathInUse));

    if (img1.width !== img2.width || img1.height !== img2.height) {
      throw new Error(
        `Auto resize still mismatched: design=${img1.width}x${img1.height}, mini=${img2.width}x${img2.height}.`
      );
    }

    console.log(
      `Auto resized mini screenshot to ${img1.width}x${img1.height}: ${miniPathInUse}`
    );
  }

  const diff = new PNG({ width: img1.width, height: img1.height });
  const mismatchPixels = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, {
    threshold: args.threshold,
    includeAA: false,
    alpha: 0.1,
    diffMask: false
  });

  fs.writeFileSync(args.diff, PNG.sync.write(diff));

  const totalPixels = img1.width * img1.height;
  const diffRatio = mismatchPixels / totalPixels;

  console.log("Shop screenshot diff report");
  console.log(`Design: ${args.design}`);
  console.log(`Mini:   ${miniPathInUse}`);
  console.log(`Diff:   ${args.diff}`);
  console.log(`Size:   ${img1.width}x${img1.height}`);
  console.log(`Mismatch pixels: ${mismatchPixels}`);
  console.log(`Diff ratio: ${(diffRatio * 100).toFixed(3)}%`);
  console.log(`Threshold: ${args.threshold}`);
  console.log(`Max allowed ratio: ${(args.maxDiffRatio * 100).toFixed(3)}%`);

  if (diffRatio > args.maxDiffRatio) {
    console.log("Result: FAIL (diff ratio exceeds max)");
    process.exitCode = 1;
  } else {
    console.log("Result: PASS");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
