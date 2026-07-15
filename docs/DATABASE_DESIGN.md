# 一念法藏数据库设计（统一基线）

更新时间：2026-05-27

## 1. 说明与边界

- 目标数据库：PostgreSQL 14+
- 本文档用于产品/后端/后台对齐
- `backend/schema.sql` 为当前实现的最终事实来源（source of truth）
- 本文档不再描述未落地表（如 roles/permissions/orders 等），此类能力进入后续版本时再补

## 2. 设计原则

- 全局主键使用 UUID。
- 关键业务表保留 `created_at` / `updated_at`，部分表包含 `deleted_at` 软删除。
- 权限可见级别统一使用 `access_level`。
- 内容与资产均可绑定组织 `organization_id`，支持平台级与组织级并存。
- 读诵与背诵分离建模，避免“读过即背会”的数据混淆。

## 3. 关键枚举（当前实现）

## 3.1 内容与权限

- `content.type`: `mantra | verse | sutra_segment | ritual | teaching`
- `contents.length_tier`: `short | medium | long`
- `access_level`: `public | registered | member | restricted | private`
- `publish_status`: `draft | reviewing | approved | published | rejected | archived`

## 3.2 计划与训练

- `memory_plans.mode`: `scientific | playful`
- `memory_plans.state`: `reviewing | at_risk | mastered | paused | cancelled`
- `review_tasks.status`: `pending | done | skipped`
- `review_tasks.result`: `needs_work | stronger | mastered`

## 3.3 读诵与通知

- `recitation_goals.goal_type`: `daily`（预留扩展）
- `recitation_sessions.session_type`: `free | daily | themed`（按接口约定扩展）
- `notification_jobs.status`: `pending | processing | sent | failed | cancelled`

## 4. 实体关系总览

## 4.1 用户与组织

- `users`：前台用户
- `admin_users`：后台管理员
- `organizations`：组织
- `organization_members`：组织成员关系（user/admin 双通道）

## 4.2 内容与资产

- `contents`：内容主表
- `content_segments`：内容分段
- `content_versions`：内容版本快照
- `content_mode_configs`：内容模式配置（三模式入口核心）
- `assets`：数字资产
- `content_assets`：内容与资产关联
- `festivals` / `festival_contents`：节日专题与关联资源

## 4.3 记忆与读诵

- `memory_plans`：记忆计划（支持 scientific/playful）
- `review_tasks`：计划下任务节点
- `review_records`：任务结果记录
- `practice_sessions`：训练会话明细（科学/趣味过程数据）
- `recitation_goals`：读诵目标
- `recitation_sessions`：读诵会话

## 4.4 通知与审计

- `notification_settings`：提醒渠道设置
- `notification_subscriptions`：按用户和微信模板保存授权、授予与消费状态
- `notification_subscription_idempotency`：订阅结果 API 幂等响应
- `notification_jobs`：待发送提醒任务
- `audit_logs`：关键操作审计日志

## 5. 核心表定义（按实现）

## 5.1 users

关键字段：

- `wechat_openid`（唯一索引，非空时）
- `unionid`
- `platform`
- `status`

用途：

- 支撑微信登录、用户识别、任务归属。

## 5.2 contents

关键字段：

- `type`、`body`、`preview`
- `length_tier`、`plan_days`、`scene`
- `access_level`、`publish_status`
- `organization_id`

用途：

- 作为背诵/读诵/节日/商城关联的内容主实体。

## 5.3 content_mode_configs

关键字段：

- `content_id`（唯一）
- `default_mode`
- `supported_modes`（jsonb）
- `supports_recitation`
- `recommended_recitation_time`
- `recitation_theme`

用途：

- 决定前台“选内容后可进入哪些模式”。

## 5.4 memory_plans

关键字段：

- `user_id`、`content_id`
- `mode`（scientific/playful）
- `start_date`、`total_days`、`current_day`
- `state`、`mastery_score`

关键索引：

- `(user_id, state)`
- `(content_id)`
- `(user_id, mode, state)`

用途：

- 三模式中的背诵计划主表。

## 5.5 review_tasks

关键字段：

- `plan_id`、`user_id`
- `due_date`、`method`、`day_index`
- `status`、`result`

关键索引：

- `(user_id, due_date, status)`
- `(plan_id)`

用途：

- 今日任务分组中的科学/趣味任务来源。

## 5.6 practice_sessions

关键字段：

- `user_id`、`plan_id`、`task_id`、`content_id`
- `mode`
- `self_rating`
- `result_level`
- `latency_band`
- `mistake_count`
- `growth_stage`

用途：

- 沉淀训练质量数据，支持“科学解释”与“成长反馈”。

## 5.7 recitation_goals / recitation_sessions

`recitation_goals` 关键字段：

- `user_id`、`content_id`
- `goal_type`
- `preferred_period`
- `daily_target_count`
- `status`

`recitation_sessions` 关键字段：

- `user_id`、`content_id`、`goal_id`
- `session_type`、`period`
- `round_count`、`duration_seconds`
- `completed`

用途：

- 支撑独立的日常读诵系统与连续打卡统计。

## 5.8 notification_settings / notification_subscriptions / notification_jobs

用途：

- 存储用户提醒开关、逐模板授权与提醒发送任务。

说明：

- `notification_settings.quiet_hours` 为 jsonb。
- `notification_subscriptions.status` 为 `accept | reject | ban`，`granted_at/consumed_at` 区分授权和单次消费。
- `notification_subscriptions.reserved_job_id/reservation_token/reserved_at/reservation_lease_until` 记录外发前的单 job 授权 reservation。
- `notification_jobs.payload` 为 jsonb。
- `notification_jobs.attempt_count/next_retry_at/last_error` 记录逻辑派发与退避状态。
- `notification_jobs.provider_attempt_count` 在每次微信消息 POST 前原子递增，真实 HTTP 上限为 3，进程崩溃不会丢计数。
- `notification_jobs.claim_token/claimed_at/lease_until` 记录 `processing` claim；每次 POST 前续租并验证 token。过期 lease 直接 `failed + DELIVERY_OUTCOME_UNKNOWN`，已 reservation 授权标记 consumed，不重新 pending。
- `provider_message_id/provider_response` 保存微信回执；只有 `errcode=0` 才写 `sent_at` 和 `status=sent`。
- `wechat_subscribe.enabled` 读取时按 accept、未消费和 reservation lease 动态投影，过期 reservation 无需先清理即可显示可用。

## 5.9 audit_logs

关键字段：

- `actor_type`、`actor_id`
- `organization_id`
- `action`
- `target_type`、`target_id`
- `detail`（jsonb）

用途：

- 记录权限变更、内容/资产变更、成员变更等关键行为。

## 6. 关系与一致性约束

- `content_segments.content_id -> contents.id`
- `content_mode_configs.content_id -> contents.id`（一对一）
- `memory_plans.user_id -> users.id`
- `memory_plans.content_id -> contents.id`
- `review_tasks.plan_id -> memory_plans.id`
- `practice_sessions.plan_id -> memory_plans.id`
- `recitation_goals.user_id -> users.id`
- `recitation_sessions.goal_id -> recitation_goals.id`

一致性规则：

- 同用户同内容同模式未完成计划应复用，不重复创建（服务层保证）。
- 读诵会话不会直接修改记忆计划状态（服务层保证）。

## 7. 与接口契约对齐

以下接口依赖本文档中的新增结构：

- `POST /api/memory-plans`（`mode`）
- `GET /api/today-focus`（三类任务分组）
- `POST /api/review-tasks/{taskId}/complete`（训练指标）
- `GET /api/growth-overview`
- `GET/PUT /api/recitation-goals`
- `POST /api/recitation-sessions`

若接口字段与本文档冲突，以 `backend/schema.sql` + `docs/API_CONTRACT.md` 最新版本为准。

## 8. 迁移与演进建议

- 新增字段优先走“向后兼容”策略，避免破坏现有小程序端。
- 枚举扩展先更新接口契约，再更新服务层校验，再更新前台映射。
- 当进入商城真实交易与精细 RBAC 阶段，再新增订单、权益、角色权限细表。

## 9. 当前状态结论

- 三模式（scientific/playful + recitation）所需核心表已落地。
- 内容模式配置与训练/读诵会话表已落地。
- 审计日志与组织基础表已落地，可支撑 Phase 4 深化。
- 后续新增能力需先更新 `schema.sql`，再回写本文档。
