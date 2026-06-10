# 小程序 UI 对齐路线图

## 目标

将小程序所有核心页面对齐到 `design/` 中的「优化页面设计」参考实现，优先保证：

- 信息结构一致
- 视觉层级一致
- 间距 / 圆角 / 字号 / 色彩一致
- 关键交互状态一致

## 已确认设计源

- Figma 设计入口：`design/README.md`
- 本地参考实现：`design/src/app/App.tsx`

## 页面映射

### 已完成基线页

- `pages/home/index.wxml` ↔ `TodayScreen`
- `pages/library/index.wxml` ↔ `BrowseScreen`
- `pages/shop/index.wxml` ↔ `ShopScreen`

以上页面已接入基线检查：

- `tools/check-home-parity.mjs`
- `tools/check-library-parity.mjs`
- `tools/check-shop-parity.mjs`

### 待对齐页面

- `pages/profile/index.wxml` ↔ `MineScreen`
- `pages/practice/index.wxml` ↔ `TrainingModal`
- `pages/recitation/index.wxml` ↔ 读诵训练详情态
- `pages/plan/index.wxml` ↔ 选内容 / 我的中的计划视图与计划节点表达

## 当前状态

已通过的基线检查：

- `node tools/check-ui-parity.mjs`

当前结果：

- `Home`: PASS
- `Library`: PASS
- `Shop`: PASS

说明：

- 首页、内容库、商城已经和设计稿建立了结构映射与 token 快照。
- 后续页面应沿用同一套视觉语言，不要重新发明样式体系。

## 推荐推进顺序

1. `profile`
   - 先对齐「我的」页，因为它复用统计卡、子 tab、列表卡片等通用模式。
2. `practice`
   - 再对齐训练页，确定详情页的标题层级、进度条、按钮反馈态。
3. `recitation`
   - 复用训练页头部与底部控制区语言，统一播放器和卡片样式。
4. `plan`
   - 最后收口计划页，让计划节点表达与前面几页的 token 完全一致。

## 每页落地步骤

1. 从 `design/src/app/App.tsx` 找到对应设计模块。
2. 提取页面结构映射，补 `docs/ui-parity/*.mapping.json`。
3. 提取视觉 token，补 `docs/ui-parity/*.tokens.json`。
4. 修改对应 `pages/**/index.wxml` 与 `pages/**/index.wxss`。
5. 为该页新增 `tools/check-*-parity.mjs`。
6. 跑静态检查，全部通过后再补截图 diff。

## 新增页面时的完成定义

页面视为完成，需要同时满足：

- 结构检查通过
- token 检查通过
- 页面交互未回退
- 有对应截图可用于后续像素 diff

## 执行约束

- 先抽公共视觉规律，再改页面，避免每页单独调色。
- 不改业务语义，只改 UI 结构与表现。
- 尽量复用现有类名语义，例如 `card`、`page-body`、`page-title`。
- 每完成一页，就补对应 parity 脚本，不要等全部做完再补。
