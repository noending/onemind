#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tasks = [
  {
    name: "shop",
    script: path.join(__dirname, "compare-shop-screenshots.mjs"),
    args: ["--auto-resize-mini", "true", "--diff", path.join(__dirname, "../docs/ui-parity/screenshots/diff/shop-diff-auto.png")]
  },
  {
    name: "library",
    script: path.join(__dirname, "compare-library-screenshots.mjs"),
    args: ["--auto-resize-mini", "true", "--diff", path.join(__dirname, "../docs/ui-parity/screenshots/diff/library-diff-auto.png")]
  }
];

let hasFailure = false;

for (const task of tasks) {
  console.log(`\n=== Compare ${task.name} ===`);
  const result = spawnSync(process.execPath, [task.script, ...task.args], { encoding: "utf8" });

  const output = [result.stdout || "", result.stderr || ""].join("").trim();
  if (output) console.log(output);

  if ((result.status ?? 1) !== 0) {
    hasFailure = true;
  }
}

if (hasFailure) {
  console.log("\nOne or more comparisons failed. Check missing screenshots or high diff ratio.");
  process.exitCode = 1;
} else {
  console.log("\nAll screenshot comparisons passed.");
}
