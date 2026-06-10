#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scripts = [
  path.join(__dirname, "check-shop-parity.mjs"),
  path.join(__dirname, "check-home-parity.mjs"),
  path.join(__dirname, "check-library-parity.mjs"),
  path.join(__dirname, "check-profile-parity.mjs"),
  path.join(__dirname, "check-practice-parity.mjs"),
  path.join(__dirname, "check-recitation-parity.mjs")
];

let hasFailure = false;
for (const script of scripts) {
  const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
  if ((result.status ?? 1) !== 0) {
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exitCode = 1;
}
