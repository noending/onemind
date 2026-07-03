#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const files = {
  designApp: path.join(root, "design/src/app/App.tsx"),
  shopWxml: path.join(root, "pages/shop/index.wxml"),
  shopWxss: path.join(root, "pages/shop/index.wxss"),
  shopJs: path.join(root, "pages/shop/index.js"),
  mapping: path.join(root, "docs/ui-parity/shop.mapping.json"),
  tokens: path.join(root, "docs/ui-parity/shop.tokens.json")
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
  const shopWxml = readFile(files.shopWxml);
  const shopWxss = readFile(files.shopWxss);
  const shopJs = readFile(files.shopJs);

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
      id: "logic.featured-filter",
      check: () => /item\.category === active && !item\.isFeatured/.test(shopJs)
    },
    {
      id: "logic.featured-state",
      check: () => /featuredProduct\s*=\s*all\.find\(\(item\) => item\.isFeatured\)/.test(shopJs)
    },
    {
      id: "logic.shop-persistence",
      check: () => includesEvery(shopJs, [
        "getShopState",
        "toggleFavoriteProduct",
        "recordRecentViewProduct",
        "addProductToCart"
      ])
    },
    {
      id: "structure.featured-card",
      check: () => includesEvery(shopWxml, [
        "wx:if=\"{{featuredProduct}}\"",
        "{{featuredProduct.title}}",
        "{{featuredProduct.subtitle}}"
      ])
    },
    {
      id: "structure.product-loop",
      check: () => includesEvery(shopWxml, [
        "wx:for=\"{{visibleProducts}}\"",
        "class=\"product-card card\""
      ])
    },
    {
      id: "structure.preference-records",
      check: () => includesEvery(shopWxml, [
        "recentViewProducts.length",
        "preferencePanel.records.length",
        "class=\"record-card card\""
      ])
    },
    {
      id: "design-source.shop-screen",
      check: () => designApp.includes("function ShopScreen") && designApp.includes("featuredProduct")
    }
  ];

  const selectorChecks = Object.entries(tokens.selectorSnapshot || {}).map(([selector, declarations]) => ({
    id: `token.${selector}`,
    check: () => shopWxss.includes(`${selector} {`) && includesEvery(shopWxss, declarations)
  }));

  const results = [...checks, ...selectorChecks].map((item) => ({
    id: item.id,
    pass: !!item.check()
  }));

  const failed = results.filter((item) => !item.pass);
  const passed = results.length - failed.length;

  console.log("Shop parity baseline report");
  console.log(`Root: ${root}`);
  console.log(`Passed: ${passed}/${results.length}`);
  results.forEach((item) => {
    console.log(`${item.pass ? "[PASS]" : "[FAIL]"} ${item.id}`);
  });

  if (failed.length > 0) {
    console.log("\nNext actions:");
    console.log("1. 先修复 FAIL 项对应代码。\n2. 再运行 node tools/check-shop-parity.mjs。\n3. 最后进行截图对比。\n");
    process.exitCode = 1;
  }
}

runChecks();
