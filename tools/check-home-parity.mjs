#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const files = {
  designApp: path.join(root, "design/src/app/App.tsx"),
  homeWxml: path.join(root, "pages/home/index.wxml"),
  homeWxss: path.join(root, "pages/home/index.wxss"),
  homeJs: path.join(root, "pages/home/index.js"),
  mapping: path.join(root, "docs/ui-parity/home.mapping.json"),
  tokens: path.join(root, "docs/ui-parity/home.tokens.json")
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
  const homeWxml = readFile(files.homeWxml);
  const homeWxss = readFile(files.homeWxss);
  const homeJs = readFile(files.homeJs);

  const checks = [
    {
      id: "config.mapping-has-items",
      check: () => Array.isArray(mapping.mappings) && mapping.mappings.length >= 6
    },
    {
      id: "config.tokens-has-selectors",
      check: () => !!tokens.selectorSnapshot && Object.keys(tokens.selectorSnapshot).length >= 4
    },
    {
      id: "logic.home-allDone",
      check: () => /allDone:\s*dueList\.length\s*===\s*0/.test(homeJs)
    },
    {
      id: "logic.home-dueList",
      check: () => /const dueList = \[\]/.test(homeJs) && /scientificTasks/.test(homeJs) && /playfulTasks/.test(homeJs)
    },
    {
      id: "structure.today-card",
      check: () => includesEvery(homeWxml, [
        "TODAY · 今日偈语",
        "today-card",
        "今日修持"
      ])
    },
    {
      id: "structure.review-loop",
      check: () => includesEvery(homeWxml, [
        "wx:for=\"{{dueList}}\"",
        "class=\"review-card card\""
      ])
    },
    {
      id: "design-source.today-screen",
      check: () => designApp.includes("function TodayScreen") && designApp.includes("TODAY · 今日偈语")
    }
  ];

  const selectorChecks = Object.entries(tokens.selectorSnapshot || {}).map(([selector, declarations]) => ({
    id: `token.${selector}`,
    check: () => homeWxss.includes(`${selector} {`) && includesEvery(homeWxss, declarations)
  }));

  const results = [...checks, ...selectorChecks].map((item) => ({
    id: item.id,
    pass: !!item.check()
  }));

  const failed = results.filter((item) => !item.pass);
  const passed = results.length - failed.length;

  console.log("Home parity baseline report");
  console.log(`Root: ${root}`);
  console.log(`Passed: ${passed}/${results.length}`);
  results.forEach((item) => {
    console.log(`${item.pass ? "[PASS]" : "[FAIL]"} ${item.id}`);
  });

  if (failed.length > 0) {
    console.log("\nNext actions:");
    console.log("1. 先修复 FAIL 项对应代码。\n2. 再运行 node tools/check-home-parity.mjs。\n3. 最后进行截图对比。\n");
    process.exitCode = 1;
  }
}

runChecks();
