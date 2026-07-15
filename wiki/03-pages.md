# 03 · 页面详解

每个页面对应一组 `.js / .wxml / .wxss / .json` 四件套。下文按页面逐个说明职责、关键状态、关键函数与跳转去向。

## 1. 今日 pages/home

- 路径：[pages/home/index.js](file:///Users/liam/Documents/workspace/oneMind/pages/home/index.js)
- 模板：[pages/home/index.wxml](file:///Users/liam/Documents/workspace/oneMind/pages/home/index.wxml)
- 状态：
  - `scientificTasks` / `playfulTasks` / `recitationTasks`：后端 `listTodayFocus` 返回的三类任务。
  - `dueList`：将三类任务统一压平为首页卡片，每项带 `openType`（`practice` 或 `recitation`）。
  - `allDone`、`totalFocusCount`、`dateLabel`、`streakDays`、`hasPlans`、`featuredFestival`、`festivalSource`。
- 关键函数：
  - `withTimeout(promise, fallback, timeout)`：统一为后台请求加兜底超时。
  - `formatDateLabel()`：拼出 `M月D日 · 星期X`。
  - `estimateMinutesByCategory(category, totalDays)`：按内容类型估算训练时长（短咒 / 短偈 3 分钟、长咒 12 分钟、其余按天数 2 倍夹在 4~10）。
  - `onShow()`：并发拉取 `syncPlansFromBackend` / `listTodayFocusWithFallback` / `listFestivals` / `getGrowthOverviewWithFallback`，超时分别为 2200 / 2600 ms。
  - `openPractice(event)` / `openRecitation(event)` / `openDueItem(event)` / `startFirstDue()`：根据 `openType` 跳转 `pages/practice` 或 `pages/recitation`。
  - `goLibrary()` / `openFestival()`：`wx.reLaunch` 到选内容页。
- 跳转：
  - 训练卡 → `/pages/practice/index?id=&planId=`。
  - 读诵卡 → `/pages/recitation/index?id=&goalId=&period=`。
  - 节日卡 / 「去选内容」→ `/pages/library/index`（`reLaunch`）。

## 2. 选内容 pages/library

- 路径：[pages/library/index.js](file:///Users/liam/Documents/workspace/oneMind/pages/library/index.js)
- 模板：[pages/library/index.wxml](file:///Users/liam/Documents/workspace/oneMind/pages/library/index.wxml)
- 状态：
  - `filters: ["全部", "短咒", "短偈", "经文片段", "长咒"]`，`activeFilter`。
  - `contents` / `filteredContents` / `longSeries`。
  - `picked`、`modeCards`（按 `supportedModes` + `supportsRecitation` 生成）、`showLongTip`。
  - `contentSource: "本地演示数据" | "后台已连接" | "后台不可用..."`。
- 关键函数：
  - `buildModeCards(content)`：根据 `supportedModes` 与 `supportsRecitation` 拼出 1~3 张模式卡（科学背诵 / 趣味背诵 / 日常读诵）。
  - `onShow()`：先 `syncPlansFromBackend()` 再 `loadContents()`。
  - `loadContents()` → `listContents()`，并将 `attachPlanState` 计算的 `inPlan` / `planCount` 注入每条内容。
  - `attachPlanState(contents)`：按 `getPlanRows()` 标注 `inPlan`。
  - `buildLongSeries(contents)`：统计 `lengthTier === "long"` 的内容，用于「长咒修持 · 系列入口」卡片。
  - `pickContent(event)` / `pickLongSeries()` / `closeSheet()`：底部动作面板（Action Sheet）状态。
  - `acceptPlan(event)` → `createPlanWithFallback(content, mode)` → 成功后 `wx.navigateTo` 训练页。
  - `startRecitation()` → `saveRecitationGoalWithFallback(content, { goalType, preferredPeriod, dailyTargetCount })` → 跳读诵页。
  - `goHome()`：回到今日。
- 跳转：
  - 模式卡确认 → `/pages/practice/index?id=&planId=`。
  - 读诵按钮 → `/pages/recitation/index?id=&goalId=&period=`。
  - 「回到今日」 → `/pages/home/index`。

## 3. 复习计划 pages/plan

- 路径：[pages/plan/index.js](file:///Users/liam/Documents/workspace/oneMind/pages/plan/index.js)
- 模板：[pages/plan/index.wxml](file:///Users/liam/Documents/workspace/oneMind/pages/plan/index.wxml)
- 状态：`plans`（来自 `getPlanRows`）、`hasPlans`。
- 关键函数：
  - `onShow()`：`syncPlansFromBackend()` 后 `getPlanRows()`。
  - `goBack()`：`wx.navigateBack`。
- 渲染：每条计划展示 `title` / `masteryScore` / `state`（`已背会` / `复习中`），节点列表 `taskRows` 按 `dayIndex + 1` 渲染「第 N 天 · method」+ 完成状态。

## 4. 训练 pages/practice

- 路径：[pages/practice/index.js](file:///Users/liam/Documents/workspace/oneMind/pages/practice/index.js)
- 模板：[pages/practice/index.wxml](file:///Users/liam/Documents/workspace/oneMind/pages/practice/index.wxml)
- 状态：
  - `content` / `method` / `mode` / `scene` / `currentDay` / `totalDays` / `planId`。
  - `progressPct` / `revealed` / `displaySegments`。
  - `recommendation`、`growthStage`、`planState`、`riskTitle` / `riskBody`。
  - 文案集：`heroLabel` / `helperText` / `insightTitle` / `insightBody` / `feedbackLabel` / `strongerTitle` / `strongerSub` / `primaryTitle` / `primarySub`。
  - 步骤状态：`stepIndex` / `stepTotal` / `stepTitle`，对应 `TRAINING_STEPS`（`read` → `first` → `mask` → `blank` → `feedback`）。
- 关键函数：
  - `TRAINING_STEPS`：固定五步训练法（拆段跟读 / 首字提示 / 遮挡回忆 / 填空回填 / 本次反馈）。
  - `getStatusBarHeight()`：从 `wx.getWindowInfo` 或 `wx.getSystemInfoSync` 读取并与 `wx.getMenuButtonBoundingClientRect().top` 取最大值（保底 20）。
  - `makeDisplaySegments(content, method, revealed)`：根据 `method` 把每段渲染成不同遮挡形式：
    - `拆段跟读`：全文显示。
    - `首字提示`：每段首字 + `__`。
    - `遮挡回忆`：每段替换为等长 `•`。
    - 其他（`填空复现` / 默认）：保留前半段、剩余字符替换为 `＿`。
  - `calcProgress(content, revealed)`：根据已揭开段数 / 总段数计算百分比。
  - `recommendNextContent(currentContent)`：从缓存或本地内容中按同类别推荐下一段。
  - `buildScientificInsight(plan, task)` / `buildModeCopy(mode, plan, task)`：按模式生成「今天为什么轮到这段」文案。
  - `onLoad(options)`：同步拉取 → 定位 `plan` / `task` / `step` / `mode` / `risk` 信息 → 渲染。
  - `reveal(event)`：揭开某一段，更新 `revealed` / `displaySegments` / `progressPct`。
  - `prevStep()` / `nextStep()` / `switchStep(stepIndex)`：步骤切换；`feedback` 步骤不可点揭开。
  - `openFullText()` → `pages/recitation`。
  - `goBack()` → `wx.navigateBack`。
  - `needsWork()` / `stronger()` / `mastered()` → 各自组装 `metrics`（自评、反应时、错误数），调 `finishPractice(result, title, metrics)`。
  - `finishPractice(result, title, metrics)`：调用 `completeTaskWithFallback(planId, result, metrics)`，完成后切换为「推荐下一段」视图。
  - `startRecommendation()`：从推荐内容创建计划，`wx.redirectTo` 到新的训练页。
- 跳转：
  - 「查看全文」→ `/pages/recitation/index?id=&period=theme`。
  - 「开始推荐」→ 重建计划后 `/pages/practice/index?id=&planId=`（`redirectTo`）。

## 5. 我的 pages/profile

- 路径：[pages/profile/index.js](file:///Users/liam/Documents/workspace/oneMind/pages/profile/index.js)
- 模板：[pages/profile/index.wxml](file:///Users/liam/Documents/workspace/oneMind/pages/profile/index.wxml)
- 状态（节选）：
  - `subTab: "progress" | "settings" | "platform"`，对应三栏切换。
  - `stats: { reviewing, atRisk, mastered }`。
  - `growthOverview: { memorizationStreak, recitationStreak, masteredCount, latestMilestone }`。
  - `auth: { loggedIn, nickname, avatarUrl, avatarInitial, statusText }`。
  - `notificationSettings: [{ channel, enabled, quietHours, ... }]`，`notificationJobs: [...]`。
  - `platformLabel` / `platformDetailText` / `reminderStrategy` / `reminderCapabilities` / `platformChecklist`。
  - `plans` / `reviewingPlans` / `riskPlans` / `donePlans` / `selectedPlanId` / `curveChart` / `curveCurrentDay` / `curveTotalDays`。
- 关键函数：
  - `buildCurveData(totalDays)` / `buildCurveChart(currentDay, plotWidth, plotHeight)`：根据 `retention = 100 * exp(-0.4 * day) + 5` 公式生成 0~30 天的留存曲线。
  - `appendModeToDuplicateTitles(plans)`：重名时附上「· 趣味 / · 科学」。
  - `normalizeNotificationSettings(settings)`：合并默认 / 缓存 / 远端为统一形态，附加 `channelLabel` / `quietHoursText` / `enabledText` / `toggleText`。
  - `normalizeRecitationGoals(goals)`：附加 `preferredPeriodLabel` / `goalTypeLabel` / `statusLabel` / `dailyTargetText`。
  - `refreshData()`：同步拉取 → 拼装 `plans` / `stats` / `summaryText` → 调 `refreshCurveData()` / `refreshPlatformPanel()` / `refreshGrowth()` / `refreshAuth()` / `refreshNotificationPanel()`。
  - `authorizeWechatLogin()`：在 `isBackendEnabled()` 时调用 `wx.getUserProfile` + `loginWithWechat()`。
  - `logoutWechat()`：`clearAuthSession()`。
  - `toggleNotificationSetting(event)`：本地或远端写入。
  - `toggleChecklistItem(event)` / `resetPlatformChecklist()`：操作 Phase 2 自检清单。
  - `changeCurvePlan(event)` / `refreshCurveData()` / `measureAndBuildCurveChart()` / `drawCurveCanvas(...)`：选择计划 → 测量容器尺寸 → 重建曲线 → `canvas.getContext("2d")` 绘制（带 DPR 适配与 token 防并发）。
  - `changeSubTab(event)`：切换 `progress` / `settings` / `platform`。
  - `openRecitation(event)` / `openPractice(event)`：跳到对应二级页。
- 跳转：
  - 读诵卡 → `/pages/recitation/index`。
  - 训练卡 → `/pages/practice/index`。
  - 「选内容」按钮 → `wx.reLaunch` 到 `/pages/library/index`。

## 6. 读诵 pages/recitation

- 路径：[pages/recitation/index.js](file:///Users/liam/Documents/workspace/oneMind/pages/recitation/index.js)
- 模板：[pages/recitation/index.wxml](file:///Users/liam/Documents/workspace/oneMind/pages/recitation/index.wxml)
- 状态：
  - `content` / `goalId` / `period`。
  - `headerTop` / `roundCount`（1~9）。
  - `completed` / `playing` / `liked` / `looping` / `speed`（0.75 / 1 / 1.25 / 1.5）。
  - `progress`（0~1）/ `activeLine` / `currentTimeText` / `totalTimeText`。
  - `practiceTip`（长文 / 短文 / 缺省三种模板）/ `dailyDurationText`。
- 关键函数：
  - `getStatusBarHeight()`：与训练页一致。
  - `buildPracticeTip(content)`：按 `seriesId` / 普通 / 缺省 三档生成提示。
  - `onLoad(options)`：定位 `content`（`findContent` → `findCachedContent` → null），计算 `headerTop` / `dailyDurationText`，同步播放视图。
  - `onUnload()`：清理播放定时器。
  - `increaseRound()` / `decreaseRound()`：调整轮数。
  - `completeRecitation()` → `completeRecitationWithFallback()`。
  - `toggleLike()` / `togglePlay()` / `toggleLooping()` / `cycleSpeed()` / `skipBackward()` / `skipForward()` / `onSliderChanging/Change()`。
  - `startPlaybackTicker()` / `stopPlaybackTicker()`：每 500ms 推进一次进度（按 speed 比例）。
  - `syncPlaybackView()`：根据 `progress` 计算 `activeLine` / `totalSec` / `curSec` / `formatTime`。
  - `formatTime(totalSeconds)`：标准 `m:ss`。
- 跳转：
  - 返回 → `wx.navigateBack`。
  - 空内容 → 「返回上一页」。

## 7. 商城 pages/shop

- 路径：[pages/shop/index.js](file:///Users/liam/Documents/workspace/oneMind/pages/shop/index.js)
- 模板：[pages/shop/index.wxml](file:///Users/liam/Documents/workspace/oneMind/pages/shop/index.wxml)
- 状态：
  - `categories: ["经文音频", "唐卡 · 壁纸", "图鉴", "收藏"]`，`activeCategory`。
  - `products: PRODUCTS`（8 个静态商品）/ `visibleProducts` / `featuredProduct`（`isFeatured`）。
  - `favorites: string[]` / `cartCount: number` / `selectedProduct`。
- 关键函数：
  - `onShow()` → `refreshProducts()`。
  - `switchTab(event)`：切换分类并刷新可见商品。
  - `toggleFavorite(event)`：本地收藏集合（内存内，不持久化到 storage）。
  - `openProduct(event)` / `closeProduct()`：商品详情弹层。
  - `addToCart()`：模拟加购（仅 `cartCount + 1`，弹 toast）。
  - `refreshProducts()`：按当前分类过滤；若为「收藏」则按 `favorites` 过滤；同时打 `isFavorite` 标记。
- 跳转：当前仅在页面内部操作，无外部跳转。

## 8. 跨页面跳转关系图

```text
                ┌───────────────┐
                │  今日 home    │
                └──┬────────┬───┘
                   │        │
     openPractice  │        │  openRecitation
                   ▼        ▼
        ┌────────────┐  ┌────────────┐
        │ 训练 page  │  │ 读诵 page  │
        └─────┬──────┘  └─────┬──────┘
              │ 「查看全文」  │ 「读诵完成」
              ▼               │
        ┌────────────┐        │
        │ 读诵 page  │◀───────┘
        └────────────┘

                ┌───────────────┐
                │  选内容 library│ ── acceptPlan ──▶ 训练 page
                └───────┬───────┘
                        │ startRecitation
                        ▼
                  读诵 page

                ┌───────────────┐
                │   我的 profile │ ─ openRecitation ─▶ 读诵
                └───────┬───────┘
                        │ openPractice
                        ▼
                     训练 page

        底栏 4 项（home / library / shop / profile）通过 app-tabbar.reLaunch 互跳。
```
