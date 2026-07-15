# 09 · API 契约

后端为前台 / 管理后台提供 REST API。完整且权威的描述见 [docs/API_CONTRACT.md](file:///Users/liam/Documents/workspace/oneMind/docs/API_CONTRACT.md)；本 Wiki 给出端点速查。

## 1. 通用约定

- Base URL：`http://127.0.0.1:8787`（可由 `process.env.HOST / PORT` 与 `oneMind.api.baseUrl` 覆盖）。
- 数据格式：`application/json`。
- 时间字段：ISO 8601；日期字段：`YYYY-MM-DD`。
- 鉴权：受保护接口需 `Authorization: Bearer <token>`；Admin token 以 `adm` 为前缀签名，User token 以 `usr` 为前缀签名。
- 默认用户：未登录时使用 `process.env.DEMO_USER_ID || "demo-user"`。

## 2. 健康检查

| 方法 | 路径 | 描述 |
| --- | --- | --- |
| GET | `/health` | 返回 `{ ok, service, phase, storeMode }`，`storeMode ∈ { "memory", "postgres" }`。 |

## 3. 用户认证

| 方法 | 路径 | 鉴权 | 描述 |
| --- | --- | --- | --- |
| POST | `/api/auth/wechat/login` | 无 | 用 `wx.login` 返回的 `code` 换会话；返回 `{ data: { token, user } }`。 |
| GET | `/api/auth/me` | User | 返回当前登录用户。 |

`WECHAT_LOGIN_MODE`：

- `mock`（默认）：基于 `code` 哈希生成本地 `openid`。
- `hybrid`：优先尝试 `code2Session`，失败回退 `mock`。
- `real`：强制 `code2Session`，失败报错。

## 4. 内容与节日

| 方法 | 路径 | 鉴权 | 描述 |
| --- | --- | --- | --- |
| GET | `/api/contents` | 可选 | `?type=mantra\|verse\|sutra_segment\|ritual\|teaching` |
| GET | `/api/contents/:id` | 可选 | 单条详情。 |
| GET | `/api/festivals` | 可选 | 节日列表，含 `recommendedContents`。 |

## 5. 记忆计划

| 方法 | 路径 | 鉴权 | 描述 |
| --- | --- | --- | --- |
| GET | `/api/memory-plans` | 可选（User） | `?userId=`；返回该用户全部计划及 `tasks`。 |
| POST | `/api/memory-plans` | 可选（User） | Body `{ userId?, contentId, startDate?, mode? }`；返回 `{ data: plan, meta: { isNew } }`。 |
| POST | `/api/review-tasks/:id/complete` | 可选（User） | Body `{ result, selfRating?, latencyBand?, mistakeCount?, note? }`；返回 `{ task, plan }`。 |

## 6. 今日与成长

| 方法 | 路径 | 鉴权 | 描述 |
| --- | --- | --- | --- |
| GET | `/api/today-focus` | 可选（User） | 返回 `{ date, scientificTasks, playfulTasks, recitationTasks }`。 |
| GET | `/api/growth-overview` | 可选（User） | 返回 `{ memorizationStreak, recitationStreak, masteredCount, playfulPlanCount, scientificPlanCount, completedTaskCount, recitationSessionCount, latestMilestone }`。 |

## 7. 读诵

| 方法 | 路径 | 鉴权 | 描述 |
| --- | --- | --- | --- |
| GET | `/api/recitation-goals` | 可选（User） | 当前用户的 `active` 读诵目标。 |
| PUT | `/api/recitation-goals/:contentId` | 可选（User） | Body `{ userId?, contentId, goalType?, preferredPeriod?, dailyTargetCount? }`；upsert。 |
| POST | `/api/recitation-sessions` | 可选（User） | Body `{ userId?, contentId, goalId?, sessionType?, period?, roundCount?, durationSeconds?, completed?, note? }`。 |

## 8. 通知

| 方法 | 路径 | 鉴权 | 描述 |
| --- | --- | --- | --- |
| GET | `/api/notification-settings` | User | 返回三档（`wechat_subscribe` / `app_push` / `sms`）默认设置。 |
| PUT | `/api/notification-settings` | User | Body `{ channel, enabled, quietHours }`；upsert。 |
| POST | `/api/notification-jobs` | User | Body `{ taskId?, channel, scheduledAt, payload? }`；返回新任务。 |
| GET | `/api/notification-jobs` | User | `?limit=`。 |

## 9. 管理后台

| 方法 | 路径 | 鉴权 | 描述 |
| --- | --- | --- | --- |
| POST | `/api/admin/login` | 无 | Body `{ username, password }`；返回管理员 token。 |
| GET | `/api/admin/session` | Admin | 当前管理员会话。 |
| GET | `/api/admin/overview` | Admin (`admin.read`) | 仪表盘数据。 |
| POST | `/api/admin/contents` | Admin (`content.write`) | 创建内容。 |
| PUT | `/api/admin/contents/:id` | Admin (`content.write`) | 更新内容。 |
| DELETE | `/api/admin/contents/:id` | Admin (`content.write`) | 归档内容。 |
| POST | `/api/admin/assets` | Admin (`asset.write`) | 创建资产。 |
| PUT | `/api/admin/assets/:id` | Admin (`asset.write`) | 更新资产。 |
| DELETE | `/api/admin/assets/:id` | Admin (`asset.write`) | 归档资产。 |
| POST | `/api/admin/notification-jobs/dispatch` | Admin (`admin.read`) | 模拟派发到当前时间之前的 `pending` 任务。 |

## 10. 组织 / 资产 / 审计

| 方法 | 路径 | 鉴权 | 描述 |
| --- | --- | --- | --- |
| GET | `/api/organizations` | 可选 | 全部 active 组织。 |
| GET | `/api/organizations/:id/assets` | 可选 | `?accessLevel=`；返回组织下的 `published` 资产。 |
| POST | `/api/organizations/:id/members` | Admin (`organization.member.manage`) | Body `{ userId, role }`；加入成员。 |
| PUT | `/api/assets/:id/access` | Admin (`asset.access.manage`) | Body `{ accessLevel }`。 |
| GET | `/api/audit-logs` | 可选 | `?organizationId=&limit=`。 |

## 11. 错误响应

```json
{ "error": "CONTENT_NOT_FOUND" }
```

常见错误码：

- `INVALID_CREDENTIALS` / `UNAUTHORIZED` / `FORBIDDEN`
- `INVALID_JSON_BODY` / `NOT_FOUND` / `INTERNAL_SERVER_ERROR`
- `CONTENT_NOT_FOUND` / `Memory plan not found` / `Review task not found` / `Organization not found` / `Asset not found`
- `Content title and body are required` / `Notification channel is required` / `Notification channel and scheduledAt are required` / `Invalid access level`
- `WECHAT_CODE2SESSION_FAILED`

## 12. 调用方映射

- 前台：所有 API 由 `common/api.js` 统一封装。
  - 内容/节日：`listContents` / `listFestivals`。
  - 计划/任务：`listMemoryPlansApi` / `createMemoryPlanApi` / `completeReviewTaskApi`。
  - 读诵：`listRecitationGoalsApi` / `upsertRecitationGoalApi` / `createRecitationSessionApi`。
  - 今日 / 成长：`listTodayFocusApi` / `getGrowthOverviewApi`。
  - 通知：`getNotificationSettingsApi` / `updateNotificationSettingApi` / `createNotificationJobApi` / `listNotificationJobsApi`。
- 后台：直接调上述 REST；`admin.js` 维护 `localStorage.oneMind.admin.token`。
