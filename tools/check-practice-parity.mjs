#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const files = {
  designApp: path.join(root, "design/src/app/App.tsx"),
  practiceWxml: path.join(root, "pages/practice/index.wxml"),
  practiceWxss: path.join(root, "pages/practice/index.wxss"),
  practiceJs: path.join(root, "pages/practice/index.js"),
  mapping: path.join(root, "docs/ui-parity/practice.mapping.json"),
  tokens: path.join(root, "docs/ui-parity/practice.tokens.json")
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
  const practiceWxml = readFile(files.practiceWxml);
  const practiceWxss = readFile(files.practiceWxss);
  const practiceJs = readFile(files.practiceJs);

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
      id: "logic.step-switch",
      check: () => /switchStep\(stepIndex\)/.test(practiceJs) && /TRAINING_STEPS/.test(practiceJs)
    },
    {
      id: "logic.open-fulltext",
      check: () => /openFullText\(\)/.test(practiceJs) && /\/pages\/recitation\/index/.test(practiceJs)
    },
    {
      id: "structure.topbar",
      check: () => includesEvery(practiceWxml, [
        "class=\"topbar\"",
        "fulltext-button",
        "topbar-meta"
      ])
    },
    {
      id: "structure.progress-and-chips",
      check: () => includesEvery(practiceWxml, [
        "train-progress",
        "train-chip-row",
        "train-info-chip"
      ])
    },
    {
      id: "structure.segment-cards",
      check: () => includesEvery(practiceWxml, [
        "segment-head",
        "class=\"segment-card",
        "segment-audio"
      ])
    },
    {
      id: "structure.feedback",
      check: () => includesEvery(practiceWxml, [
        "feedback-grid",
        "feedback-button",
        "next-card"
      ])
    },
    {
      id: "design-source.training-modal",
      check: () => designApp.includes("function TrainingModal") && designApp.includes("查看全文")
    }
  ];

  const selectorChecks = Object.entries(tokens.selectorSnapshot || {}).map(([selector, declarations]) => ({
    id: `token.${selector}`,
    check: () => practiceWxss.includes(`${selector} {`) && includesEvery(practiceWxss, declarations)
  }));

  const results = [...checks, ...selectorChecks].map((item) => ({
    id: item.id,
    pass: !!item.check()
  }));

  const failed = results.filter((item) => !item.pass);
  const passed = results.length - failed.length;

  console.log("Practice parity baseline report");
  console.log(`Root: ${root}`);
  console.log(`Passed: ${passed}/${results.length}`);
  results.forEach((item) => {
    console.log(`${item.pass ? "[PASS]" : "[FAIL]"} ${item.id}`);
  });

  if (failed.length > 0) {
    console.log("\nNext actions:");
    console.log("1. 先修复 FAIL 项对应代码。\n2. 再运行 node tools/check-practice-parity.mjs。\n3. 最后进行截图对比。\n");
    process.exitCode = 1;
  }
}

runChecks();
