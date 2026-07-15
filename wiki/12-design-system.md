# 12 · 设计系统

## 1. 设计资源

- 根目录 PNG 设计稿参考：
  - [design-library.png](file:///Users/liam/Documents/workspace/oneMind/design-library.png)
  - [design-profile.png](file:///Users/liam/Documents/workspace/oneMind/design-profile.png)
  - [design-shop.png](file:///Users/liam/Documents/workspace/oneMind/design-shop.png)
  - [design-today.png](file:///Users/liam/Documents/workspace/oneMind/design-today.png)
- Figma 导出的 Web 参考实现：[design/](file:///Users/liam/Documents/workspace/oneMind/design/)。
  - 入口 [design/index.html](file:///Users/liam/Documents/workspace/oneMind/design/index.html) + Vite + React。
  - 设计 token 入口 [design/default_shadcn_theme.css](file:///Users/liam/Documents/workspace/oneMind/design/default_shadcn_theme.css)。
  - UI 组件基于 shadcn/ui 风格（[design/src/app/components/ui](file:///Users/liam/Documents/workspace/oneMind/design/src/app/components/ui)）。
  - 主题 / 全局样式 [design/src/styles/](file:///Users/liam/Documents/workspace/oneMind/design/src/styles/)。
- 像素对齐基线 [docs/ui-parity](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/README.md)：6 个页面（home / library / shop / profile / practice / recitation）的 `mapping.json` + `tokens.json` + 截图。

## 2. 设计 token（前台落地版）

> 颜色、字号、间距在 `app.wxss` 中以 CSS 变量/类方式集中定义。

| 角色 | 取值 | 用途 |
| --- | --- | --- |
| 主背景 | `#f6ecd7` | page 背景 |
| 卡片底色 | `rgba(255, 250, 242, 0.7)` | `.card` 容器 |
| 主文字 | `#351b18` | `.page-title`、强调文本 |
| 次级文字 | `#80655c` | `.muted`、`.page-subtitle`、`.section-title` |
| 强调红 | `#a63127` | `.red-button`、tabbar 激活态 |
| 强调金 | `#f2ac3e` / `#eda53f` | `.pill-button`、`.tag-strong` |
| 标签底 | `#f6e4d1` | `.tag` |
| 边框 | `#ead8c2` | `.card`、`.divider` |

### 2.1 圆角 / 间距 / 字号

- `.card` 圆角：`34rpx`，阴影：`0 10rpx 28rpx rgba(83, 56, 36, 0.035)`。
- `.screen` 容器宽度：`max-width: 750rpx`，底部预留 `176rpx + env(safe-area-inset-bottom)`。
- `.page-body` 内边距：`28rpx 36rpx 48rpx`。
- `.page-title`：`font-size: 62rpx` / `line-height: 1.2` / `letter-spacing: 1rpx`。
- `.section-title`：`font-size: 30rpx` / `font-weight: 500`。
- `.tag`：`height: 40rpx` / `padding: 0 16rpx` / `font-size: 21rpx`。
- `.pill-button`：`height: 54rpx` / `font-size: 27rpx`。
- `.red-button`：`height: 60rpx` / `font-size: 25rpx` / `padding: 0 28rpx`。

### 2.2 字体

- 系统字体栈：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`。
- 标题 / 偈语等使用衬线字体（`font-family: "Songti SC", "STSong", "Noto Serif SC", serif`）出现在训练页 / 今日卡。

## 3. 设计系统 Web 包（design/）

- 配置文件：
  - [design/package.json](file:///Users/liam/Documents/workspace/oneMind/design/package.json)
  - [design/vite.config.ts](file:///Users/liam/Documents/workspace/oneMind/design/vite.config.ts)
  - [design/postcss.config.mjs](file:///Users/liam/Documents/workspace/oneMind/design/postcss.config.mjs)
  - [design/pnpm-workspace.yaml](file:///Users/liam/Documents/workspace/oneMind/design/pnpm-workspace.yaml)
- 源码结构：
  - [design/src/app/App.tsx](file:///Users/liam/Documents/workspace/oneMind/design/src/app/App.tsx)
  - [design/src/app/components/figma/ImageWithFallback.tsx](file:///Users/liam/Documents/workspace/oneMind/design/src/app/components/figma/ImageWithFallback.tsx)
  - [design/src/app/components/ui](file:///Users/liam/Documents/workspace/oneMind/design/src/app/components/ui) 下 49 个 shadcn 风格组件（`accordion` / `alert` / `alert-dialog` / `aspect-ratio` / `avatar` / `badge` / `breadcrumb` / `button` / `calendar` / `card` / `carousel` / `chart` / `checkbox` / `collapsible` / `command` / `context-menu` / `dialog` / `drawer` / `dropdown-menu` / `form` / `hover-card` / `input` / `input-otp` / `label` / `menubar` / `navigation-menu` / `pagination` / `popover` / `progress` / `radio-group` / `resizable` / `scroll-area` / `select` / `separator` / `sheet` / `sidebar` / `skeleton` / `slider` / `sonner` / `switch` / `table` / `tabs` / `textarea` / `toggle` / `toggle-group` / `tooltip`）以及 `use-mobile` 钩子与 `utils.ts` 工具。
  - [design/src/main.tsx](file:///Users/liam/Documents/workspace/oneMind/design/src/main.tsx)
  - [design/src/styles](file:///Users/liam/Documents/workspace/oneMind/design/src/styles) 含 `fonts.css` / `globals.css` / `index.css` / `tailwind.css` / `theme.css`。
- 素材：[design/src/imports](file:///Users/liam/Documents/workspace/oneMind/design/src/imports) 下 5 张 Figma 导出 PNG（含 `screenshot-20260524-*`）。
- 许可声明：[design/ATTRIBUTIONS.md](file:///Users/liam/Documents/workspace/oneMind/design/ATTRIBUTIONS.md)。
- 设计指南：[design/guidelines/Guidelines.md](file:///Users/liam/Documents/workspace/oneMind/design/guidelines/Guidelines.md)。

## 4. UI 一致性基线

详见 [13-ui-parity-tools.md](file:///Users/liam/Documents/workspace/oneMind/wiki/13-ui-parity-tools.md)。简言之：

- `docs/ui-parity/<page>.mapping.json`：Web 参考到 MiniApp 实现的结构映射。
- `docs/ui-parity/<page>.tokens.json`：颜色 / 字号 / 圆角 / 间距的视觉 token 快照（包含 px ↔ rpx 换算口径）。
- `docs/ui-parity/screenshots/`：比对输入与 diff 输出。

## 5. 颜色 / 命名映射建议

- 当新增页面或模式时，可按 `app.wxss` 的颜色体系补充全局类，避免在 `*.wxss` 中硬编码。
- 重点短语统一：
  - 「科学背诵 / 趣味背诵 / 日常读诵」三种模式名在 `pages/library`、`pages/practice`、`pages/profile` 中保持一致。
  - 反馈文案统一：训练页底部固定为「更熟 / 已掌握 / 需加强」三档。
  - 空状态文案：「今日圆满 / 还没有计划 / 当前使用本地默认提醒设置」等。
