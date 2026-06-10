#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const files = {
  designApp: path.join(root, "design/src/app/App.tsx"),
  wxml: path.join(root, "pages/library/index.wxml"),
  wxss: path.join(root, "pages/library/index.wxss"),
  js: path.join(root, "pages/library/index.js"),
  mapping: path.join(root, "docs/ui-parity/library.mapping.json"),
  tokens: path.join(root, "docs/ui-parity/library.tokens.json")
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
  const wxml = readFile(files.wxml);
  const wxss = readFile(files.wxss);
  const js = readFile(files.js);

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
      id: "logic.filter-switch",
      check: () => /activeFilter/.test(js) && /filterContents\(/.test(js)
    },
    {
      id: "logic.long-series",
      check: () => /buildLongSeries/.test(js) && /lengthTier === "long"/.test(js)
    },
    {
      id: "structure.title-filters",
      check: () => includesEvery(wxml, [
        "选一段内容",
        "class=\"filters\"",
        "wx:for=\"{{filters}}\""
      ])
    },
    {
      id: "structure.series-entry",
      check: () => includesEvery(wxml, [
        "class=\"series-card\"",
        "pickLongSeries",
        "长咒"
      ])
    },
    {
      id: "structure.content-loop",
      check: () => includesEvery(wxml, [
        "wx:for=\"{{filteredContents}}\"",
        "class=\"content-card card\""
      ])
    },
    {
      id: "structure.sheet",
      check: () => includesEvery(wxml, [
        "class=\"sheet-mask\"",
        "class=\"plan-sheet\"",
        "modeCards"
      ])
    },
    {
      id: "design-source.browse-screen",
      check: () => designApp.includes("function BrowseScreen") && designApp.includes("选一段内容")
    }
  ];

  const selectorChecks = Object.entries(tokens.selectorSnapshot || {}).map(([selector, declarations]) => ({
    id: `token.${selector}`,
    check: () => wxss.includes(`${selector} {`) && includesEvery(wxss, declarations)
  }));

  const results = [...checks, ...selectorChecks].map((item) => ({
    id: item.id,
    pass: !!item.check()
  }));

  const failed = results.filter((item) => !item.pass);
  const passed = results.length - failed.length;

  console.log("Library parity baseline report");
  console.log(`Root: ${root}`);
  console.log(`Passed: ${passed}/${results.length}`);
  results.forEach((item) => {
    console.log(`${item.pass ? "[PASS]" : "[FAIL]"} ${item.id}`);
  });

  if (failed.length > 0) {
    console.log("\nNext actions:");
    console.log("1. 先修复 FAIL 项对应代码。\n2. 再运行 node tools/check-library-parity.mjs。\n3. 最后进行截图对比。\n");
    process.exitCode = 1;
  }
}

runChecks();
