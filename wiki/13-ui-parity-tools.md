# 13 · UI 一致性工具链

> 目标：让 MiniApp 实现与 Figma 导出的 Web 参考实现保持像素级一致，避免后续迭代把页面再次拉偏。

## 1. 目录布局

- 像素对齐基线：[docs/ui-parity/README.md](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/README.md)。
- 每页两个 JSON：
  - `docs/ui-parity/<page>.mapping.json`：Web 实现 → MiniApp 实现的结构映射。
  - `docs/ui-parity/<page>.tokens.json`：颜色 / 字号 / 圆角 / 间距的视觉 token 快照（含 px ↔ rpx 换算）。
- 截图目录：
  - `docs/ui-parity/screenshots/design/<page>.png`。
  - `docs/ui-parity/screenshots/miniapp/<page>.png`（及 `.auto-resized.png` / `.resized.png`）。
  - `docs/ui-parity/screenshots/diff/<page>-diff-*.png`。

## 2. 覆盖页面

| 页面 | 映射 | Tokens | 截图 |
| --- | --- | --- | --- |
| home | [home.mapping.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/home.mapping.json) | [home.tokens.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/home.tokens.json) | design/home.png、miniapp/home.png |
| library | [library.mapping.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/library.mapping.json) | [library.tokens.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/library.tokens.json) | design/library.png、miniapp/library.png |
| shop | [shop.mapping.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/shop.mapping.json) | [shop.tokens.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/shop.tokens.json) | design/shop.png、miniapp/shop.png、diff/shop-diff-*.png |
| profile | [profile.mapping.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/profile.mapping.json) | [profile.tokens.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/profile.tokens.json) | design/profile.png、miniapp/profile.png |
| practice | [practice.mapping.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/practice.mapping.json) | [practice.tokens.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/practice.tokens.json) | design/practice.png、miniapp/practice.png |
| recitation | [recitation.mapping.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/recitation.mapping.json) | [recitation.tokens.json](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/recitation.tokens.json) | design/recitation.png、miniapp/recitation.png |

## 3. 工具脚本（tools/）

- [tools/package.json](file:///Users/liam/Documents/workspace/oneMind/tools/package.json)：
  - 依赖 `pixelmatch` ^7.1.0、`pngjs` ^7.0.0。
  - 命令：
    - `check:ui`：串行执行 `check-shop-parity` / `check-home-parity` / `check-library-parity`。
    - `check:home` / `check:library` / `check:shop`：单页面 token 校验。
    - `compare:ui` / `compare:library` / `compare:shop`：使用 `pixelmatch` 输出 diff 图。
- 典型脚本（如 [tools/check-shop-parity.mjs](file:///Users/liam/Documents/workspace/oneMind/tools/check-shop-parity.mjs)）：
  - 加载 `shop.mapping.json` 与 `shop.tokens.json`。
  - 比对设计稿与小程序截图的尺寸 / 比例 / 关键 token（颜色、字号、圆角）。
  - 命中偏差时输出差异报告与 diff PNG。
- 典型截图比对（如 [tools/compare-shop-screenshots.mjs](file:///Users/liam/Documents/workspace/oneMind/tools/compare-shop-screenshots.mjs)）：
  - 读取 `screenshots/design/<page>.png` 与 `screenshots/miniapp/<page>.png`。
  - 缩放到统一尺寸。
  - 调用 `pixelmatch` 逐像素比对，输出 `screenshots/diff/<page>-diff-*.png`。

## 4. 使用流程

1. 在 `design/` 跑 Vite Dev Server 截取 design 稿：
   ```bash
   cd design
   pnpm install
   pnpm dev
   # 截屏后存到 docs/ui-parity/screenshots/design/<page>.png
   ```
2. 在 WeChat 模拟器中跑 MiniApp，截屏保存到 `docs/ui-parity/screenshots/miniapp/<page>.png`。
3. 跑工具：
   ```bash
   cd tools
   pnpm install
   pnpm compare:shop
   pnpm check:shop
   ```
4. 查看 `docs/ui-parity/screenshots/diff/<page>-diff-*.png`，定位差异。
5. 在 `docs/ui-parity/<page>.tokens.json` 中更新新增 / 修订的视觉 token。
6. 在 `<page>.mapping.json` 中维护 Web → MiniApp 的结构映射（命名差异、容器差异、状态差异等）。

## 5. 维护约定

- 每次大改 UI 后，必须跑一遍 `compare:*` 与 `check:*`。
- `*.tokens.json` 改动需与 `app.wxss` 同步。
- 视觉差异若属预期（如小程序安全区更小），在 `docs/ui-parity/RESULTS.md` 中记录决议。
- 新增页面时，按已有 6 页面的 schema 复制 `<page>.mapping.json` 与 `<page>.tokens.json`。

## 6. 结果归档

- [docs/ui-parity/RESULTS.md](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/RESULTS.md)：像素对齐结果。
- [docs/ui-parity/ROADMAP.md](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/ROADMAP.md)：像素对齐路线图。
