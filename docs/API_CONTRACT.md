# 一念法藏 Phase 3 API 契约

本文档用于前台 MiniApp、管理后台与后端之间对齐接口边界。当前实现为 `backend/` 下的本地骨架服务，后续可替换为正式框架和数据库。

## 1. 基础约定

- Base URL: `http://127.0.0.1:8787`
- 数据格式: JSON
- 时间字段: ISO 8601
- 日期字段: `YYYY-MM-DD`
- 当前默认用户（未授权时）: `demo-user`

错误响应：

```json
{
  "error": "CONTENT_NOT_FOUND"
}
```

## 2. 健康检查

`GET /health`

返回：

```json
{
  "ok": true,
  "service": "oneMind backend",
  "phase": "phase-3-phase-4-skeleton",
  "storeMode": "postgres"
}
```

`storeMode` 表示当前数据源：

- `postgres`: 已连接 `onemind` 数据库。
- `memory`: 数据库不可用时回退内存数据。

## 3. 用户认证

### 微信授权登录

`POST /api/auth/wechat/login`

请求：

```json
{
  "code": "wx-login-code",
  "platform": "wechat",
  "userInfo": {
    "nickName": "微信昵称",
    "avatarUrl": "https://..."
  }
}
```

返回：

```json
{
  "data": {
    "token": "<user-token>",
    "user": {
      "id": "uuid",
      "nickname": "微信昵称",
      "avatarUrl": "https://...",
      "platform": "wechat",
      "status": "active"
    }
  }
}
```

### 当前登录用户

`GET /api/auth/me`

请求头：

```text
Authorization: Bearer <user-token>
```

### 微信登录模式

后端支持三种登录模式，通过环境变量 `WECHAT_LOGIN_MODE` 控制：

- `mock`：默认模式，不调用微信接口，基于 `code` 生成本地 mock `openid`
- `hybrid`：优先调用微信 `code2Session`，失败时回退 mock
- `real`：强制调用微信 `code2Session`，失败直接报错

真实模式依赖：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

## 4. 内容库

### 内容列表

`GET /api/contents`

可选参数：

- `type`: `mantra` / `verse` / `sutra_segment` / `ritual` / `teaching`

返回字段：

- `id`
- `title`
- `subtitle`
- `type`
- `preview`
- `lengthTier`
- `planDays`
- `scene`
- `accessLevel`
- `defaultMode`
- `supportedModes`
- `supportsRecitation`
- `recommendedRecitationTime`
- `recitationTheme`

### 内容详情

`GET /api/contents/{contentId}`

额外返回：

- `body`
- `segments`

### 长内容结构

`GET /api/contents/{contentId}/versions/{contentVersionId}/structure`

用于大悲咒等长内容的全文或章节学习入口。返回已审核版本的稳定结构：

- `contentId`、`contentVersionId`、`reviewStatus`
- `sourceNote`、`versionNote`
- `sections[]`：章节的 `id`、`title`、`sortOrder`
- `sections[].units[]`：可独立记忆的单元，包含 `id`、`text`、`firstCharacterCue`、`sortOrder`

仅可读取已发布版本；不存在或未发布的版本分别返回 `CONTENT_VERSION_NOT_FOUND` 或 `CONTENT_VERSION_NOT_APPROVED`。

## 5. 节日专题

`GET /api/festivals`

返回字段：

- `id`
- `name`
- `lunarDate`
- `relatedFigure`
- `description`
- `recommendedContents`

## 6. 记忆计划

### 创建或复用计划

`POST /api/memory-plans`

请求：

```json
{
  "contentId": "six-syllable-mantra",
  "startDate": "2026-05-25",
  "mode": "scientific"
}
```

说明：

- 已登录时，`userId` 从 `Authorization` 自动解析，可不传。
- 未登录时，可传 `userId`，不传则使用 `demo-user`。

规则：

- 同一用户对同一内容和同一 `mode` 已有未完成计划时，返回原计划，不重复创建。
- 后端根据内容长度自动生成复习任务节点。

### 计划列表

`GET /api/memory-plans?userId=demo-user`

说明：

- 已登录时优先按 token 对应用户查询。
- 未登录时可用 `userId` 查询，否则默认 `demo-user`。

返回：

- 计划基本信息。
- 计划下的 `tasks`。

### 长内容熟悉度测评

`POST /api/memory-assessments`

请求头：

```text
Authorization: Bearer <user-token>
Idempotency-Key: <1-180 characters>
```

请求：

```json
{
  "contentId": "great-compassion-opening",
  "contentVersionId": "great-compassion-v1",
  "scopeType": "full",
  "scopeId": null
}
```

`scopeType` 为 `full` 或 `section`；章节范围必须提供结构接口返回的 `scopeId`。返回测评 `id`、内容/版本/范围、抽样 `items[]`、`unitCount`、`status` 与创建时间。抽样项包含 `memoryUnitId`、`firstCharacterCue`、`sortOrder`、`positionBand`，前台据此完成约 60 秒的熟悉度测评。

### 测评建议

`POST /api/memory-plans/recommendation`

请求头同上。请求包含 `assessmentId`、与测评项一一对应的 `answers[]`、`dailyMinutes` 和可选 `targetDays`。每个答案使用 `memoryUnitId`、`result`（`cannot` / `partial` / `complete`）和可选 `revealed`。

返回 `familiarityLevel`、`averageScore`、`targetDays`、`newUnitsPerDay`、`estimatedMinutes`、`dailyMinutes`、`intensity`、`disclaimer`，以及已完成的 `assessment`。相同用户、相同幂等键会返回首次结果；用同一键提交不同测评会返回 `IDEMPOTENCY_KEY_CONFLICT`。

### 自适应长内容计划

`POST /api/memory-plans`

自适应请求头必须携带 `Authorization` 与 `Idempotency-Key`。请求：

```json
{
  "contentId": "great-compassion-opening",
  "contentVersionId": "great-compassion-v1",
  "scopeType": "full",
  "scopeId": null,
  "targetDays": 14,
  "dailyMinutes": 15,
  "familiarityLevel": "partial",
  "strategy": "standard",
  "date": "2026-07-10"
}
```

`targetDays` 支持预设 7、14、28 天及 3 至 84 天自定义周期。响应除计划 ID 外，包含 `contentVersionId`、`scopeType`、`scopeId`、`targetDays`、`dailyMinutes`、`familiarityLevel`、`strategy`、`startDate`、`expectedFinishDate`、`adaptiveStatus`、`itemStates[]` 和首日 `task`。计划只初始化所选全文或章节的记忆单元，不会混入其他章节。

### 今日自适应学习任务

`GET /api/study-tasks/today?planId={planId}&date={YYYY-MM-DD}`

需要登录，`planId` 必填；`date` 省略时使用当天。返回 `id`、`planId`、`taskDate`、`items[]` 和可解释字段：`reviewUnitCount`、`weakUnitCount`、`newUnitCount`、`estimatedMinutes`、`sequenceRangeLabel`。每个项目包含 `taskType`（`due_review` / `weak_review` / `new`）、状态和固定的单元快照，避免练习时跨计划取数。

### 完成自适应学习单元

`POST /api/study-task-items/{itemId}/complete`

请求头必须包含 `Authorization` 与 `Idempotency-Key`。请求：

```json
{
  "grade": "again",
  "reviewedAt": "2026-07-10T08:00:00.000Z",
  "latencyMs": 5200,
  "mistakeCount": 1,
  "hintCount": 1
}
```

`grade` 仅允许 `again`、`good`、`easy`。返回更新后的 `item`、`state`、`task` 和 `plan`。`again` 生成同次补练与下一日待复习；即使是当天最后一个单元也会保留可执行的待重试项。相同幂等键重放时返回首次结果，不会重复推进状态或计数。

### 旧长计划迁移

旧版长内容计划不会被静默重写。列表与前台会把其标记为 `migrationRequired`，仅显示迁移提示。用户完成新的测评和计划创建后，可调用：

`POST /api/memory-plans/{planId}/archive`

该操作需要登录和 `Idempotency-Key`，仅允许归属当前用户的旧长计划；归档重复请求返回相同结果。短内容和新的自适应计划不在该迁移范围内。

## 7. 复习任务

### 完成任务

`POST /api/review-tasks/{taskId}/complete`

请求：

```json
{
  "result": "stronger",
  "selfRating": "medium",
  "latencyBand": "steady",
  "mistakeCount": 1,
  "note": "今天状态平稳"
}
```

`result` 可选：

- `needs_work`
- `stronger`
- `mastered`

返回：

- 更新后的 `task`
- 更新后的 `plan`

## 8. 今日任务与成长概览

### 今日任务分组

`GET /api/today-focus`

返回：

- `scientificTasks`
- `playfulTasks`
- `recitationTasks`

其中科学/趣味任务都包含：

- `planId`
- `taskId`
- `contentId`
- `title`
- `mode`
- `meta`
- `method`
- `currentDay`
- `totalDays`
- `masteryScore`
- `growthStage`
- `body`
- `scene`
- `reasonText`

### 成长概览

`GET /api/growth-overview`

返回：

- `memorizationStreak`
- `recitationStreak`
- `masteredCount`
- `playfulPlanCount`
- `scientificPlanCount`
- `completedTaskCount`
- `recitationSessionCount`
- `latestMilestone`

## 9. 日常读诵

### 读诵目标列表

`GET /api/recitation-goals`

### 创建或更新读诵目标

`PUT /api/recitation-goals/{contentId}`

请求：

```json
{
  "goalType": "daily",
  "preferredPeriod": "morning",
  "dailyTargetCount": 1
}
```

### 记录读诵完成

`POST /api/recitation-sessions`

请求：

```json
{
  "contentId": "six-syllable-mantra",
  "goalId": "uuid-or-null",
  "sessionType": "daily",
  "period": "morning",
  "roundCount": 1,
  "durationSeconds": 120,
  "completed": true,
  "note": "晨课完成"
}
```

## 10. 提醒设置

提醒链路分为队列、用户授权、外部发送三层。`notification_jobs.status=sent` 仅表示微信 subscribe-message API 已返回 `errcode=0`。

### 读取提醒能力

`GET /api/notification-capabilities`

无需登录。返回值只公开模板身份信息，不包含 app secret、page 或 fields：

```json
{
  "data": {
    "provider": "wechat_subscribe",
    "available": true,
    "templates": [
      { "key": "review", "templateId": "wechat-template-id", "label": "复习提醒" }
    ]
  }
}
```

未配置模板时返回 `available=false`、空模板数组和 `WECHAT_SUBSCRIBE_NOT_CONFIGURED`。模板有效但缺少 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`，或 `WECHAT_LOGIN_MODE` 不是 `real` 时返回 `WECHAT_SUBSCRIBE_PROVIDER_NOT_READY`；响应不包含任何配置值。

### 读取提醒设置

`GET /api/notification-settings`

请求头：

```text
Authorization: Bearer <user-token>
```

返回：

- `wechat_subscribe`
- `app_push`
- `sms`

每条设置包含：

- `channel`
- `enabled`
- `quietHours`

### 更新提醒设置

`PUT /api/notification-settings`

请求：

```json
{
  "channel": "wechat_subscribe",
  "enabled": false,
  "quietHours": {
    "start": "22:00",
    "end": "07:00"
  }
}
```

`wechat_subscribe` 只能通过此接口关闭，不能直接开启。开启必须在小程序用户手势中调用 `wx.requestSubscribeMessage`，并保存至少一个 `accept` 结果。

### 保存微信订阅结果

`POST /api/notification-subscriptions/wechat`

请求头：

```text
Authorization: Bearer <user-token>
Idempotency-Key: <unique-key, max 180 chars>
```

每个模板结果单独提交：

```json
{
  "templateId": "wechat-template-id",
  "status": "accept"
}
```

`status` 仅支持 `accept | reject | ban`。相同幂等键和相同请求安全重放；同一键复用到不同请求返回 `409 IDEMPOTENCY_KEY_CONFLICT`。PostgreSQL 使用同一连接事务和 user+idempotencyKey advisory xact lock，在事务内完成重放/冲突校验、授权 upsert、setting 计算和响应记录。provider 未 ready 返回 `503`；用户没有真实服务端 openid 返回 `409 WECHAT_REAL_LOGIN_REQUIRED`。

`wechat_subscribe.enabled` 仅统计 `accept`、未消费且未被有效 reservation 占用的授权。消费一个模板后如仍有可用授权则保持开启；最后一份可用授权 reject/ban/consume 后关闭。

### 创建提醒任务

`POST /api/notification-jobs`

请求：

```json
{
  "taskId": "uuid-or-null",
  "channel": "wechat_subscribe",
  "scheduledAt": "2026-05-27T21:00:00+08:00",
  "payload": {
    "type": "review",
    "title": "心经复习",
    "message": "请开始今天的复习"
  }
}
```

`payload.type` 通过服务端配置映射到 template key；模板 ID、page 和字段映射不由客户端写入 job。

### 查看当前用户提醒任务

`GET /api/notification-jobs?limit=5`

请求头：

```text
Authorization: Bearer <user-token>
```

## 9. Phase 3 后续接口

下一批接口应补齐：

- `GET /api/assets`
- `GET /api/shop/items`
- `POST /api/favorites`

## 10. 管理后台接口

### 管理员登录

`POST /api/admin/login`

请求：

```json
{
  "username": "magic",
  "password": "Noending5@"
}
```

返回：

```json
{
  "data": {
    "token": "<admin-token>",
    "admin": {
      "id": "uuid",
      "username": "magic",
      "role": "super_admin",
      "name": "系统管理员",
      "status": "active"
    }
  }
}
```

以下管理接口需要请求头：

```text
Authorization: Bearer <admin-token>
```

### 当前管理会话

`GET /api/admin/session`

返回当前管理员身份和角色信息。

### 派发待发送提醒

`POST /api/admin/notification-jobs/dispatch`

可选参数：

- `dueBefore`
- `limit`

路由会 await 异步 dispatcher。每轮仅将一个到期 `pending` 任务原子 claim 为 `processing`，写入不可猜测的 `claimToken` 和 5 分钟 `leaseUntil`；随后原子 reservation 一份同用户、同模板、未消费 `accept` 授权，再调用微信。竞争失败的 dispatcher 不调用 provider。过期 lease 在后续 claim 时恢复为 `pending` 并释放 reservation。返回：

```json
{
  "data": {
    "processed": 3,
    "sent": 1,
    "failed": 1,
    "retrying": 1,
    "providers": {
      "wechat_subscribe": { "sent": 1, "failed": 1, "retrying": 1 }
    },
    "results": []
  }
}
```

微信返回非零 `errcode` 时不会标记 `sent`。可重试失败写入 `attemptCount/nextRetryAt/lastError/providerResponse`，最多尝试 3 次；永久失败或第 3 次失败标记 `failed`。

该路由要求 `notification.dispatch` 权限。

### 管理后台页面

`GET /admin`

返回轻量管理后台 Web UI，用于查看内容、计划、组织资产和审计记录。

### 后台概览

`GET /api/admin/overview`

返回：

- `userCount`
- `contentCount`
- `planCount`
- `completedTaskCount`
- `assetCount`
- `organizationCount`
- `auditLogCount`
- `recentPlans`
- `recentAuditLogs`
- `currentAdmin`

### 管理员角色权限

当前已启用角色：

- `super_admin`
- `platform_ops`
- `content_editor`
- `content_reviewer`
- `organization_admin`
- `asset_maintainer`
- `readonly_member`

关键鉴权动作：

- 组织成员管理：`organization.member.manage`
- 资产可见级别变更：`asset.access.manage`
- 内容/资产下架：`content.publish` / `asset.publish`
- 通知手动派发：`notification.dispatch`，仅授予 `super_admin` / `platform_ops` / `organization_admin`

### 新增内容

`POST /api/admin/contents`

请求：

```json
{
  "title": "后台新增短偈",
  "type": "verse",
  "body": "愿以此功德 普及于一切",
  "planDays": 2,
  "lengthTier": "short",
  "scene": "晨课回向"
}
```

效果：

- 写入 `contents`。
- 根据正文写入 `content_segments`。
- 写入 `audit_logs`，动作为 `content.created`。

### 编辑内容

`PUT /api/admin/contents/{contentId}`

请求：

```json
{
  "title": "已编辑短偈",
  "type": "verse",
  "body": "一念清净 福慧增长 日日精进",
  "planDays": 3,
  "lengthTier": "short",
  "scene": "后台编辑"
}
```

效果：

- 更新 `contents`。
- 重写该内容的 `content_segments`。
- 写入 `audit_logs`，动作为 `content.updated`。

### 下架内容

`DELETE /api/admin/contents/{contentId}`

效果：

- 将内容 `publish_status` 改为 `archived`。
- 设置 `deleted_at`。
- 内容不再出现在公开内容列表。
- 写入 `audit_logs`，动作为 `content.archived`。

### 新增资产

`POST /api/admin/assets`

请求：

```json
{
  "title": "内部仪轨备份",
  "type": "document",
  "url": "storage://demo/document/internal.pdf",
  "accessLevel": "restricted"
}
```

效果：

- 写入 `assets`。
- 写入 `audit_logs`，动作为 `asset.created`。

### 编辑资产

`PUT /api/admin/assets/{assetId}`

请求：

```json
{
  "title": "已更新资产标题",
  "type": "pdf",
  "url": "storage://demo/document/file-v2.pdf",
  "accessLevel": "member",
  "copyrightStatus": "internal_authorized"
}
```

效果：

- 更新 `assets`。
- 写入 `audit_logs`，动作为 `asset.updated`。

### 下架资产

`DELETE /api/admin/assets/{assetId}`

效果：

- 将资产 `publish_status` 改为 `archived`。
- 设置 `deleted_at`。
- 资产不再出现在组织资产列表。
- 写入 `audit_logs`，动作为 `asset.archived`。

## 9. Phase 4 组织与数字法藏接口

当前骨架已实现以下组织、资产权限和审计接口，用于提前验证数字法藏方向。

### 组织列表

`GET /api/organizations`

返回：

- `id`
- `name`
- `type`
- `status`

### 组织资产列表

`GET /api/organizations/{organizationId}/assets`

可选参数：

- `accessLevel`: `public` / `registered` / `member` / `restricted` / `private`

注意：

- `public` 资产会返回 `url`。
- 非公开资产当前只返回元数据，`url` 为 `null`，后续由正式授权接口签发临时访问地址。

### 添加组织成员

`POST /api/organizations/{organizationId}/members`

该接口现在作为管理动作处理，需要 `Authorization`。

请求：

```json
{
  "userId": "demo-user",
  "role": "readonly_member"
}
```

### 更新资产访问级别

`PUT /api/assets/{assetId}/access`

该接口现在作为管理动作处理，需要 `Authorization`。

请求：

```json
{
  "accessLevel": "restricted"
}
```

规则：

- 可选访问级别为 `public`、`registered`、`member`、`restricted`、`private`。
- 更新后会写入审计日志。

### 审计日志

`GET /api/audit-logs`

可选参数：

- `organizationId`
- `limit`

返回：

- `actorType`
- `actorId`
- `organizationId`
- `action`
- `targetType`
- `targetId`
- `detail`
- `createdAt`
