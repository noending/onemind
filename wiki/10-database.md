# 10 · 数据库设计

权威定义在 [backend/schema.sql](file:///Users/liam/Documents/workspace/oneMind/backend/schema.sql) 与 [docs/DATABASE_DESIGN.md](file:///Users/liam/Documents/workspace/oneMind/docs/DATABASE_DESIGN.md)。

## 1. 目标与约定

- 目标 DBMS：PostgreSQL 14+。
- 扩展：启用 `pgcrypto` 以使用 `gen_random_uuid()`。
- 主键：UUID（除 `seed.js` 中的字符串 id 在初始化时通过 `LEGACY_ID_MAP` 映射为 UUID）。
- 时间戳：`created_at` / `updated_at`；部分表带 `deleted_at` 软删除。
- 可见性：统一 `access_level`：`public` / `registered` / `member` / `restricted` / `private`。
- 内容 / 资产均可绑定 `organization_id`。
- 读诵与背诵分离建模，避免「读过即背会」。

## 2. 核心枚举

| 字段 | 取值 |
| --- | --- |
| `contents.type` | `mantra` / `verse` / `sutra_segment` / `ritual` / `teaching` |
| `contents.length_tier` | `short` / `medium` / `long` |
| `access_level` | `public` / `registered` / `member` / `restricted` / `private` |
| `publish_status` | `draft` / `reviewing` / `approved` / `published` / `rejected` / `archived` |
| `memory_plans.mode` | `scientific` / `playful` |
| `memory_plans.state` | `reviewing` / `at_risk` / `mastered` / `paused` / `cancelled` |
| `review_tasks.status` | `pending` / `done` / `skipped` |
| `review_tasks.result` | `needs_work` / `stronger` / `mastered` |
| `recitation_goals.goal_type` | `daily`（预留扩展） |
| `recitation_sessions.session_type` | `free` / `daily` / `themed` |
| `notification_jobs.status` | `pending` / `sent` / `failed` / `cancelled` |

## 3. 主要表（速查）

> 字段命名风格：snake_case。

### 3.1 users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `nickname` | varchar(120) | |
| `avatar_url` | text | |
| `phone` | varchar(32) | |
| `wechat_openid` | varchar(128) | 唯一索引 `users_wechat_openid_uidx`（部分唯一） |
| `unionid` | varchar(128) | |
| `platform` | varchar(40) | 默认 `wechat` |
| `status` | varchar(32) | 默认 `active` |
| `last_login_at` | timestamptz | |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | |

### 3.2 admin_users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `name` | varchar(120) | 必填 |
| `email` / `phone` | varchar | 唯一索引 |
| `password_hash` | varchar(255) | 必填（实际为环境变量初始化种子） |
| `status` | varchar(32) | 默认 `active` |
| `last_login_at` | timestamptz | |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | |

### 3.3 organizations

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `name` | varchar(160) | 必填 |
| `type` | varchar(40) | 默认 `dharma_group` |
| `status` | varchar(32) | 默认 `active` |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | |

### 3.4 organization_members

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `organization_id` | uuid → `organizations(id)` | |
| `user_id` | uuid → `users(id)` | 可空 |
| `admin_user_id` | uuid → `admin_users(id)` | 可空 |
| `role` | varchar(60) | |
| `status` | varchar(32) | 默认 `active` |
| `joined_at` | timestamptz | |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | |

### 3.5 contents

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `title` | varchar(180) | 必填 |
| `subtitle` | varchar(220) | |
| `type` | varchar(40) | 必填 |
| `body` | text | 必填 |
| `preview` | text | |
| `length_tier` | varchar(24) | 默认 `short` |
| `plan_days` | int | 默认 1 |
| `scene` | varchar(180) | |
| `source_note` / `version_note` | text | |
| `access_level` | varchar(32) | 默认 `public` |
| `publish_status` | varchar(32) | 默认 `draft` |
| `default_mode` | varchar(24) | `scientific` / `playful` |
| `supported_modes` | text[] | |
| `supports_recitation` | bool | 默认 true |
| `recommended_recitation_time` | varchar(24) | |
| `recitation_theme` | varchar(180) | |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | |

### 3.6 content_segments

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `content_id` | uuid → `contents(id)` | |
| `position` | int | 段顺序 |
| `text` | text | 段文本 |
| `hint` | text | 提示 |
| `created_at` / `updated_at` | timestamptz | |

### 3.7 content_versions

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `content_id` | uuid → `contents(id)` | |
| `version` | int | |
| `snapshot` | jsonb | 内容快照 |
| `created_by` | uuid | |
| `created_at` | timestamptz | |

### 3.8 content_mode_configs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `content_id` | uuid → `contents(id)` | |
| `mode` | varchar(24) | `scientific` / `playful` |
| `default_segments_per_session` | int | |
| `review_intervals` | int[] | |
| `extra_config` | jsonb | |
| `created_at` / `updated_at` | timestamptz | |

### 3.9 memory_plans

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid → `users(id)` | |
| `content_id` | uuid → `contents(id)` | |
| `mode` | varchar(24) | `scientific` / `playful` |
| `tier` | varchar(24) | `short` / `medium` / `long` |
| `content_snapshot` | jsonb | 创建时内容快照 |
| `start_date` | date | |
| `total_days` | int | |
| `current_day` | int | |
| `state` | varchar(32) | |
| `mastery_score` | int | 0~100 |
| `streak_hits` | int | |
| `last_reviewed_at` | timestamptz | |
| `last_practice_metrics` | jsonb | |
| `growth_stage` | varchar(24) | |
| `created_at` / `updated_at` | timestamptz | |

### 3.10 review_tasks

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `plan_id` | uuid → `memory_plans(id)` | |
| `user_id` | uuid → `users(id)` | |
| `day_index` | int | |
| `due_date` | date | |
| `method` | varchar(24) | `拆段跟读` / `首字提示` / `遮挡回忆` / `填空复现` / `整段复诵` / `抽查巩固` |
| `status` | varchar(24) | |
| `result` | varchar(24) | |
| `self_rating` | varchar(16) | |
| `latency_band` | varchar(16) | |
| `mistake_count` | int | |
| `completed_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

### 3.11 practice_sessions & review_records

- `practice_sessions`：训练闭环内的会话级记录（包含 `latency_band` / `mistake_count` / `growth_stage` 等）。
- `review_records`：结果反馈流水，含 `mastery_delta` 等。

### 3.12 recitation_goals

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid → `users(id)` | |
| `content_id` | uuid → `contents(id)` | |
| `goal_type` | varchar(24) | |
| `preferred_period` | varchar(24) | |
| `daily_target_count` | int | |
| `status` | varchar(24) | |
| `created_at` / `updated_at` | timestamptz | |

### 3.13 recitation_sessions

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` / `content_id` / `goal_id` | uuid | |
| `session_type` | varchar(24) | |
| `period` | varchar(24) | |
| `round_count` | int | |
| `duration_seconds` | int | |
| `completed` | bool | |
| `note` | text | |
| `created_at` | timestamptz | |

### 3.14 notification_settings & notification_jobs

- `notification_settings`：`(user_id, channel)` 唯一，`quiet_hours` jsonb。
- `notification_jobs`：`status` 支持 `pending/processing/sent/failed/cancelled`；`claim_token/claimed_at/lease_until` 保护并发外发，`provider_attempt_count` 在 POST 前持久递增并限制真实 HTTP 最多 3 次。
- `notification_subscriptions`：`reserved_job_id/reservation_token/reservation_lease_until` 保证一份未消费授权只分配给一个 job；unknown outcome 或 lease recovery 会消费 reservation，防止重复外发。
- `wechat_subscribe.enabled` 按当前时间动态投影：accept、未消费且未 reservation 或 reservation 已过期时为 true。

### 3.15 assets / content_assets / festivals / festival_contents / audit_logs

- `assets`：`organization_id` / `access_level` / `publish_status` / `copyright_status`。
- `content_assets`：内容与资产多对多。
- `festivals` / `festival_contents`：节日专题与关联资源。
- `audit_logs`：操作流水，承载 `actor_type` / `action` / `target_type` / `detail` jsonb。

## 4. 初始化

```bash
# 启动 backend 时由 postgresStore.initializeDatabase() 自动读取 backend/schema.sql 并执行
cd backend
npm start
```

首次启动会在 `psql` 中创建表与索引（`create table if not exists` / `create index if not exists`），幂等。

## 5. 常见查询示例（参考）

- 某用户今天到期的所有未完成 `ReviewTask`：
  ```sql
  SELECT t.*
  FROM review_tasks t
  JOIN memory_plans p ON p.id = t.plan_id
  WHERE p.user_id = $1
    AND t.status = 'pending'
    AND t.due_date <= current_date
  ORDER BY t.due_date;
  ```
- 计算背诵连续天数（后端 `getGrowthOverview`）：
  ```sql
  SELECT date_trunc('day', completed_at) AS day
  FROM review_tasks
  WHERE user_id = $1 AND status = 'completed'
  GROUP BY day ORDER BY day DESC;
  ```

> 仓库当前阶段直接通过 `child_process.execFileSync('psql', ...)` 执行 SQL，尚未使用 `pg` 客户端，后续可平滑替换。
