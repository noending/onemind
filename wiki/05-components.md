# 05 · 自定义组件

前台仅注册两个全局自定义组件：`app-header` 与 `app-tabbar`。它们在 `app.json` 中以绝对路径注册为全局组件，页面直接以 `<app-header />` / `<app-tabbar active="home" />` 形式使用。

## 1. app-header

- 路径：[components/app-header/index.js](file:///Users/liam/Documents/workspace/oneMind/components/app-header/index.js)
- 模板：[components/app-header/index.wxml](file:///Users/liam/Documents/workspace/oneMind/components/app-header/index.wxml)
- 样式：[components/app-header/index.wxss](file:///Users/liam/Documents/workspace/oneMind/components/app-header/index.wxss)
- 配置：[components/app-header/index.json](file:///Users/liam/Documents/workspace/oneMind/components/app-header/index.json)（`{ component: true }`）
- 数据：
  - `statusBarHeight: number`（默认 0）。
- 生命周期：
  - `lifetimes.attached()`：调用 `wx.getWindowInfo()` 或回退 `wx.getSystemInfoSync()`，取 `statusBarHeight`。
- 渲染：
  - 占位 `<view style="height: {{statusBarHeight}}px;"></view>` 推开顶部安全区。
  - 居中标题 `心 经 记`、右侧 `•••`。
- 使用方：
  - 当前主要在 `pages/plan/index.wxml` 中以 `<app-header />` 显式调用。
  - 其他页面因 `navigationStyle: "custom"` 自己手写了 `headerTop`（见 `pages/practice`、`pages/recitation`）。

## 2. app-tabbar

- 路径：[components/app-tabbar/index.js](file:///Users/liam/Documents/workspace/oneMind/components/app-tabbar/index.js)
- 模板：[components/app-tabbar/index.wxml](file:///Users/liam/Documents/workspace/oneMind/components/app-tabbar/index.wxml)
- 样式：[components/app-tabbar/index.wxss](file:///Users/liam/Documents/workspace/oneMind/components/app-tabbar/index.wxss)
- 配置：[components/app-tabbar/index.json](file:///Users/liam/Documents/workspace/oneMind/components/app-tabbar/index.json)
- 属性：
  - `active: String`，默认 `home`。
- 内部 `data.tabs`：
  - `home` → `/pages/home/index`，`icon: home.svg / home-active.svg`。
  - `library` → `/pages/library/index`，`icon: library.svg / library-active.svg`。
  - `shop` → `/pages/shop/index`，`icon: shop.svg / shop-active.svg`。
  - `profile` → `/pages/profile/index`，`icon: profile.svg / profile-active.svg`。
  - 注：`plan` 不在底栏，已整合到「我的」页。
- 方法：
  - `go(event)`：从 `data-key` / `data-url` 读取目标；相同 `key` 短路；带 `_navigating` 节流锁（300 ms）防止快速重复点击；`wx.reLaunch({ url })`。
- 样式特点：
  - 固定底部（`position: fixed; bottom: 0`），半透明背景 + `backdrop-filter: blur(18rpx)`。
  - 上边线 `1rpx solid rgba(232, 214, 192, 0.9)` + 负向阴影。
  - 激活态字色 `#a63127`、加粗。

## 3. 与全局样式的协作

- `app.wxss` 中 `.screen` 已为页面预留 `padding-bottom: calc(176rpx + env(safe-area-inset-bottom))`，避免底栏遮挡内容。
- `app-header` 主要承担顶部 `statusBarHeight` 占位，标题文字由调用方按需覆盖。
- 颜色系统：
  - 主色：`#a63127`（强调红）
  - 辅色：`#f2ac3e`（金）、`#eda53f`
  - 背景：`#f6ecd7`（米黄）
  - 文字：`#351b18`（深棕）、`#80655c`（次级文字）
  - 边框：`#ead8c2`

## 4. 何时改用新组件

- 若未来新增「训练页顶部进度条 / 我的页子标签」等需要复用的小部件，建议把 `WXML` 抽为组件：
  - 顶部带 `headerTop` 偏移的导航条（已在 `pages/practice`、`pages/recitation` 重复实现）。
  - 卡片化的「成长指标」项。
- 引用方式：在 `app.json` 的 `usingComponents` 中加入新路径，再在需要的页面以 `<my-component />` 使用。
