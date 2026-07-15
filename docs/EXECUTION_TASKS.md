# 一念法藏执行任务清单（Phase 1-3）

更新时间：2026-07-01

## 0. 使用规则

- 本清单服务于近两周推进，覆盖 Phase 1 收口、Phase 2 多端验证、Phase 3 真链路。
- 每完成一项，将状态从 `TODO` 改为 `DONE`，并在 `MULTI_PLATFORM_PLAN.md` 同步更新阶段状态。
- 若新增任务，先补本清单再改代码，确保执行与文档一致。

状态标记：

- `TODO`
- `DOING`
- `DONE`
- `BLOCKED`

## 1. Phase 1 收口（前台 MVP 可演示）

目标：

- 形成稳定、可连续演示的前台闭环体验。

任务：

1. `DONE` 训练页视觉收口：顶部区、分段卡片、反馈按钮比例统一（含小屏适配）。
2. `DONE` 商城页视觉收口：商品卡片图文比例、按钮对齐、底栏安全区留白。
3. `DONE` 今日页任务组样式统一：科学/趣味/读诵三组卡片层级与间距。
4. `DONE` 我的页信息密度优化：成长指标区、计划区、提醒区层次清晰。
5. `DONE` 全局文案统一：模式命名、反馈文案、空状态文案一致性。
6. `DOING` 微信开发者工具 iPhone 机型基准复测（首页->选内容->训练已通过；训练结果回写“我的”页待补最终 UI 联测）。

完成标准：

- 主流程无阻断 UI 问题。
- 页面无明显溢出、遮挡、错位。
- 可连续演示 3 分钟不卡壳。

## 2. Phase 2 微信小程序验证

目标：

- 完成微信小程序第一轮基准可用性验证并形成差异清单。

任务：

1. `DOING` 微信端复测：安全区、SVG、本地存储、跳转、通知降级。
2. `DOING` 补齐首页 -> 选内容 -> 训练主链路基准复测，并补训练结果回写“我的”页联测，记录截图或关键结果。
3. `TODO` 补齐训练页、读诵页、商城页的安全区与滚动状态专项复测。
4. `DOING` 将验证结果回写 `PHASE2_VALIDATION_REPORT.md` 与 `MULTI_PLATFORM_PLAN.md` 矩阵。
5. `DOING` 明确微信端当前阻塞项（如真实登录、订阅消息、调试告警）及预计处理顺序。

完成标准：

- 验证矩阵中的微信端项目均有状态结果。
- 每个“失败/待修”项都有可执行修复动作。

## 3. Phase 3 真链路（后端能力从骨架到可用）

目标：

- 将“已接通骨架”推进到“真实可用链路”。

任务：

1. `TODO` 微信登录真实链路：`WECHAT_LOGIN_MODE=real` 联调与失败回退策略验证。
2. `TODO` 订阅消息真实发送链路（非 mock）：创建任务 -> 派发 -> 状态回写。
3. `TODO` 通知配置前后台一致性校验：开关、静默时段、派发日志。
4. `TODO` 今日任务接口压测（轻量）：确保三分组返回稳定。
5. `TODO` 管理后台补“训练/读诵统计”看板最小版。
6. `TODO` 关键接口验收回归：`/api/today-focus`、`/api/growth-overview`、`/api/recitation-sessions`。

完成标准：

- 至少 1 个真实用户可完成登录、创建计划、训练、读诵、收到提醒闭环。
- 后台可看到对应统计与审计痕迹。

## 4. 当前建议执行顺序（按本次检查重排）

1. 先补 `我的` 页长期中枢，把连续天数、读诵连续天数、里程碑和提醒设置补完整。
2. 再补管理后台运营控制台，让时间区间、组织、模式和内容类型可以筛选。
3. 接着补内容审核与发布流程，让后台能区分草稿、审核中、已发布和归档内容。
4. 然后把今日页拆回三类任务卡，保证科学复习、成长背诵、今日读诵一眼可见。
5. 再补商城的收藏、加购和最近浏览持久化，避免一直停留在静态演示。
6. 最后把节日专题入口做深，让节日推荐内容可以直接进入可执行动作。

## 5. 依赖与阻塞

- 微信开放平台配置（AppID/AppSecret）是 Phase 3 真链路前置条件。
- 其他平台图标与启动图缺失暂不阻塞当前轮次，后续恢复多端验证时再处理。
- 若本地端口或数据库连接不稳定，需优先保障 `8787 + onemind` 可用。
- 微信开发者工具在 `pages/library/index` 进入 `pages/practice/index` 后仍可能保留旧 webview 叠层；当前已能确认页面路径与训练页节点切换成功，但“训练结果回写到我的页”的稳定 UI 联测仍待补。
- 代码与规划一致：`practice/recitation` 属于二级页，`app-tabbar` 仅挂载在 `home/library/shop/profile` 顶层页，因此当前阻塞不应解读为“训练页缺少直达我的入口”的功能偏离。
- 已在 `pages/library/index.js` 增加“成功创建计划/加入读诵后先关闭弹层，再跳二级页”的修正，优先减少上一页遮罩残留对微信开发者工具显示层的干扰。

## 6. 本轮改进 TODO 清单（可直接开工）

### 6.1 P1 我的页升级为长期修持中枢

目标：

- 让用户在“我的”页看到完整的长期修持状态，而不是只看计划数量和演示订单。

主要文件：

- `pages/profile/index.js`
- `pages/profile/index.wxml`
- `pages/profile/index.wxss`
- `common/api.js`
- `common/memory.js`
- `backend/src/routes.js`

任务：

- [x] 接入读诵连续天数和最近里程碑展示，统一从 `getGrowthOverviewWithFallback()` 取数。
- [x] 接入提醒设置展示和修改入口，直接调用 `getNotificationSettingsApi()` 与 `updateNotificationSettingApi()`。
- [x] 把右上角“设置”按钮从单一 toast 改成可操作面板，支持查看授权状态、退出授权和进入提醒设置。
- [x] 增加多端自检入口，展示微信、iOS、Android、OHOS 的当前状态与最近结果。
- [x] 把“订单”区改成“设置 / 提醒 / 最近任务”面板，不再保留演示订单。
- [x] 完成后检查：刷新页面后，连续天数、读诵 streak、里程碑和提醒状态都能恢复显示。

状态：

- 已完成第一轮落地，当前 `我的` 页已切换为进度 + 设置双分区。

### 6.2 P1 后台升级为运营控制台

目标：

- 让管理后台从“静态列表”升级为可按维度查看和运营的控制台。

主要文件：

- `backend/admin/index.html`
- `backend/admin/admin.js`
- `backend/admin/admin.css`
- `backend/src/routes.js`
- `backend/src/repositories/postgresStore.js`

任务：

- [x] 在后台顶部增加时间区间筛选，至少支持 7 天、30 天、自定义起止日期。
- [x] 增加组织筛选、内容类型筛选和模式筛选，让列表和指标都能按同一条件刷新。
- [x] 在仪表盘里补上训练/读诵趋势、科学/趣味计划占比和最近派发记录。
- [x] 把通知任务做成列表，而不是只有一个“派发提醒”按钮，至少能看 pending / sent 状态。
- [x] 支持组织切换，不再默认只看第一家组织。
- [x] 完成后检查：切换筛选条件时，指标、内容、资产、计划、读诵和审计日志都跟着联动变化。

状态：

- 已完成第一轮筛选基线，当前后台支持最近 7 天 / 最近 30 天 / 自定义日期区间。
- 已补组织 / 内容类型 / 训练模式筛选，当前会联动概览指标、内容库、组织资产、最近计划、最近读诵和审计日志。
- 已补后台提醒任务列表，当前可查看 pending / sent 状态，并从后台触发一次派发。
- 已补训练 / 读诵趋势、科学 / 趣味计划占比和最近派发面板，`/api/admin/overview` 会返回 `practiceTrend / recitationTrend / modeDistribution / recentDispatches`。
- 已取消“组织成员”默认落到第一家组织的行为，当前必须显式选择组织后才允许成员写入，内容和资产新增也会优先继承当前筛选组织。
- 已完成一轮接口与后台页回归：`contentCount` 可随 `organizationId/type/mode` 联动收缩，最近派发聚合也能纳入已发送任务。

### 6.3 P1 内容管理补齐审核与版本操作

目标：

- 让内容管理真正支持“编辑 - 审核 - 发布 - 归档”的流程，而不是只改当前发布内容。

主要文件：

- `backend/admin/index.html`
- `backend/admin/admin.js`
- `backend/src/routes.js`
- `backend/src/repositories/postgresStore.js`
- `docs/ADMIN_BACKEND_REQUIREMENTS.md`

任务：

- [x] 在内容表单里补上发布状态和审核状态的编辑入口，至少能区分 draft / reviewing / published / archived。
- [x] 增加“复制为新版本”操作，避免直接覆盖已发布内容。
- [x] 新增后台内容总览接口，让管理员能看到未公开内容，而不只是 `/api/contents` 的公开列表。
- [x] 让内容模式配置在编辑内容时同步可见，确认 `defaultMode`、`supportedModes` 和 `supportsRecitation` 一起保存。
- [x] 把内容审核/发布动作写进审计日志，保证内容状态变化可追踪。
- [x] 完成后检查：后台可以区分不同内容状态，发布前有审核记录，修改已发布内容时有版本痕迹。

状态：

- 已补管理员专用内容总览接口 `GET /api/admin/contents`，当前可按 `organizationId / type / mode / publishStatus / reviewStatus` 查看未公开内容。
- 已在后台内容表单补上发布状态、审核状态、来源说明、版本说明字段，内容列表也会直接展示状态组合。
- 已验证 `draft + reviewing` 内容可创建、可按状态筛选、可归档且仍能在后台按 `archived` 状态查到。
- 已验证审计日志写入 `content.created / content.archived`，并在代码里补上发布状态和审核状态变更审计入口。
- 已补 `POST /api/admin/contents/:id/copy-version` 与 `GET /api/admin/contents/:id/versions`，后台可从已发布内容复制出新的草稿版本，并保留 `sourceContentId / sourceVersionNo` 关联。
- 已验证复制新版本后，后台总览能看到 `draft + reviewing` 草稿，版本列表能看到 `v1` 快照；继续修改已发布内容后，版本列表会自动追加 `v2` 快照。
- 已验证内容模式配置在后台编辑表单中与发布状态一起保存，`defaultMode / supportedModes / supportsRecitation` 会随管理员内容接口一起返回。

### 6.4 P2 今日页按三分组展示与节日直达

目标：

- 让用户一打开首页就能分清今天要做什么，并能从节日入口直接进入推荐内容。

主要文件：

- `pages/home/index.js`
- `pages/home/index.wxml`
- `pages/home/index.wxss`
- `common/memory.js`
- `backend/src/routes.js`

任务：

- [x] 把首页从单一 `dueList` 改成三块任务区，分别展示科学复习、成长背诵和今日读诵。
- [x] 保留“开始第一个待办”作为快捷入口，但不要再让三组任务混成一条列表。
- [x] 节日卡补上推荐内容 chip，点击后直接跳到对应内容或对应模式，不要只回到内容库。
- [x] 空状态下分别给出明确引导，例如先去选内容、先加入读诵或先复习今天第一段。
- [x] 完成后检查：用户能在首页一眼看出今日优先级，节日入口能直接带动内容转化。

状态：

- 已把首页任务区固定为三组：`科学背诵 / 成长背诵 / 今日读诵`，不再只按单一 `dueList` 直接渲染。
- 已保留“开始复习”快捷入口，当前仍优先拉起第一个待办，但下面的任务主体已切成分组卡片。
- 已给节日卡补上推荐内容 chips，当前可直接跳到对应内容训练页，不再只能回到内容库。
- 已给三组任务分别补空状态文案和动作按钮，科学 / 成长 / 读诵会给出不同引导。
- 已更新 `tools/check-home-parity.mjs` 以匹配新的三分组基线，当前 `node tools/check-home-parity.mjs` 已通过。
- 已于 `2026-07-01` 在微信开发者工具 Stable `v2.01.2510290` 的 `iPhone 15 Pro Max` 模拟器完成回归：
- 首页能直接看到 `今日修持 / 今日三类任务 / 科学背诵 / 成长背诵 / 今日读诵` 层级，安全区、底栏和主要卡片未出现遮挡。
- 点击节日推荐 chip `大悲咒·开头段` 后，页面路径从 `pages/home/index` 直接进入 `pages/practice/index`。
- 点击节日卡主体区域后，同样直接进入 `pages/practice/index`，验证 `openFestival()` 已优先带到推荐内容，而不是回内容库。
- 调试器仍有一条 `Error: timeout` 告警，当前不阻断 6.4 的分组展示与节日直达链路，后续可在独立轮次继续排查。

### 6.5 P2 商城补持久化与转化路径

目标：

- 让商城不只是静态商品墙，而是能留下真实偏好和行动痕迹。

主要文件：

- `pages/shop/index.js`
- `pages/shop/index.wxml`
- `pages/shop/index.wxss`
- `pages/profile/index.js`
- `common/api.js`

任务：

- [x] 把收藏状态从纯内存改为本地持久化，重启后还能保留。
- [x] 把加购计数和最近查看记录也持久化，避免页面刷新后全丢。
- [x] 把“订单记录”改成收藏 / 最近浏览 / 意向单中的一种真实来源，不再显示硬编码 demo 数据。
- [x] 已明确浏览、收藏、加购埋点接口作为后续转化分析扩展项，本轮先不阻塞 6.5 收口。
- [x] 完成后检查：用户重启小程序后仍能看到收藏和加购状态，商城能反映偏好而不是只是一组静态卡片。

状态：

- 已新增 `common/shop.js` 统一管理商城本地状态，当前会通过 `oneMind.shop.state.v1` 持久化收藏、最近浏览与加购记录。
- 商城页已补齐 `shopStats / recentViewProducts / preferencePanel`，顶部统计卡、最近看过和意向记录都会直接反映真实本地偏好。
- “意向记录”区已不再展示硬编码演示订单，而是按 `加购 -> 最近浏览 -> 收藏` 的优先级回显真实来源。
- 已更新 `tools/check-shop-parity.mjs`，当前 `node tools/check-shop-parity.mjs`、`node --check common/shop.js`、`node --check pages/shop/index.js` 均通过。
- 已于 `2026-07-01` 在微信开发者工具 Stable `v2.01.2510290` 的 `iPhone 15 Pro Max` 模拟器完成回归：
- 进入 `pages/shop/index` 后，打开商品详情会立即写入最近浏览，顶部统计从 `0` 变为 `1`，并在“最近看过”区出现对应商品。
- 点击“加入购物车”后，右上角购物车角标、顶部“加购”统计和“意向记录”卡片会同步更新为真实加购记录。
- 点击商品星标后，“收藏”tab 计数会变为 `收藏 (1)`，切到收藏页仅展示已收藏商品，确认来源不再是静态卡片。
- 点击模拟器“刷新页面”后，收藏 / 最近看过 / 加购三项状态仍保留，确认本轮链路已满足本地持久化要求。

### 6.6 P2 节日专题运营增强

目标：

- 让节日专题真正成为内容运营入口，而不是首页上的一个装饰性卡片。

主要文件：

- `backend/src/routes.js`
- `backend/src/repositories/postgresStore.js`
- `backend/admin/index.html`
- `backend/admin/admin.js`
- `pages/home/index.js`
- `pages/library/index.js`

任务：

- [x] 增加节日专题的后台编辑入口，支持说明、推荐内容和发布状态维护。
- [x] 让节日专题可以直接维护推荐内容排序，而不是只在 seed 里写死。
- [x] 前台首页节日卡支持直达推荐内容，并保留来源信息，方便后续看转化。
- [x] 内容库页支持从节日专题筛选推荐内容，方便用户顺着专题继续修持。
- [x] 完成后检查：节日入口能带着推荐内容直接转到执行动作，而不是只停在“看看”的层面。

结果记录：

- 已补齐后台节日专题仓储与管理接口：`GET/POST/PUT/DELETE /api/admin/festivals`，支持说明、发布日期、关联主题、发布状态与推荐内容顺序维护。
- 管理后台已新增“节日专题”面板，支持新建、编辑、归档，以及对推荐内容执行添加、移除、上移、下移操作，不再依赖 seed 写死专题内容。
- 首页节日卡已补来源文案、专题推荐 chip 与“查看专题内容”按钮：chip 直达 `pages/practice/index`，按钮跳到带专题过滤的 `pages/library/index`。
- 内容库页已新增专题 pill、专题 spotlight 与清除筛选动作，进入专题后只显示该专题推荐内容，长咒系列入口也会按专题范围重算。
- 已更新 `tools/check-home-parity.mjs` 与 `tools/check-library-parity.mjs`；`node tools/check-home-parity.mjs`、`node tools/check-library-parity.mjs`、`cd backend && npm run check`、`cd backend && npm run admin:build` 均通过。
- 已于 `2026-07-01` 在微信开发者工具 Stable `v2.01.2510290` 的 `iPhone 15 Pro Max` 模拟器完成回归：
- 首页点击“查看专题内容”后进入 `pages/library/index`，显示专题筛选 pill、专题说明和 `清除` 按钮，且初始仅筛出当前专题推荐内容。
- 在内容库点击 `清除` 后恢复全量内容列表，确认专题筛选可以安全退出。
- 在首页节日卡点击专题推荐 chip 后，页面路径直接进入 `pages/practice/index`，确认节日入口已能直接带到执行动作。
