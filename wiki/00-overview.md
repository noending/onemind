# 00 · 项目总览

## 1. 项目名称与定位

- 仓库名：`oneMind`
- 产品名：**一念法藏**
- 一句话定位：帮助在家修行者更轻松地背下短咒、短偈、常用经文片段；后续再延展到节日、音乐、唐卡、能量画与「数字法藏」权限管理。
- 业务主线：**科学记忆 + 趣味背诵 + 日常读诵**三模式协同。
- 状态：MVP 阶段。前台为多端 MiniApp，本地有 Node.js 后端骨架 + PostgreSQL Schema + Admin Web。

## 2. 核心闭环

1. **选内容**：`pages/library` 展示可修持内容，用户按类别 / 节日筛选。
2. **生成计划**：选择模式（科学 / 趣味 / 读诵）后，后端或本地创建 `MemoryPlan` / `RecitationGoal`。
3. **每日训练**：`pages/home` 聚合今天到期的任务，点击进入 `pages/practice`（背诵训练）或 `pages/recitation`（读诵）。
4. **结果反馈**：训练页底部反馈「更熟 / 已掌握 / 需加强」三种结果，更新 `masteryScore` 与 `state`。
5. **下次复习**：`MemoryPlan` 按 `REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30]` 推算下个节点；漏掉的任务会在 `rescheduleOverduePlans` 中自动顺延。

## 3. 技术栈

| 层 | 技术 |
| --- | --- |
| 多端工程 | 微信开发者工具 `projectArchitecture: "multiPlatform"` |
| 前台 | 原生小程序（`WXML` / `WXSS` / `JS` / `JSON`），无 `uni-app` / `Taro` |
| 状态 / 数据 | `wx.getStorageSync` / `wx.setStorageSync`，单 `globalData` 存放产品元信息 |
| 跨端适配 | `common/platform.js` 通过 `wx.getSystemInfoSync` 识别平台，返回 `HarmonyOS / iOS / Android / WeChat` |
| 后端 | Node.js 18+ 原生 `http` 模块，仓库模式可在 `memoryStore` 与 `postgresStore` 之间切换 |
| 数据库 | PostgreSQL 14+（`backend/schema.sql`），不可用时自动回退到内存仓库 |
| 管理后台 | 静态 HTML + 原生 JS（`/admin`），无框架依赖 |
| 设计参考 | Figma 导出包（`design/`），React + Vite + Tailwind + shadcn/ui 组件 |
| UI 对齐工具 | `pixelmatch` + `pngjs`（`tools/`） |
| 依赖 | 前台运行无 `package.json`（不依赖 npm），后端仅依赖 Node 标准库（`pg` 通过 shell 调用） |

## 4. 关键设计原则

- **不替用户做复杂配置**：所有训练参数由系统按内容长度自动生成。
- **数据规范优先**：核心实体（`ContentItem` / `MemoryPlan` / `ReviewTask` / `FestivalRecommendation` / `ProgressState`）有明确字段。
- **前后端解耦**：前台可独立以本地数据运行；后端 `isBackendEnabled()` 决定是否走 API。
- **跨端能力分层**：核心记忆逻辑跨端一致；提醒、音频、隐私权限差异收口在 `common/platform.js`。
- **后台角色化**：管理员有 `super_admin` / `platform_ops` / `content_editor` / `content_reviewer` / `organization_admin` / `asset_maintainer` / `readonly_member` 七种角色（见 `backend/src/routes.js`）。

## 5. 目录清单

```text
oneMind/
├── app.js / app.json / app.wxss
├── project.config.json
├── project.miniapp.json
├── app.miniapp.json
├── sitemap.json
├── assets/                # 静态资源
│   ├── tabbar/            # 5 个底栏图标（每项含 .svg + -active.svg）
│   ├── music-*.jpg        # 商城音频封面
│   └── thangka-*.jpg      # 唐卡 / 壁纸图
├── pages/                 # 7 个小程序页面
│   ├── home/              # 今日（任务聚合）
│   ├── library/           # 选内容
│   ├── plan/              # 复习计划
│   ├── practice/          # 拆段训练
│   ├── profile/           # 我的
│   ├── recitation/        # 日常读诵
│   └── shop/              # 商城
├── common/                # 跨页面复用纯 JS 模块
│   ├── api.js             # REST 客户端（含降级策略）
│   ├── content.js         # 内容数据 + 辅助函数
│   ├── memory.js          # 记忆计划 / 训练记录 / 复习节点
│   └── platform.js        # 平台识别 / 提醒策略 / 自检清单
├── components/            # 自定义组件
│   ├── app-header/        # 状态栏 + 标题栏
│   └── app-tabbar/        # 底部 4 栏（今日 / 选内容 / 商城 / 我的）
├── backend/               # 本地后端 + Admin Web
│   ├── src/
│   │   ├── server.js
│   │   ├── routes.js
│   │   ├── data/seed.js
│   │   └── repositories/
│   │       ├── store.js           # 仓库模式选择
│   │       ├── memoryStore.js     # 内存仓库
│   │       └── postgresStore.js   # PostgreSQL 仓库
│   ├── admin/             # Admin 静态资源
│   ├── schema.sql         # PostgreSQL Schema
│   ├── package.json
│   └── README.md
├── design/                # Figma 导出的 Web 参考实现
│   ├── src/
│   │   └── app/           # React 入口
│   ├── index.html
│   └── package.json
├── tools/                 # UI 一致性比对工具
│   ├── check-*-parity.mjs
│   └── compare-*-screenshots.mjs
├── docs/                  # 项目文档
│   ├── PRODUCT_REQUIREMENTS.md
│   ├── API_CONTRACT.md
│   ├── DATABASE_DESIGN.md
│   ├── MULTI_PLATFORM_PLAN.md
│   ├── EXECUTION_TASKS.md
│   ├── ADMIN_BACKEND_REQUIREMENTS.md
│   ├── PHASE2_VALIDATION_REPORT.md
│   └── ui-parity/         # 像素对齐基线
├── miniapp/               # 端侧原生资源
│   ├── android/
│   └── ios/
├── i18n/base.json         # 跨端统一名称
├── PLAN.md
├── README.md
└── wiki/                  # 本目录（Code Wiki）
```

## 6. 关键数据源

- **本地内容**：`common/content.js` 提供 8 段首发内容、2 个节日、初始 `todayReviews` 与 `progressItems`。
- **种子数据**：`backend/src/data/seed.js` 提供 5 段内容 + 2 个节日 + 1 个组织 + 数字资产 + 审计日志，作为后端 API 的初始数据集。
- **图标 SVG**：`assets/tabbar/` 下的 `home.svg` / `home-active.svg` 等 5 组 10 个文件。

## 7. 关键约定

- **本地优先**：`common/api.js` 通过 `oneMind.api.enabled` storage 键切换本地 / 后端。
- **后端基址**：默认 `http://127.0.0.1:8787`，可通过 `oneMind.api.baseUrl` 覆盖。
- **本地存储 key**：
  - `oneMind.api.enabled` / `oneMind.api.baseUrl` / `oneMind.api.contents.cache` / `oneMind.api.status`
  - `oneMind.auth.token` / `oneMind.auth.user`
  - `oneMind.memoryPlans` / `oneMind.progress`（在 `app.js` 的 `globalData` 中声明）
  - `sutra-memo-store-v2` / `sutra-recitation-goals-v1` / `sutra-recitation-sessions-v1`（`common/memory.js`）
  - `oneMind.phase2.validation`（`common/platform.js`）
  - `oneMind.profile.notification-settings` / `oneMind.profile.notification-jobs`（`pages/profile`）
- **HTTP 头**：所有受保护接口使用 `Authorization: Bearer <token>` 头（Admin / User 双 token 体系）。
