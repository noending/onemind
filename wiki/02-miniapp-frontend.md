# 02 · 前台 MiniApp 工程结构

## 1. 工程入口

- [app.js](file:///Users/liam/Documents/workspace/oneMind/app.js)
  - `App({ globalData: { productName: "一念法藏", storageKeys: { plans, progress } } })`
  - 未注册 `onLaunch`，前台启动行为完全在各页面 `onLoad` / `onShow` 中按需触发。
- [app.json](file:///Users/liam/Documents/workspace/oneMind/app.json)
  - 注册七个页面（顺序即为默认 Tab 排序）。
  - 窗口：`navigationBarTitleText: "一念法藏"`、`navigationBarBackgroundColor: "#f7f4ec"`、`backgroundColor: "#fffaf2"`、`navigationStyle: "custom"`。
  - 全局组件：`usingComponents` 注册 `app-header` 与 `app-tabbar`。
  - `sitemapLocation: "sitemap.json"`，开启 `style: v2`。
- [app.wxss](file:///Users/liam/Documents/workspace/oneMind/app.wxss)
  - 全局 page 样式（米色背景、衬线字体、字体平滑）。
  - 通用类：`.screen`、`.page-body`、`.page-title`、`.page-subtitle`、`.section-title`、`.card`、`.tag`、`.tag-strong`、`.pill-button`、`.red-button`、`.muted`、`.divider`。

## 2. 多端工程配置

- [project.config.json](file:///Users/liam/Documents/workspace/oneMind/project.config.json)
  - `simulatorType: wechat`、`compileType: miniprogram`、`projectArchitecture: multiPlatform`、`appid: wx852e7aca1252a0e7`。
  - `setting.es6 = true`、`compileWorklet = false`、`uglifyFileName = false`。
- [project.miniapp.json](file:///Users/liam/Documents/workspace/oneMind/project.miniapp.json)
  - 声明三端：`mini-ohos`（SDK 0.5.1）、`mini-android`（SDK 1.6.24 / toolkit 0.11.0）、`mini-ios`（SDK 1.7.1 / toolkit 0.0.9）。
  - iOS 端提供完整 `privateDescriptions`（相册 / 相机 / 麦克风 / 位置 / 通讯录 / 日历 / 提醒事项 / 蓝牙 / 语音识别 / 本地网络 / 系统管理 / 照片库写入等 14 项描述）。
  - `i18nFilePath: "i18n"`。
- [app.miniapp.json](file:///Users/liam/Documents/workspace/oneMind/app.miniapp.json)
  - `adapteByMiniprogram.userName: "gh_38a0a1d6a0a1"`，声明关联的微信小程序原始账号。
- [i18n/base.json](file:///Users/liam/Documents/workspace/oneMind/i18n/base.json)：端侧统一名称 `一念法藏`。
- [miniapp/ios/i18nInfo.json](file:///Users/liam/Documents/workspace/oneMind/miniapp/ios/i18nInfo.json) 与 [miniapp/android/i18nInfo.json](file:///Users/liam/Documents/workspace/oneMind/miniapp/android/i18nInfo.json)：端侧资源信息。
- [sitemap.json](file:///Users/liam/Documents/workspace/oneMind/sitemap.json)：默认全开 `allow: "*"`。

## 3. 静态资源

- [assets/tabbar](file:///Users/liam/Documents/workspace/oneMind/assets/tabbar)：10 个 SVG（5 项 × 普通 / 激活）。当前使用 4 项（home / library / shop / profile）；`plan` 的图标保留但底栏已合并。
- [assets](file:///Users/liam/Documents/workspace/oneMind/assets)：4 张音频封面 + 3 张唐卡图。

## 4. 自定义组件

详见 [05-components.md](file:///Users/liam/Documents/workspace/oneMind/wiki/05-components.md)。

- [components/app-header](file:///Users/liam/Documents/workspace/oneMind/components/app-header/index.js)：状态栏占位 + 标题栏。
- [components/app-tabbar](file:///Users/liam/Documents/workspace/oneMind/components/app-tabbar/index.js)：4 栏底部导航（今日 / 选内容 / 商城 / 我的）。

## 5. 公共模块

详见 [04-common-modules.md](file:///Users/liam/Documents/workspace/oneMind/wiki/04-common-modules.md)。

- `common/api.js`：REST 客户端 + 鉴权 + 内容 / 计划 / 任务 / 通知 / 读诵 等 API。
- `common/content.js`：本地内容数据。
- `common/memory.js`：记忆计划、复习节点、读诵目标的本地存储与跨端同步。
- `common/platform.js`：平台识别、提醒策略、自检清单。

## 6. 页面总览

详见 [03-pages.md](file:///Users/liam/Documents/workspace/oneMind/wiki/03-pages.md)。

| 路径 | 文件 | 用途 |
| --- | --- | --- |
| 今日 | [pages/home](file:///Users/liam/Documents/workspace/oneMind/pages/home/index.js) | 聚合到期任务、节日卡、连续天数 |
| 选内容 | [pages/library](file:///Users/liam/Documents/workspace/oneMind/pages/library/index.js) | 内容浏览 + 模式选择 |
| 复习计划 | [pages/plan](file:///Users/liam/Documents/workspace/oneMind/pages/plan/index.js) | 列出全部计划与节点 |
| 训练 | [pages/practice](file:///Users/liam/Documents/workspace/oneMind/pages/practice/index.js) | 拆段训练 / 反馈 / 推荐 |
| 我的 | [pages/profile](file:///Users/liam/Documents/workspace/oneMind/pages/profile/index.js) | 平台信息 / 提醒 / 成长曲线 |
| 读诵 | [pages/recitation](file:///Users/liam/Documents/workspace/oneMind/pages/recitation/index.js) | 全文章节 + 读诵打卡 |
| 商城 | [pages/shop](file:///Users/liam/Documents/workspace/oneMind/pages/shop/index.js) | 商品列表 / 收藏 / 加购 |

## 7. 设计资源

- [design-library.png](file:///Users/liam/Documents/workspace/oneMind/design-library.png) / [design-profile.png](file:///Users/liam/Documents/workspace/oneMind/design-profile.png) / [design-shop.png](file:///Users/liam/Documents/workspace/oneMind/design-shop.png) / [design-today.png](file:///Users/liam/Documents/workspace/oneMind/design-today.png)：根目录的设计稿参考图。

## 8. 文档与执行基线

- [README.md](file:///Users/liam/Documents/workspace/oneMind/README.md)：项目入口文档。
- [PLAN.md](file:///Users/liam/Documents/workspace/oneMind/PLAN.md)：产品需求方案。
- [docs/PRODUCT_REQUIREMENTS.md](file:///Users/liam/Documents/workspace/oneMind/docs/PRODUCT_REQUIREMENTS.md)：前台产品需求统一基线。
- [docs/MULTI_PLATFORM_PLAN.md](file:///Users/liam/Documents/workspace/oneMind/docs/MULTI_PLATFORM_PLAN.md)：多端实施计划。
- [docs/EXECUTION_TASKS.md](file:///Users/liam/Documents/workspace/oneMind/docs/EXECUTION_TASKS.md)：阶段任务清单。
- [docs/PHASE2_VALIDATION_REPORT.md](file:///Users/liam/Documents/workspace/oneMind/docs/PHASE2_VALIDATION_REPORT.md)：多端验证报告。
- [docs/ui-parity](file:///Users/liam/Documents/workspace/oneMind/docs/ui-parity/README.md)：像素对齐基线（6 个页面的 mapping / tokens / 截图）。

## 9. 运行前置

- 微信开发者工具：导入根目录即可在 WeChat 模拟器中打开。
- Node.js 18+：用于运行后端（可选，前台无依赖）。
- PostgreSQL 14+：用于完整后端模式（不可用则自动回退到内存）。
