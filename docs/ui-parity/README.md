# UI 像素对齐基线

本目录用于维护页面级可度量对齐基线，避免后续迭代把页面再次拉偏。

## 当前覆盖

- `shop`：`shop.mapping.json` + `shop.tokens.json`
- `home`：`home.mapping.json` + `home.tokens.json`
- `library`：`library.mapping.json` + `library.tokens.json`
- `profile`：`profile.mapping.json` + `profile.tokens.json`
- `practice`：`practice.mapping.json` + `practice.tokens.json`
- `recitation`：`recitation.mapping.json` + `recitation.tokens.json`

## 文件说明

- `*.mapping.json`：Web 参考实现到 MiniApp 实现的结构映射。
- `*.tokens.json`：颜色、字号、圆角、间距等视觉 token 快照（包含 px -> rpx 换算口径）。
- `screenshots/`：视觉 diff 输入输出目录。

## 脚本

位于 `tools/`：

- `check-shop-parity.mjs`
- `check-home-parity.mjs`
- `check-library-parity.mjs`
- `check-profile-parity.mjs`
- `check-practice-parity.mjs`
- `check-recitation-parity.mjs`
- `check-ui-parity.mjs`（串行执行上面三项）
- `compare-shop-screenshots.mjs`（真实像素 diff）

## 使用方式

1. 静态基线检查：

```bash
node tools/check-ui-parity.mjs
```

2. 期望输出：`Shop`、`Home`、`Library`、`Profile`、`Practice`、`Recitation` 均全绿。

3. 若出现 FAIL：

- 先修复对应页面代码。
- 如确属设计更新，再同步更新对应 `mapping/tokens`。
- 再次运行检查直到恢复全绿。

## 截图 diff（Shop）

1. 依赖安装（一次性）：

```bash
cd tools && npm install
```

2. 放置截图：

- 设计参考图：`docs/ui-parity/screenshots/design/shop.png`
- 小程序截图：`docs/ui-parity/screenshots/miniapp/shop.png`

3. 运行像素 diff：

```bash
node tools/compare-shop-screenshots.mjs
```

可选参数：

```bash
node tools/compare-shop-screenshots.mjs \
  --design docs/ui-parity/screenshots/design/shop.png \
  --mini docs/ui-parity/screenshots/miniapp/shop.png \
  --diff docs/ui-parity/screenshots/diff/shop-diff.png \
  --threshold 0.1 \
  --max-diff-ratio 0.01

# 如果截图尺寸不一致（仅作近似比对）：
node tools/compare-shop-screenshots.mjs \
  --auto-resize-mini true \
  --diff docs/ui-parity/screenshots/diff/shop-diff-auto.png
```

输出：

- 差异图：`docs/ui-parity/screenshots/diff/shop-diff.png`
- 命令行统计：`Mismatch pixels` 与 `Diff ratio`

> 建议统一导出尺寸（例如 390x844）后再比对。

首轮结果记录见 `RESULTS.md`。


## 截图 diff（Library）

1. 放置截图：

- 设计参考图：`docs/ui-parity/screenshots/design/library.png`
- 小程序截图：`docs/ui-parity/screenshots/miniapp/library.png`

2. 运行像素 diff：

```bash
node tools/compare-library-screenshots.mjs
```

可选参数（尺寸不一致时）：

```bash
node tools/compare-library-screenshots.mjs \
  --auto-resize-mini true \
  --diff docs/ui-parity/screenshots/diff/library-diff-auto.png
```

## 一键截图 diff（Shop + Library）

```bash
node tools/compare-ui-screenshots.mjs
```
