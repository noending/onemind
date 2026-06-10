# Shop 首轮像素对比结果（2026-06-01）

## 输入

- 设计图：`docs/ui-parity/screenshots/design/shop.png`
- 小程序图：`docs/ui-parity/screenshots/miniapp/shop.png`

## 处理方式

- 由于两图尺寸不一致（`573x1243` vs `652x1420`），使用 `--auto-resize-mini true` 自动缩放小程序图至设计图尺寸后进行比较。

## 输出

- 差异图：`docs/ui-parity/screenshots/diff/shop-diff-auto.png`
- 自动缩放副本：`docs/ui-parity/screenshots/miniapp/shop.auto-resized.png`
- mismatch pixels：`164093`
- diff ratio：`23.039%`
- 阈值：`threshold=0.1`，`maxDiffRatio=1%`
- 结论：`FAIL`

## 说明

这是一版“尺寸归一化后的近似比较”，用于快速定位明显视觉偏差。
严格像素对齐建议：导出同尺寸、同 DPR、同页面状态的截图，再跑无缩放对比。
