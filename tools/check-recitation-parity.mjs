#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const files = {
  designApp: path.join(root, "design/src/app/App.tsx"),
  recitationWxml: path.join(root, "pages/recitation/index.wxml"),
  recitationWxss: path.join(root, "pages/recitation/index.wxss"),
  recitationJs: path.join(root, "pages/recitation/index.js"),
  mapping: path.join(root, "docs/ui-parity/recitation.mapping.json"),
  tokens: path.join(root, "docs/ui-parity/recitation.tokens.json")
};

function readFile(file) {
  return fs.readFileSync(file, "utf8");
}

function loadJson(file) {
  return JSON.parse(readFile(file));
}

function includesEvery(content, values) {
  return values.every((value) => content.includes(value));
}

function runChecks() {
  const mapping = loadJson(files.mapping);
  const tokens = loadJson(files.tokens);
  const designApp = readFile(files.designApp);
  const recitationWxml = readFile(files.recitationWxml);
  const recitationWxss = readFile(files.recitationWxss);
  const recitationJs = readFile(files.recitationJs);

  const checks = [
    {
      id: "config.mapping-has-items",
      check: () => Array.isArray(mapping.mappings) && mapping.mappings.length >= 8
    },
    {
      id: "config.tokens-has-selectors",
      check: () => !!tokens.selectorSnapshot && Object.keys(tokens.selectorSnapshot).length >= 5
    },
    {
      id: "logic.playback-sync",
      check: () => /syncPlaybackView\(\)/.test(recitationJs) && /startPlaybackTicker/.test(recitationJs)
    },
    {
      id: "logic.practice-tip",
      check: () => /buildPracticeTip/.test(recitationJs) && /dailyDurationText/.test(recitationJs)
    },
    {
      id: "structure.topbar-and-hero",
      check: () => includesEvery(recitationWxml, [
        "header-topbar",
        "hero-card",
        "heart-button"
      ])
    },
    {
      id: "structure.stats-and-lines",
      check: () => includesEvery(recitationWxml, [
        "stats-strip",
        "segment-head",
        "class=\"segment-card card"
      ])
    },
    {
      id: "structure.note-card",
      check: () => includesEvery(recitationWxml, [
        "note-card",
        "note-title",
        "practiceTip"
      ])
    },
    {
      id: "structure.player-footer",
      check: () => includesEvery(recitationWxml, [
        "round-inline",
        "time-row",
        "control-row",
        "complete-button"
      ])
    },
    {
      id: "design-source.fulltext-modal",
      check: () => designApp.includes("经文全文") && designApp.includes("修持要点")
    }
  ];

  const selectorChecks = Object.entries(tokens.selectorSnapshot || {}).map(([selector, declarations]) => ({
    id: `token.${selector}`,
    check: () => recitationWxss.includes(`${selector} {`) && includesEvery(recitationWxss, declarations)
  }));

  const results = [...checks, ...selectorChecks].map((item) => ({
    id: item.id,
    pass: !!item.check()
  }));

  const failed = results.filter((item) => !item.pass);
  const passed = results.length - failed.length;

  console.log("Recitation parity baseline report");
  console.log(`Root: ${root}`);
  console.log(`Passed: ${passed}/${results.length}`);
  results.forEach((item) => {
    console.log(`${item.pass ? "[PASS]" : "[FAIL]"} ${item.id}`);
  });

  if (failed.length > 0) {
    console.log("\nNext actions:");
    console.log("1. 先修复 FAIL 项对应代码。\n2. 再运行 node tools/check-recitation-parity.mjs。\n3. 最后进行截图对比。\n");
    process.exitCode = 1;
  }
}

runChecks();
