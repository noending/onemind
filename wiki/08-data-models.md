# 08 · 数据模型

下面所有模型都同时存在于前台（`common/memory.js` / `common/content.js`）和后端（`backend/src/repositories/*`）两侧。命名风格在前台为 camelCase，在后端为 snake_case；映射在 `common/memory.js` 的 `mapRemotePlan` / `mapRemoteTask` 中完成。

## 1. ContentItem

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 主键。前台使用短 id（`om-mani`），后端 UUID + 别名映射。 |
| `title` | string | 是 | 内容名。 |
| `subtitle` | string | 否 | 副标题。 |
| `category` / `type` | enum | 是 | `mantra`（短咒）/ `verse`（短偈）/ `sutra_segment`（经文片段）/ `ritual`（仪轨片段）/ `teaching`（上师开示）。 |
| `body` | text | 是 | 全文。 |
| `preview` | text | 否 | 预览文本。 |
| `segments` | string[] | 否 | 拆段；若缺省，按正文自动分割。 |
| `lengthTier` | enum | 是 | `short` / `medium` / `long`。 |
| `lengthLevel` | enum | 同上 | 前台冗余字段，等同 `lengthTier`。 |
| `planDays` | int | 是 | 预计训练天数。短 1~3 / 中 3~7 / 长 7~14。 |
| `scene` | string | 否 | 使用场景。 |
| `hasAudio` | bool | 否 | 是否配有音频。 |
| `accessLevel` | enum | 是 | `public` / `registered` / `member` / `restricted` / `private`。 |
| `defaultMode` | enum | 否 | `scientific` / `playful`。 |
| `supportedModes` | enum[] | 否 | 支持的训练模式。 |
| `supportsRecitation` | bool | 否 | 是否支持日常读诵。 |
| `recommendedRecitationTime` | enum | 否 | `morning` / `noon` / `evening` / `night` / `theme`。 |
| `recitationTheme` | string | 否 | 读诵主题。 |
| `festival` / `festivalTag` | string | 否 | 关联节日。 |
| `publishStatus` | enum | 是 | `draft` / `reviewing` / `approved` / `published` / `rejected` / `archived`。 |

## 2. MemoryPlan

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | `${contentId}-${mode}-${ts}`（前台）/ `plan_<ts>_<rand>`（后端）。 |
| `userId` | string | 是 | 所属用户。 |
| `contentId` | string | 是 | 关联 `ContentItem.id`。 |
| `title` | string | 否 | 内容标题快照。 |
| `mode` | enum | 是 | `scientific` / `playful`。 |
| `tier` | enum | 否 | 内容长度档。 |
| `contentSnapshot` | object | 是 | 创建时的内容快照，避免后端内容修改影响历史计划。 |
| `startDate` | YYYY-MM-DD | 是 | 起始日期。 |
| `totalDays` | int | 是 | 总天数。 |
| `currentDay` | int | 否 | 当前进度。 |
| `state` | enum | 是 | `reviewing` / `at_risk` / `mastered` / `paused` / `cancelled`。 |
| `masteryScore` | int | 否 | 0~100。 |
| `streakHits` | int | 否 | 连续掌握次数。 |
| `lastReviewedAt` | ISO | 否 | 上次训练时间。 |
| `lastPracticeMetrics` | object | 否 | `{ selfRating, latencyBand, mistakeCount }`。 |
| `growthStage` | string | 否 | 由 `masteryScore` 计算：`初见 / 熟悉 / 稳定 / 通顺 / 已持诵`。 |
| `tasks` | `ReviewTask[]` | 是 | 任务节点列表。 |
| `createdAt` / `updatedAt` | ISO | 否 | 审计字段。 |

## 3. ReviewTask

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 任务 ID。 |
| `planId` | string | 是 | 所属 `MemoryPlan.id`。 |
| `userId` | string | 否 | 后端冗余，便于按用户检索。 |
| `dayIndex` | int | 是 | 0 起（前台）/ 1 起（后端）。 |
| `scheduledDate` / `dueDate` | YYYY-MM-DD | 是 | 计划复习日期。 |
| `method` | enum | 是 | `拆段跟读` / `首字提示` / `遮挡回忆` / `填空复现` / `整段复诵` / `抽查巩固`。 |
| `status` | enum | 否 | `pending` / `done` / `skipped` / `completed`（后端）。 |
| `result` | enum | 否 | `needs_work` / `stronger` / `mastered`（后端）/ `needsWork` / `stronger` / `mastered`（前台）。 |
| `done` | bool | 否 | 前台视图。 |
| `completedAt` | ISO | 否 | 完成时间。 |
| `selfRating` | string | 否 | `low` / `medium` / `high`。 |
| `latencyBand` | string | 否 | `hesitant` / `steady` / `smooth`。 |
| `mistakeCount` | int | 否 | 错误次数。 |

## 4. FestivalRecommendation

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 主键。 |
| `name` | string | 是 | 节日名。 |
| `date` / `lunarDate` / `solarDate` | string | 是 | 日期展示文本。 |
| `deity` / `relatedFigure` | string | 否 | 关联佛菩萨。 |
| `reason` / `description` | string | 否 | 推荐理由。 |
| `contentIds` / `recommendedContentIds` | string[] | 否 | 推荐内容 ID。 |
| `recommendedContents` | `ContentItem[]` | 否 | 实际推荐内容快照。 |

## 5. ProgressState

前台在 `common/memory.js` 的 `getProgressItems` 中按 `state` 分桶为：

- `reviewing`：所有 `state !== "mastered" && state !== "at_risk"` 的计划。
- `at_risk`：`state === "at_risk"`。
- `mastered`：`state === "mastered"`。
- `playful` / `scientific`：按模式再次拆分。

`growthStage` 由 `masteryScore` 计算：`<25 初见` / `<50 熟悉` / `<75 稳定` / `<100 通顺` / `=100 已持诵`。

## 6. RecitationGoal

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 主键。 |
| `userId` | string | 是 | 所属用户。 |
| `contentId` | string | 是 | 关联 `ContentItem.id`。 |
| `goalType` | enum | 否 | 当前实现 `daily`，预留扩展。 |
| `preferredPeriod` | enum | 否 | `morning` / `noon` / `evening` / `night` / `theme`。 |
| `dailyTargetCount` | int | 否 | 每日目标轮数，默认 1。 |
| `status` | enum | 否 | `active` / `paused`。 |
| `title` / `preview` / `scene` | string | 否 | 来自 `ContentItem` 的快照。 |

## 7. RecitationSession

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 主键。 |
| `userId` | string | 是 | 所属用户。 |
| `contentId` | string | 是 | 关联 `ContentItem.id`。 |
| `goalId` | string | 否 | 关联 `RecitationGoal.id`。 |
| `sessionType` | enum | 否 | `free` / `daily` / `themed`（按接口约定扩展）。 |
| `period` | enum | 否 | `morning` / `noon` / `evening` / `night` / `theme`。 |
| `roundCount` | int | 否 | 实际轮数。 |
| `durationSeconds` | int | 否 | 实际时长。 |
| `completed` | bool | 否 | 是否完成。 |
| `note` | string | 否 | 备注。 |
| `createdAt` | ISO | 否 | 创建时间。 |

## 8. NotificationSetting & NotificationJob

### 8.1 NotificationSetting

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | `${userId}-${channel}`。 |
| `userId` | string | 是 | 所属用户。 |
| `channel` | enum | 是 | `wechat_subscribe` / `app_push` / `sms`。 |
| `enabled` | bool | 是 | 是否启用。 |
| `quietHours` | object | 否 | `{ start: "HH:mm", end: "HH:mm" }`，默认 `22:00 - 07:00`。 |
| `updatedAt` | ISO | 否 | 更新时间。 |

### 8.2 NotificationJob

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 主键。 |
| `userId` | string | 是 | 所属用户。 |
| `taskId` | string | 否 | 关联 `ReviewTask.id`。 |
| `channel` | enum | 是 | 同上。 |
| `scheduledAt` | ISO | 是 | 计划发送时间。 |
| `sentAt` | ISO | 否 | 实际发送时间。 |
| `status` | enum | 否 | `pending` / `sent` / `failed` / `cancelled`。 |
| `payload` | object | 否 | 自定义载荷。 |
| `attemptCount` | number | 是 | 已执行派发次数，最多 3 次。 |
| `nextRetryAt` | ISO | 否 | 可重试失败的下一次执行时间。 |
| `lastError` | string | 否 | 最近一次失败原因。 |
| `providerMessageId` | string | 否 | 微信成功回执消息 ID。 |
| `providerResponse` | object | 否 | 微信原始 JSON 回执。 |

## 9. Organization / OrganizationMember

| Organization 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键。 |
| `name` | string | 组织名。 |
| `type` | enum | `dharma_group` 等。 |
| `status` | enum | `active` / 其它。 |
| `createdAt` / `updatedAt` | ISO | 审计字段。 |
| `deletedAt` | ISO | 软删除。 |

| OrganizationMember 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键。 |
| `organizationId` | uuid | 所属组织。 |
| `userId` | uuid | 可选，前台用户。 |
| `adminUserId` | uuid | 可选，后台管理员。 |
| `role` | string | 组织内角色。 |
| `status` | enum | `active` / 其它。 |
| `joinedAt` | ISO | 加入时间。 |

## 10. Asset

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | 是 | 主键。 |
| `organizationId` | uuid | 是 | 所属组织。 |
| `title` | string | 是 | 资产名。 |
| `type` | enum | 否 | `document` / 其它。 |
| `url` | string | 是 | 资产 URL（公开时可暴露，私有时为 `null`）。 |
| `thumbnailUrl` | string | 否 | 缩略图。 |
| `accessLevel` | enum | 是 | `public` / `registered` / `member` / `restricted` / `private`。 |
| `publishStatus` | enum | 否 | `draft` / `published` / `archived` 等。 |
| `copyrightStatus` | enum | 否 | `organization_owned` 等。 |

## 11. AuditLog

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键。 |
| `actorType` | enum | `admin_user` / 其它。 |
| `actorId` | string | 操作者。 |
| `organizationId` | uuid | 上下文组织。 |
| `action` | string | `asset.created` / `asset.updated` / `asset.archived` / `asset.access_updated` / `organization.member_added`。 |
| `targetType` | string | `asset` / `organization_member`。 |
| `targetId` | string | 目标 ID。 |
| `detail` | object | 自由结构负载。 |
| `createdAt` | ISO | 时间戳。 |
