#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const files = {
  designApp: path.join(root, "design/src/app/App.tsx"),
  profileWxml: path.join(root, "pages/profile/index.wxml"),
  profileWxss: path.join(root, "pages/profile/index.wxss"),
  profileJs: path.join(root, "pages/profile/index.js"),
  mapping: path.join(root, "docs/ui-parity/profile.mapping.json"),
  tokens: path.join(root, "docs/ui-parity/profile.tokens.json")
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
  const profileWxml = readFile(files.profileWxml);
  const profileWxss = readFile(files.profileWxss);
  const profileJs = readFile(files.profileJs);

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
      id: "logic.profile-summary-text",
      check: () => /summaryText: this\.buildSummaryText\(progress, plans\)/.test(profileJs)
    },
    {
      id: "logic.profile-curve-refresh",
      check: () => /refreshCurveData\(\)/.test(profileJs) && /measureAndBuildCurveChart/.test(profileJs)
    },
    {
      id: "structure.hero-panel",
      check: () => includesEvery(profileWxml, [
        "hero-panel",
        "auth-card card",
        "今日寄语"
      ])
    },
    {
      id: "structure.summary-strip",
      check: () => includesEvery(profileWxml, [
        "summary-strip",
        "summary-pill review",
        "summary-pill risk",
        "summary-pill done"
      ])
    },
    {
      id: "structure.curve-card",
      check: () => includesEvery(profileWxml, [
        "curve-plan-scroll",
        "curve-card card",
        "curve-empty card"
      ])
    },
    {
      id: "structure.plan-cards",
      check: () => includesEvery(profileWxml, [
        "class=\"mini-plan-card card\"",
        "class=\"mini-progress-track\""
      ])
    },
    {
      id: "design-source.mine-screen",
      check: () => designApp.includes("function MineScreen") && designApp.includes("今日寄语")
    }
  ];

  const selectorChecks = Object.entries(tokens.selectorSnapshot || {}).map(([selector, declarations]) => ({
    id: `token.${selector}`,
    check: () => profileWxss.includes(`${selector} {`) && includesEvery(profileWxss, declarations)
  }));

  const results = [...checks, ...selectorChecks].map((item) => ({
    id: item.id,
    pass: !!item.check()
  }));

  const failed = results.filter((item) => !item.pass);
  const passed = results.length - failed.length;

  console.log("Profile parity baseline report");
  console.log(`Root: ${root}`);
  console.log(`Passed: ${passed}/${results.length}`);
  results.forEach((item) => {
    console.log(`${item.pass ? "[PASS]" : "[FAIL]"} ${item.id}`);
  });

  if (failed.length > 0) {
    console.log("\nNext actions:");
    console.log("1. 先修复 FAIL 项对应代码。\n2. 再运行 node tools/check-profile-parity.mjs。\n3. 最后进行截图对比。\n");
    process.exitCode = 1;
  }
}

runChecks();
