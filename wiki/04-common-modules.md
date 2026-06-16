# 04 · 公共模块（common/）

`common/` 下四个文件都是 Node 风格的 CommonJS 模块（`module.exports = {...}`），被前台各页面按需 `require`。它们不依赖具体平台 API（除 `wx.*` 调用外）。

## 1. common/content.js

- 路径：[common/content.js](file:///Users/liam/Documents/workspace/oneMind/common/content.js)
- 作用：本地内容数据 + 推荐算法。
- 数据：
  - `contents`：8 条首发内容（`om-mani` / `green-tara` / `medicine-buddha` / `heart-sutra-core` / `four-vows` / `amitabha` / `diamond-end` / `great-compassion-snippet`），每条包含 `id, title, category, body, preview, segments, lengthTier, lengthLevel, planDays, lengthLabel, scene, hasAudio, accessLevel[, festival, festivalTag]`。
  - `festivals`：2 个节日（`guanyin-birth` 观音菩萨圣诞、`medicine-buddha-day` 药师佛圣诞），字段含 `id, name, date, deity, contentIds, reason`。
  - `todayReviews`：3 条今日复习初始数据。
  - `progressItems`：`{ reviewing, atRisk, mastered, playful, scientific }` 的初始结构。
- 函数：
  - `findContent(id)`：根据 `id` 查找内容。
  - `recommendNext(currentId)`：优先找同类别内容，否则回退到任意其它内容。
- 典型使用方：`pages/practice/index.js`、`common/memory.js`。

## 2. common/memory.js

- 路径：[common/memory.js](file:///Users/liam/Documents/workspace/oneMind/common/memory.js)
- 作用：本地训练 / 计划 / 任务的全部领域逻辑；与 `common/api.js` 协作以支持后端模式。

### 2.1 常量

- `PLAN_STORAGE_KEY = "sutra-memo-store-v2"`。
- `RECITATION_GOAL_KEY = "sutra-recitation-goals-v1"`。
- `RECITATION_SESSION_KEY = "sutra-recitation-sessions-v1"`。
- `REVIEW_SEQUENCE = ["拆段跟读", "首字提示", "遮挡回忆", "填空复现", "整段复诵", "抽查巩固"]`。
- `REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30]`、`REVIEW_TAIL_INTERVAL = 15`。
- `GROWTH_STAGES = ["初见", "熟悉", "稳定", "通顺", "已持诵"]`（阈值 25/50/75/100）。

### 2.2 工具函数

- `formatDate(date)` / `todayDate()` / `addDays(dateStr, dayOffset)` / `compareDate(a, b)` / `shiftDate(dateStr, dayOffset)`：日期工具。
- `normalizeMode(mode)`：把 `playful` 以外的输入归一为 `scientific`。
- `buildReviewOffsets(totalDays)`：按 `REVIEW_INTERVALS` 生成复习节点偏移量；超出区间则每个新任务在前一个基础上 +15 天。
- `methodForDay(dayIndex, totalDays)`：根据天数选训练方法（短计划固定前 2 个方法）。
- `growthStageFromScore(score)`：分数→阶段。
- `scientificReasonText(plan, task)`：基于 `state` / `dayIndex` / `masteryScore` 生成「为什么今天轮到这段」文案。
- `safeRead` / `safeWrite`：本地存储读写，失败时静默回退。
- `getPlans()` / `setPlans(plans)` / `savePlans(plans)` / `getPlan(planId)` / `upsertPlan(plan)`：本地计划 CRUD。
- `getRecitationGoals()` / `saveRecitationGoals(goals)`：读诵目标持久化。
- `getRecitationSessions()` / `saveRecitationSessions(sessions)`：读诵记录持久化。
- `rescheduleOverduePlans(plans, dateStr)`：将每个计划中漏掉的任务重新顺延到今天起每天一格。
- `calculateDailyStreak(days)`：根据完成日期数组计算连续天数。
- `firstOpenTask(plan)`：返回首个未完成任务；无则回退最后一个。
- `planProgress(plan)`：`{ current, total, percent }`。
- `taskCardFromPlan(plan, task)`：把内部计划结构投影成首页 / 训练页通用卡片。
- `getTodayFocusLocal(dateStr)`：按 `mode` 拆分为 `scientificTasks` / `playfulTasks` / `recitationTasks`。
- `getTodayReviews()`：`scientificTasks + playfulTasks` 兼容旧版。
- `hasPlans()` / `getPlanRows()` / `normalizePlan(plan)`。
- `getProgressItems()`：按 `state` 分桶为 `reviewing` / `atRisk` / `mastered`，并按 `mode` 拆 `scientific` / `playful`。

### 2.3 任务结果处理

- `completeTask(planId, result, metrics)`：
  - 找首个未完成任务，写 `done: true`、`result`、`completedAt`。
  - 根据 `result` 调整 `masteryScore`：`mastered +40`、`stronger +24`、`needsWork -8`。
  - 状态机：`mastered`（满 100 或显式结果）/ `at_risk`（`needsWork`）/ `reviewing`。
  - 写入 `lastPracticeMetrics`（`selfRating` / `latencyBand` / `mistakeCount`）。
- `mapResultToApi` / `mapResultFromApi` / `mapRemoteTask` / `mapRemotePlan`：与后端字段互转。
- `mergePlan(plan)`：按 id 或 content+mode 合并到本地计划集合。
- `syncPlansFromBackend()`：后端启用时拉取远端计划覆盖本地。
- `createPlanWithFallback(content, mode)`：先尝试 `createMemoryPlanApi`，失败则本地 `createMemoryPlan` + `upsertPlan`。
- `completeTaskWithFallback(planId, result, metrics)`：先尝试远端 `completeReviewTaskApi`，失败则本地 `completeTask`。

### 2.4 今日 / 成长 / 读诵

- `listTodayFocusWithFallback()` / `getTodayFocusWithFallback()`：后端 → 本地。
- `getGrowthOverviewLocal()`：从本地 `progress` / `sessions` / `plans` 聚合 `{ memorizationStreak, recitationStreak, masteredCount, playfulPlanCount, scientificPlanCount, completedTaskCount, recitationSessionCount, latestMilestone }`。
- `getGrowthOverviewWithFallback()`：后端 → 本地。
- `listRecitationGoalsWithFallback()`：后端 → 本地。
- `saveRecitationGoalWithFallback(content, payload)`：本地写 + 远端 upsert。
- `completeRecitationWithFallback(content, payload)`：本地写 + 远端 `createRecitationSessionApi`。

### 2.5 导出

```js
module.exports = {
  formatDate, todayDate,
  createMemoryPlan,
  getPlan, getPlans, getPlanRows, getTodayReviews,
  getTodayFocusLocal, listTodayFocusWithFallback, getTodayFocusWithFallback,
  getGrowthOverviewWithFallback,
  getRecitationGoals, listRecitationGoalsWithFallback,
  saveRecitationGoalWithFallback, completeRecitationWithFallback,
  hasPlans, getProgressItems,
  savePlans, upsertPlan, completeTask, firstOpenTask,
  syncPlansFromBackend, createPlanWithFallback, completeTaskWithFallback,
  growthStageFromScore
};
```

## 3. common/platform.js

- 路径：[common/platform.js](file:///Users/liam/Documents/workspace/oneMind/common/platform.js)
- 作用：平台识别 + 提醒策略 + Phase 2 自检清单。

### 3.1 平台识别

- `getPlatformInfo()`：调 `wx.getSystemInfoSync()`，返回 `{ platform, hostName, system, model }`。
- `getPlatformLabel(info)`：按 `system` / `platform` / `hostName` 返回 `HarmonyOS MiniApp` / `iOS MiniApp` / `Android MiniApp` / `微信小程序` / `多端 MiniApp`。

### 3.2 提醒策略

- `getReminderStrategy()`：根据 `hostName` / `platform` / `system` 返回策略文案：
  - 微信端 → 「微信端优先使用订阅消息与站内待办。」
  - iOS / Android → 「App 端使用系统通知与本地提醒。」
  - 鸿蒙 → 「鸿蒙端通过多端 MiniApp 通知适配层处理。」
  - 其它 → 「当前端使用站内提醒。」
- `getReminderCapabilities()`：返回三档能力 `inbox` / `subscribe` / `system` 的 `available | ready | fallback` 状态。

### 3.3 自检清单

- 内部 5 项：`layout` / `asset` / `storage` / `navigation` / `reminder`。
- `storage` 项自动跑 `testStorage()`（写读删 `__oneMind_platform_probe__`），由系统判断。
- `reminder` 项固定 `passed`。
- 其它三项支持手动循环 `review → passed → failed → review`，存储在 `oneMind.phase2.validation`。
- 函数：`getPlatformChecklist()` / `toggleChecklistStatus(key)` / `resetChecklistStatus()`。
- `statusText(status)`：`passed | failed | 待复测`。

## 4. common/api.js

- 路径：[common/api.js](file:///Users/liam/Documents/workspace/oneMind/common/api.js)
- 作用：HTTP 客户端 + 后端所有 API 的封装。

### 4.1 配置与存储 key

- `API_ENABLED_KEY = "oneMind.api.enabled"`。
- `API_BASE_URL_KEY = "oneMind.api.baseUrl"`，默认 `http://127.0.0.1:8787`。
- `API_CACHE_KEY = "oneMind.api.contents.cache"`、`API_STATUS_KEY = "oneMind.api.status"`。
- `AUTH_TOKEN_KEY = "oneMind.auth.token"`、`AUTH_USER_KEY = "oneMind.auth.user"`。

### 4.2 工具

- `safeGetStorage` / `safeSetStorage`：try/catch 包装。
- `isBackendEnabled()` / `setBackendEnabled(enabled)` / `getBaseUrl()` / `setBaseUrl(url)` / `getApiStatus()` / `setApiStatus(status)`。
- `request(path, options)`：基于 `wx.request` 的 Promise 包装，自带 500ms 安全余量超时（`timeout + 500`）与 2xx 校验，自动附加 `Authorization: Bearer <token>`。
- `getAuthToken()` / `getAuthUser()` / `clearAuthSession()` / `saveAuthSession(token, user)`。
- `loginWithWechat(userInfo)`：先 `wx.login` 拿 `code`，再 `POST /api/auth/wechat/login` 写会话。

### 4.3 数据规范化

- `splitBodyToSegments(rawText)`：按换行 / 标点 / 空白 / 8 字符分块四级降级。
- `normalizeContent(item)`：把后端返回的内容项投影成统一结构（`id, title, category, body, preview, segments, lengthTier, lengthLevel, planDays, lengthLabel, dayText, festival, festivalTag, scene, hasAudio, accessLevel, defaultMode, supportedModes, supportsRecitation, recommendedRecitationTime, recitationTheme`）。
- `normalizeFestival(item)`：投影为 `{ id, name, date, deity, reason, recommendedContents[] }`，缺失推荐内容时从本地 `getLocalContents` 中按 `contentIds` 拼回。
- `getLocalContents()` / `getCachedContents()` / `findCachedContent(id)` / `listContents()`。
- `listFestivals()`。

### 4.4 业务 API

- `listMemoryPlansApi(userId)` → `GET /api/memory-plans?userId=`。
- `createMemoryPlanApi(payload)` → `POST /api/memory-plans`。
- `completeReviewTaskApi(taskId, result, extra)` → `POST /api/review-tasks/:id/complete`。
- `getNotificationSettingsApi()` → `GET /api/notification-settings`。
- `updateNotificationSettingApi(payload)` → `PUT /api/notification-settings`。
- `createNotificationJobApi(payload)` → `POST /api/notification-jobs`。
- `listNotificationJobsApi(limit)` → `GET /api/notification-jobs`。
- `listTodayFocusApi(userId)` → `GET /api/today-focus`。
- `getGrowthOverviewApi(userId)` → `GET /api/growth-overview`。
- `listRecitationGoalsApi(userId)` → `GET /api/recitation-goals`。
- `upsertRecitationGoalApi(contentId, payload)` → `PUT /api/recitation-goals/:contentId`。
- `createRecitationSessionApi(payload)` → `POST /api/recitation-sessions`。
- `healthCheck()`：后端可用 → `source: "backend"`，失败 → `source: "fallback"`。

### 4.5 错误降级策略

- `listContents()` 后端失败 → 优先返回缓存（`source: "cache"`），否则回退本地（`source: "fallback"`）。
- `listFestivals()` 后端失败 → 始终回退本地。
- `getCurrentUser()`：未登录返回 `{ loggedIn: false }`；已登录但远端失败时回退本地缓存用户。

## 5. 模块依赖关系

```text
content.js
  └─（无外部依赖）
memory.js
  ├─ content.js
  └─ api.js
platform.js
  └─（仅依赖 wx.* 与 storage）
api.js
  └─ content.js（用于 normalizeFestival 中回查本地内容）
```

页面层在 `require` 时按 `pages/home`、`pages/library` 等文件头部看到。
