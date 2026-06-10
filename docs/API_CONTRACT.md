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
  "enabled": true,
  "quietHours": {
    "start": "22:00",
    "end": "07:00"
  }
}
```

### 创建提醒任务

`POST /api/notification-jobs`

请求：

```json
{
  "taskId": "uuid-or-null",
  "channel": "wechat_subscribe",
  "scheduledAt": "2026-05-27T21:00:00+08:00",
  "payload": {
    "templateId": "demo-template",
    "page": "pages/home/index"
  }
}
```

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

当前为演示态 mock 派发：

- 将 `pending` 状态的提醒任务更新为 `sent`
- 回写 `sentAt`
- 返回 `dispatchedCount`

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
