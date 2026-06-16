# 06 · 后端（backend/）

后端是 Phase 3 的本地骨架：纯 Node.js 标准库实现，提供内容 / 计划 / 任务 / 读诵 / 通知 / 组织 / 资产 / 审计 / 管理员的 REST 接口。

## 1. 启动与依赖

- 入口：[backend/src/server.js](file:///Users/liam/Documents/workspace/oneMind/backend/src/server.js)
- 配置：[backend/package.json](file:///Users/liam/Documents/workspace/oneMind/backend/package.json)
  - `start: node src/server.js`
  - `check: node --check <每个源文件>`
  - `engines.node: ">=18"`
  - 无外部 `dependencies`。
- 监听：`PORT`（默认 8787）、`HOST`（默认 `127.0.0.1`）。
- 启动日志：`oneMind backend listening at http://${HOST}:${PORT}`。

## 2. 进程模型

- `http.createServer` 直接处理请求，1 MB body 限制。
- `OPTIONS` 预检直接 200 放行。
- 统一 JSON 响应头：`Access-Control-Allow-Origin: *`、`Content-Type: application/json; charset=utf-8`。
- 错误统一由 `sendJson(res, error.statusCode || 500, { error })` 输出。

## 3. 路由（backend/src/routes.js）

- 入口函数 `handleRequest(req, res, body)`。
- 静态资源：`/`、`/admin`、`/admin/*` → `backend/admin/` 下的文件。
- 健康检查：`GET /health` → `{ ok, service, phase, storeMode }`。
- 鉴权工具：
  - `resolveAdminCredentials` / `resolveAdminSession` / `resolveUserSession`：从 `Authorization: Bearer <token>` 解析会话。
  - `requiresAdminAuth(method, pathname)` / `getRequiredPermission(method, pathname)` / `hasAdminPermission(role, permission)`。
  - `createSignedToken(payload, secret, expiresIn, type)`：基于 `crypto.createHmac('sha256', secret).update(payload + exp + type)`。
- 角色权限矩阵（`ROLE_PERMISSIONS`）：
  - `super_admin`：`admin.read` / `content.write` / `content.publish` / `asset.write` / `asset.publish` / `asset.access.manage` / `organization.member.manage`。
  - `platform_ops`：`admin.read` / `content.write` / `content.publish` / `asset.write`。
  - `content_editor`：`admin.read` / `content.write` / `asset.write`。
  - `content_reviewer`：`admin.read` / `content.publish` / `asset.publish`。
  - `organization_admin`：与 `super_admin` 同。
  - `asset_maintainer`：`admin.read` / `asset.write`。
  - `readonly_member`：`admin.read`。
- 路由分支（节选）：
  - 用户：`POST /api/auth/wechat/login`、`GET /api/auth/me`。
  - 内容：`GET /api/contents`、`GET /api/contents/:id`、`GET /api/festivals`。
  - 计划：`GET /api/memory-plans`、`POST /api/memory-plans`。
  - 任务：`POST /api/review-tasks/:id/complete`。
  - 今日 / 成长：`GET /api/today-focus`、`GET /api/growth-overview`。
  - 读诵：`GET /api/recitation-goals`、`PUT /api/recitation-goals/:contentId`、`POST /api/recitation-sessions`。
  - 通知：`GET /api/notification-settings`、`PUT /api/notification-settings`、`POST /api/notification-jobs`、`GET /api/notification-jobs`。
  - 管理：`POST /api/admin/login`、`GET /api/admin/session`、`GET /api/admin/overview`、`POST /api/admin/contents`、`PUT/DELETE /api/admin/contents/:id`、`POST /api/admin/assets`、`PUT/DELETE /api/admin/assets/:id`、`POST /api/admin/notification-jobs/dispatch`。
  - 组织与资产：`GET /api/organizations`、`GET /api/organizations/:id/assets`、`POST /api/organizations/:id/members`、`PUT /api/assets/:id/access`。
  - 审计：`GET /api/audit-logs`。

## 4. 仓库层（repositories/）

- 入口 [backend/src/repositories/store.js](file:///Users/liam/Documents/workspace/oneMind/backend/src/repositories/store.js)：
  - 默认 `activeStore = memoryStore`、`storeMode = "memory"`。
  - 尝试 `require('./postgresStore')` 并 `initializeDatabase()`。成功则切到 `postgres`，失败则 `console.warn`。
  - 通过 `getStoreMode()` 暴露当前模式。
- 内存仓库 [backend/src/repositories/memoryStore.js](file:///Users/liam/Documents/workspace/oneMind/backend/src/repositories/memoryStore.js)：
  - 状态对象 `state`：`users` / `plans` / `tasks` / `reviewRecords` / `practiceSessions` / `recitationGoals` / `recitationSessions` / `notificationSettings` / `notificationJobs` / `organizations` / `organizationMembers` / `assets` / `auditLogs` / `usersByOpenId`。
  - 工具：`todayDate()` / `addDays(dateString, days)` / `createId(prefix)` / `normalizeMode` / `normalizeSupportedModes` / `buildReviewOffsets` / `splitBodyToSegments` / `normalizeSegments` / `normalizeGrowthStage` / `scientificReasonText` / `calculateDailyStreak` / `hashValue` / `toContentSummary` / `toContentDetail` / `toAssetSummary` / `appendAuditLog`。
  - 内容：`listContents(filters)` / `createContent(payload)` / `updateContent(contentId, payload)` / `archiveContent(contentId)` / `getContent(contentId)` / `listFestivals()`。
  - 计划与任务：`listPlans(userId)` / `createPlan({ userId, contentId, startDate, mode })` / `completeTask({ taskId, result, selfRating, latencyBand, mistakeCount, note })`。
  - 用户与会话：`loginByWechatCode(payload)` / `getUserById(userId)`。
  - 通知：`getNotificationSettings(userId)` / `upsertNotificationSetting({ userId, channel, enabled, quietHours })` / `createNotificationJob({ userId, taskId, channel, scheduledAt, payload })` / `listNotificationJobs({ userId, limit })` / `dispatchNotificationJobs({ dueBefore, limit })`。
  - 成长 / 读诵：`getGrowthOverview(userId)` / `listRecitationGoals(userId)` / `upsertRecitationGoal({ userId, contentId, goalType, preferredPeriod, dailyTargetCount })` / `createRecitationSession({ ... })`。
  - 今日：`listTodayFocus(userId)`。
  - 仪表盘：`getDashboard()`。
  - 组织 / 资产 / 审计：`listOrganizations()` / `listOrganizationAssets(organizationId, filters)` / `createAsset` / `updateAsset` / `archiveAsset` / `updateAssetAccess` / `addOrganizationMember` / `listAuditLogs`。
- PostgreSQL 仓库 [backend/src/repositories/postgresStore.js](file:///Users/liam/Documents/workspace/oneMind/backend/src/repositories/postgresStore.js)：
  - 通过 `child_process.execFileSync` 调用系统 `psql` 客户端（`resolvePsqlBinary` 自动从 PATH / 常见路径中查找）。
  - 连接配置（`DB_CONFIG`）：`PGHOST=127.0.0.1` / `PGPORT=5432` / `PGUSER=magic` / `PGPASSWORD=Noending5@` / `PGDATABASE=onemind`。
  - `IDS`：预定义 demo-user / admin / organization / 5 条内容 / 2 个节日 / 3 个资产的固定 UUID；`LEGACY_ID_MAP` 兼容老 id（`om-mani` → `six-syllable-mantra` 等）。
  - `DEFAULT_ADMIN_SEEDS`：`magic` (super_admin) / `editor` (content_editor) / `reviewer` (content_reviewer)，可通过环境变量覆盖。
  - `initializeDatabase()`：读取 `backend/schema.sql` 并执行。
  - 提供与 `memoryStore` 对齐的接口语义。
  - **注意**：对 SQL 输入做了 `escapeSqlString` 转义（单引号双写）以避免简单注入。

## 5. 种子数据 [backend/src/data/seed.js](file:///Users/liam/Documents/workspace/oneMind/backend/src/data/seed.js)

- 5 条内容：六字大明咒 / 绿度母心咒 / 金刚经·结尾偈 / 心经·核心段 / 大悲咒·开头段。
- 2 个节日：观音菩萨圣诞、药师佛圣诞。
- 1 个组织：一念法藏示范空间。
- 数字资产：3 个示例（含公开音频 / 唐卡 / 私用仪轨）。
- 审计日志：少量初始记录。

## 6. Admin Web

详见 [07-admin.md](file:///Users/liam/Documents/workspace/oneMind/wiki/07-admin.md)。

- 路径 [backend/admin/index.html](file:///Users/liam/Documents/workspace/oneMind/backend/admin/index.html)。
- 资源 [backend/admin/admin.css](file:///Users/liam/Documents/workspace/oneMind/backend/admin/admin.css)、[backend/admin/admin.js](file:///Users/liam/Documents/workspace/oneMind/backend/admin/admin.js)。
- 默认账号：`magic / Noending5@`（`super_admin`）、`editor / Noending5@`（`content_editor`）、`reviewer / Noending5@`（`content_reviewer`）。

## 7. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | HTTP 端口 |
| `HOST` | `127.0.0.1` | 监听地址 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `magic` / `Noending5@` | 内存模式默认超级管理员 |
| `ADMIN_EDITOR_USERNAME` / `ADMIN_EDITOR_PASSWORD` | `editor` / `Noending5@` | PostgreSQL 模式默认内容编辑 |
| `ADMIN_REVIEWER_USERNAME` / `ADMIN_REVIEWER_PASSWORD` | `reviewer` / `Noending5@` | PostgreSQL 模式默认审核员 |
| `ADMIN_TOKEN_SECRET` | `oneMind-local-admin` | 管理员 token 签名密钥 |
| `USER_TOKEN_SECRET` | `oneMind-local-user` | 用户 token 签名密钥 |
| `ADMIN_TOKEN_EXPIRE_SECONDS` | `604800` | 管理员 token 过期 |
| `USER_TOKEN_EXPIRE_SECONDS` | `2592000` | 用户 token 过期 |
| `DEMO_USER_ID` | `demo-user` | 未登录时默认 userId |
| `WECHAT_LOGIN_MODE` | `mock` | `mock` / `hybrid` / `real` |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 空 | 真实微信登录所需 |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | `127.0.0.1` / `5432` / `magic` / `Noending5@` / `onemind` | PostgreSQL 连接 |

## 8. 本地启动

```bash
cd backend
npm run check       # 语法检查（无需安装依赖）
npm start           # 启动后端
```

打开 `http://127.0.0.1:8787/admin` 进入管理后台。
打开 `http://127.0.0.1:8787/health` 验证服务。
