# 微信订阅消息真实提醒实施报告

日期：2026-07-12

## 结果

- 队列层：保留阶段 A 的复习/读诵任务生成、去重和 mastered 抑制；repository 仅列出到期 pending 与原子记录结果。
- 授权层：profile 在用户点击开启的调用栈内直接调用 `wx.requestSubscribeMessage`；模板 ID 来自 capabilities；每个结果通过 authenticated、带 `Idempotency-Key` 的 API 保存。
- 外发层：access token 提前过期缓存并复用并发请求；token 无效只刷新重试一次；微信仅在 `errcode=0` 时进入 sent。
- 状态层：保存 attempt、退避时间、错误、provider message ID/response；可重试最多 3 次，永久失败直接 failed；成功原子消费授权并在没有剩余授权时关闭 channel。
- 数据层：`schema.sql` 与 runtime migration 对齐；memory/PostgreSQL 暴露同一通知接口。

## TDD 证据

- 初始 RED：新增的配置、sender、dispatcher、repository、路由和 profile 合同共 15 项全部因能力缺失失败。
- 定向 GREEN：配置/客户端/dispatcher、memory repository、授权路由、profile 用户手势和真实 PostgreSQL gate 均通过。
- 外部 HTTP：测试使用注入 fake fetch 或 mock `wx.requestSubscribeMessage`，没有访问真实微信端点。

## 最终门禁

- `cd backend && npm test`：212 tests，181 pass，31 个既有条件性 skip，0 fail。
- `node --test test/notification-postgres-gate.test.js`：1 pass，0 fail，0 skip，真实本地 PostgreSQL 执行。
- `cd backend && npm run check`：通过，覆盖 routes、memory/PG repository、runtime schema、4 个通知服务、client API 和 profile。
- `node tools/check-ui-parity.mjs`：六页 89/89 项通过（含 profile 14/14、recitation 19/19、shop 13/13）。
- `git diff --check`：通过。

## 外部配置

- `WECHAT_LOGIN_MODE=real`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_SUBSCRIBE_TEMPLATES_JSON`
- 微信公众平台中与配置一致且已启用的订阅消息模板、字段名和小程序 page。

## 提交

- `98a67c02 feat: implement real WeChat notification delivery`

---

## 终审 findings 修复增补

日期：2026-07-12

### 修复内容

- 并发外发：`notification_jobs` 新增 `processing + claim_token + claimed_at + lease_until`；dispatcher 每次只 claim 一个 job，避免队尾 lease 在等待期间过期。PostgreSQL claim 使用单条顶层 DML CTE 与 `FOR UPDATE SKIP LOCKED`，memory 保持同语义。
- 授权 reservation：`notification_subscriptions` 新增 job/token/lease reservation 字段；同一份未消费 `accept` 只能原子分配给一个 claim。成功原子 `sent + consume`；失败递增 attempt、释放 reservation 并进入 retry/failed；过期 lease 恢复并释放 reservation。
- PG 授权幂等：同一 psql 连接内显式 `BEGIN/COMMIT`，按 `userId:idempotencyKey` 获取 advisory xact lock；锁后在新 READ COMMITTED snapshot 中完成重放/冲突校验、subscription upsert、setting 计算和 response 记录，错误整笔回滚。
- Readiness：统一 `isWechatProviderReady`，同时要求有效模板、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_LOGIN_MODE=real`。capabilities 和授权保存共用该判断；没有真实服务端 openid 时拒绝保存授权。
- Enabled：仅统计 `accept`、`consumedAt=null` 且没有有效 reservation 的授权，memory/PG 一致。
- RBAC：新增 `notification.dispatch`，只授予 `super_admin`、`platform_ops`、`organization_admin`；路由、管理后台权限映射和按钮统一，`readonly_member` 返回 403。

### TDD RED -> GREEN

- RED 复现：旧 dispatcher 仍要求 `listDueNotificationJobs`；PG 无 claim API；两个 memory dispatcher 会同时调用 provider，第二次成功落库报 `NOTIFICATION_JOB_NOT_PENDING`。
- GREEN memory 聚焦：19/19 通过，覆盖同 job 双 dispatcher、同授权双 job、lease recovery、3 次 HTTP 上限、readiness、enabled parity、readonly 403 与运营角色允许。
- GREEN 真实 PG 聚焦：以下四组分别通过：基础 sent/consume/retry/enabled parity；跨连接同 key 同 payload 与冲突 payload；同 job/同授权竞争；lease recovery 与 3 次 HTTP 上限。

### 最终门禁

- `PGPORT=1 npm test`：223 tests，188 pass，35 条 PG 条件 skip，0 fail。商城、播放、科学记忆回归在内。
- `npm run check`：通过。
- `npm run admin:build`：通过，生产后台 bundle 已更新。
- `node tools/check-ui-parity.mjs`：89/89 通过。
- `git diff --check`：通过。

### Concern

- 真实 PG 完整测试文件包含多个初始化密集 gate，单次运行超过当前命令回传窗口；未把被截断的完整文件运行声明为通过。四个终审相关 PG gate 已用 `--test-name-pattern` 分组执行并全部通过。

### 外部配置

- 必须同时配置：`WECHAT_LOGIN_MODE=real`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、有效的 `WECHAT_SUBSCRIBE_TEMPLATES_JSON`。
- 微信公众平台必须存在并启用对应订阅消息模板，字段名和小程序 page 必须与 JSON 一致。

---

## 通知复审剩余 3 项修复增补

日期：2026-07-12

### At-most-once 状态机

- 微信 token GET 与订阅消息 POST 都使用 AbortController，默认 10 秒超时；计时覆盖 fetch 和响应体 JSON 读取，显著短于 5 分钟 claim lease。
- 每次订阅消息 POST 前，sender 先调用 repository 续租并验证 claim token，再原子 `reserveProviderAttempt(max=3)`。`provider_attempt_count` 在 memory/PG 中持久保存；invalid-token 刷新后的第二个 POST 同样先计数。
- timeout、network error 和不可解析响应统一为 `DELIVERY_OUTCOME_UNKNOWN`，job 直接 `failed` 等待人工复核，不进入自动 retry；已 reservation 授权标记 consumed。
- worker crash 后，过期 `processing` lease 直接恢复为 `failed + DELIVERY_OUTCOME_UNKNOWN`，消费 reservation 且不重新 pending。stale claim 无法续租、reserve provider attempt 或 finalize，恢复后 dispatcher 不再调用 provider。
- 只有微信明确返回、可重试且证明消息未送达的错误允许逻辑 retry；HTTP 429/5xx 本身不再作为自动 retry 依据。真实 provider POST 总数上限为 3，进程崩溃不会重置。

### Enabled 动态投影

- `getNotificationSettings` 和 channel-enabled 判断对 `wechat_subscribe` 按读取时间动态计算：`accept + unconsumed + (unreserved || reservationLeaseUntil <= now)`。
- 有效 reservation 返回 `enabled=false`；过期 reservation 在清理前即返回 `enabled=true`。memory 与 PostgreSQL 使用相同投影语义；实际 reservation 不会直接复用旧过期占用，后续 recovery 仍按 unknown 消费。

### TDD 与真实 PG 证据

- RED：新增测试最初出现 10 个预期失败，覆盖缺少 AbortController signal、unknown 被 retry、lease recovery 重新 claim、缺少 provider attempt 原子接口、动态 enabled 读取仍依赖持久 setting。
- GREEN 定向：client/dispatcher/memory/schema 共 27/27 通过，包含慢 fetch、慢响应体、worker crash 后 provider 0 调用、stale finalize 和 memory parity。
- GREEN 真实 PG：`node --test test/notification-postgres-gate.test.js` 完整 5/5 通过，包含 invalid-token 两次 POST、多轮逻辑 retry、crash-safe 实际 POST 上限 3、lease recovery unknown、stale finalize、动态 enabled parity。
- 外部 HTTP 仍全部使用注入 fake fetch；没有访问真实微信端点。

### 最终门禁

- `npm test`：235 tests，204 pass，31 skip，0 fail；通知真实 PG gate 在本次运行中实际执行。
- `npm run check`：通过。
- touched files 显式 `node --check`：通过。
- `npm run admin:build`：通过，生产后台 bundle 构建完成。
- `node tools/check-ui-parity.mjs`：六页 89/89 通过。
- `git diff --check`：提交前单独执行并记录在交付回复。

### 提交

- 提交信息：`fix: enforce at-most-once notification delivery`
