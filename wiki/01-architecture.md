# 01 · 系统架构

## 1. 顶层分层

```text
┌──────────────────────────────────────────────────────────────────┐
│                       端侧（MiniApp 容器）                          │
│  WeChat  │  iOS MiniApp  │  Android MiniApp  │  OHOS MiniApp     │
└──────────────────────────────────────────────────────────────────┘
                            ▲
                            │（共享 WXML/WXSS/JS）
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                   前台 MiniApp（项目根目录）                       │
│   pages/  common/  components/  assets/  app.*  project.*        │
└──────────────────────────────────────────────────────────────────┘
                │                                           ▲
                │ wx.request + Bearer Token                 │ 健康检查 / 内容 / 计划 / 任务
                ▼                                           │
┌──────────────────────────────────────────────────────────────────┐
│                后端 backend/（Node.js 18+，端口 8787）             │
│                                                                  │
│   server.js ─ routes.js ─ repositories/store.js                  │
│                                    ├── memoryStore.js（默认）     │
│                                    └── postgresStore.js（可用时）  │
│                                                                  │
│   data/seed.js        种子内容 / 节日 / 组织 / 资产                │
│   schema.sql          PostgreSQL DDL                              │
│   admin/              /admin 静态管理后台（HTML+JS）              │
└──────────────────────────────────────────────────────────────────┘
                            ▲
                            │ REST（设计参考、未来联调）
                            │
┌──────────────────────────────────────────────────────────────────┐
│           设计参考 design/（Figma 导出的 Web 实现）                │
│   React + Vite + Tailwind + shadcn/ui                            │
└──────────────────────────────────────────────────────────────────┘
```

## 2. 端侧架构（前台 MiniApp）

### 2.1 入口与全局

- `app.js` 暴露 `globalData.productName = "一念法藏"` 与 `storageKeys`（用于规范化本地存储 key）。
- `app.json` 注册七个页面与两个全局自定义组件（`app-header`、`app-tabbar`），并开启 `style: v2` 与自定义导航栏。
- `app.wxss` 定义全局基色（`#f6ecd7` 背景、`#351b18` 文字）、通用容器 `.screen`、卡片 `.card`、标签 `.tag`、胶囊按钮 `.pill-button`、红色按钮 `.red-button` 等。

### 2.2 页面（pages/）

| 页面 | 路径 | 角色 | 关键数据来源 |
| --- | --- | --- | --- |
| 今日 | `pages/home/index` | 聚合到期任务、节日推荐、连续天数 | `listTodayFocusWithFallback` / `getGrowthOverviewWithFallback` / `listFestivals` |
| 选内容 | `pages/library/index` | 内容浏览 + 模式选择 | `listContents` / `getPlanRows` / `createPlanWithFallback` / `saveRecitationGoalWithFallback` |
| 复习计划 | `pages/plan/index` | 列出当前用户全部计划的节点明细 | `getPlanRows` |
| 训练 | `pages/practice/index` | 拆段训练、反馈、下一步推荐 | `getPlan` / `firstOpenTask` / `completeTaskWithFallback` / `recommendNextContent` |
| 我的 | `pages/profile/index` | 平台信息、提醒设置、记忆曲线、成长指标 | `getProgressItems` / `getGrowthOverviewWithFallback` / `getNotificationSettingsApi` / `listNotificationJobsApi` |
| 读诵 | `pages/recitation/index` | 全文章节、播放控制、读诵打卡 | `findContent` / `findCachedContent` / `completeRecitationWithFallback` |
| 商城 | `pages/shop/index` | 商品列表 / 收藏 / 详情 / 模拟加购 | `PRODUCTS` 内置数组 |

### 2.3 公共模块（common/）

详见 [04-common-modules.md](file:///Users/liam/Documents/workspace/oneMind/wiki/04-common-modules.md)。

- `content.js`：本地内容库与 `findContent` / `recommendNext` 等工具。
- `memory.js`：本地记忆计划存储、计划生成、复习节点、读诵目标管理、本地/后端融合。
- `platform.js`：平台识别、提醒能力探测、Phase 2 自检清单。
- `api.js`：HTTP 客户端（`wx.request` 包装）、Token 缓存、内容/计划/任务/通知等所有 REST 调用的封装。

### 2.4 自定义组件（components/）

- `app-header`：状态栏高度 + 标题栏。`lifetimes.attached` 中读取 `wx.getWindowInfo().statusBarHeight`。
- `app-tabbar`：4 栏（今日 / 选内容 / 商城 / 我的），使用 `properties.active` 控制高亮，点击通过 `wx.reLaunch` 切换。带 `_navigating` 节流锁。

## 3. 后端架构（backend/）

### 3.1 进程模型

- `backend/src/server.js` 使用 `http.createServer`，监听 `process.env.PORT || 8787`、`process.env.HOST || "127.0.0.1"`。
- `req` 流限制 1 MB（`if (body.length > 1_000_000) req.destroy();`），`OPTIONS` 直接 200 放行。
- 错误统一 `sendJson(res, error.statusCode || 500, { error })`。

### 3.2 路由（backend/src/routes.js）

- 路由采用纯手工 dispatch（无框架）：
  - `/`、`/admin`、`/admin/*` → 静态文件（`backend/admin/`）。
  - `/health` → 健康检查，返回 `storeMode`。
  - `/api/admin/login` → 管理员登录。
  - `/api/auth/wechat/login`、`/api/auth/me` → 用户微信登录与当前用户。
  - `/api/contents` 与 `/api/contents/:id` → 内容列表 / 详情。
  - `/api/festivals` → 节日列表。
  - `/api/memory-plans`（GET/POST）、`/api/review-tasks/:id/complete` → 计划与任务。
  - `/api/today-focus`、`/api/growth-overview` → 今日焦点与成长总览。
  - `/api/recitation-goals`、`/api/recitation-sessions` → 读诵目标与记录。
  - `/api/notification-settings`、`/api/notification-jobs` → 通知设置与任务。
  - `/api/admin/*`、`/api/organizations/*`、`/api/assets/*/access`、`/api/audit-logs` → 管理后台、组织与资产、权限管理。
  - `/api/admin/notification-jobs/dispatch` → 模拟派发。
- 受保护接口通过 `requiresAdminAuth` / `getRequiredPermission` / `hasAdminPermission` 校验。
- 鉴权：管理员与用户采用两套签名 Token（`createSignedToken`），密钥分别由 `ADMIN_TOKEN_SECRET` / `USER_TOKEN_SECRET` 控制。

### 3.3 仓库层（repositories/）

- `store.js`：导入时尝试 `require('./postgresStore')`，并执行 `initializeDatabase()`。成功则切到 `postgres` 模式，失败则回退到 `memory` 模式并打印 warn。
- `memoryStore.js`：完全基于内存对象 `state`；提供 `listContents` / `createContent` / `updateContent` / `archiveContent` / `getContent` / `listFestivals` / `listPlans` / `createPlan` / `completeTask` / `loginByWechatCode` / `getUserById` / `getNotificationSettings` / `upsertNotificationSetting` / `createNotificationJob` / `listNotificationJobs` / `dispatchNotificationJobs` / `getGrowthOverview` / `listRecitationGoals` / `upsertRecitationGoal` / `createRecitationSession` / `listTodayFocus` / `getDashboard` / `listOrganizations` / `listOrganizationAssets` / `createAsset` / `updateAsset` / `archiveAsset` / `updateAssetAccess` / `addOrganizationMember` / `listAuditLogs`。
- `postgresStore.js`：使用 `child_process.execFileSync` 调用系统 `psql` 客户端，连接到 `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`（默认 `127.0.0.1:5432 / magic / onemind`），提供与 `memoryStore` 同样的接口语义。

### 3.4 种子数据（data/seed.js）

- 内容：5 段（`six-syllable-mantra`、`green-tara-mantra`、`diamond-sutra-ending`、`heart-sutra-core`、`great-compassion-opening`）。
- 节日：2 个（`guanyin-birthday`、`medicine-buddha-birthday`）。
- 组织：1 个（`org-demo-dharma`）。
- 数字资产：3 个示例（含 `heart-audio` / `guanyin-thangka` / `private-ritual`）。
- 审计日志：少量初始记录。

### 3.5 Admin Web（backend/admin/）

- 静态目录 `backend/admin/`，由 `routes.js` 在 `/admin` 与 `/admin/*` 路径下直接提供。
- 入口 `index.html` + 资源 `admin.css` / `admin.js`。
- 通过 `/api/admin/login` 登录、`/api/admin/session` 校验、`/api/admin/*` 资源管理。

## 4. 数据流（典型路径）

### 4.1 背诵闭环

```text
[User] pages/library
  └─ pickContent()  → 选 mode
       └─ createPlanWithFallback(content, mode)              [common/memory.js]
            ├─ isBackendEnabled() === true
            │    └─ createMemoryPlanApi() → POST /api/memory-plans
            │         └─ backend memoryStore / postgresStore createPlan()
            │              └─ 返回 plan + tasks
            └─ isBackendEnabled() === false
                 └─ createMemoryPlan(content, mode)  // 本地构造
                      └─ upsertPlan()                // 持久化到 storage

[Next Day] pages/home  onShow
  └─ listTodayFocusWithFallback()                          [common/memory.js]
       └─ 后端 listTodayFocus(userId) / 本地 getTodayFocusLocal()
            └─ 数据按 mode 拆分为 scientificTasks / playfulTasks / recitationTasks

[User] 点开训练 → pages/practice
  └─ completeTaskWithFallback(planId, result, metrics)
       ├─ 后端 completeReviewTaskApi → POST /api/review-tasks/:id/complete
       │    └─ memoryStore.completeTask()  → 更新 masteryScore / state / 当前节点
       └─ 本地 completeTask()            → 同步本地存储
```

### 4.2 读诵闭环

```text
[User] pages/library.startRecitation() 或 pages/home.openRecitation()
  └─ saveRecitationGoalWithFallback(content, { preferredPeriod, dailyTargetCount })
       ├─ 本地保存 goal 到 sutra-recitation-goals-v1
       └─ 后端 upsertRecitationGoal() → PUT /api/recitation-goals/:contentId
  └─ wx.navigateTo → pages/recitation

[User] pages/recitation  → 点击「读诵完成」
  └─ completeRecitationWithFallback(content, payload)
       ├─ 本地保存 session 到 sutra-recitation-sessions-v1
       └─ 后端 createRecitationSessionApi() → POST /api/recitation-sessions
```

### 4.3 平台与提醒

```text
[User] 进入 pages/profile
  └─ refreshPlatformPanel()
       └─ getPlatformInfo() → getPlatformLabel() / getReminderStrategy() / getReminderCapabilities() / getPlatformChecklist()
            └─ 用户可点击切换 checklist 中可编辑项（toggleChecklistStatus）
  └─ refreshNotificationPanel(session)
       ├─ 已登录 + 后端启用 → getNotificationSettingsApi() + listNotificationJobsApi()
       └─ 否则从本地 oneMind.profile.notification-settings / notification-jobs 读缓存
```

## 5. 模块依赖图

```text
                      ┌──────────────┐
                      │   app.js     │
                      └──────┬───────┘
                             │
                             ▼
        ┌────────────────────────────────────┐
        │            pages/ (7 个)            │
        │  home / library / plan / practice   │
        │  profile / recitation / shop        │
        └──┬─────────────┬─────────────┬──────┘
           │             │             │
           ▼             ▼             ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐
     │ content  │  │  memory  │  │ platform │
     └────┬─────┘  └────┬─────┘  └──────────┘
          │             │
          │             ▼
          │       ┌──────────┐
          │       │   api    │  ← wx.request → backend
          │       └────┬─────┘
          │            │
          ▼            ▼
       ┌──────────────────┐
       │ backend (Node)   │
       │  routes / store  │
       │  + Admin / PG    │
       └──────────────────┘

   components/ 仅被 pages/ 与 app.json 引用。
   design/ 与 tools/ 是独立子系统（设计参考 / 验证工具），不影响运行时。
```

## 6. 运行时配置

- `project.config.json`：`compileType: miniprogram`、`projectArchitecture: multiPlatform`、`appid: wx852e7aca1252a0e7`。
- `project.miniapp.json`：分别声明 `mini-ios`（SDK 1.7.1）、`mini-android`（SDK 1.6.24）、`mini-ohos`（SDK 0.5.1）的扩展能力、图标、隐私文案等。
- `app.json`：`navigationStyle: custom`（顶部自定义），全局组件 `app-header` / `app-tabbar`。
- 后端环境变量：`PORT` / `HOST` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_TOKEN_SECRET` / `USER_TOKEN_SECRET` / `WECHAT_LOGIN_MODE` / `WECHAT_APP_ID` / `WECHAT_APP_SECRET` / `PG*`。

## 7. 启动链路一览

- 前台：在微信开发者工具打开项目根目录 → 选中 `simulatorType: wechat` → 运行首页。
- 后端：`cd backend && npm run check && npm start` → `http://127.0.0.1:8787`。
- 后台：`http://127.0.0.1:8787/admin`。
- 启用后端：在前台 `pages/profile` 或测试代码中 `setBackendEnabled(true)`，或在小程序 storage 中写入 `oneMind.api.enabled = true`。
