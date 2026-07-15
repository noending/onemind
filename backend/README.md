# oneMind Backend Skeleton

This folder is the Phase 3 backend starting point for oneMind.

Current scope:

- Public content API for sutras, mantras, verses, and festival topics.
- Memory plan API for creating plans and completing review tasks.
- Dependency-free Node.js server for local contract verification.
- PostgreSQL schema baseline in `schema.sql`.
- PostgreSQL repository backed by local `onemind` database.
- Lightweight admin Web UI at `/admin`.
- WeChat mini-program auth endpoints (`/api/auth/wechat/login`, `/api/auth/me`).
- Notification capabilities, subscription grants, settings, and job endpoints.
- Admin role-based auth with route permission checks.
- Real WeChat subscribe-message dispatch with token caching, provider responses, and bounded retry.

Not included yet:

- Native iOS / Android / OHOS push delivery.
- Production file uploads and object-storage integration.

Run locally:

```bash
cd backend
npm run check
npm start
```

Default local URL:

```text
http://127.0.0.1:8787
```

Admin UI:

```text
http://127.0.0.1:8787/admin
```

Default local admin users (dev):

```text
magic / Noending5@ (super_admin)
editor / Noending5@ (content_editor)
reviewer / Noending5@ (content_reviewer)
```

WeChat login mode:

```text
WECHAT_LOGIN_MODE=mock   # default
WECHAT_LOGIN_MODE=hybrid # try code2Session first, fallback to mock
WECHAT_LOGIN_MODE=real   # require code2Session success
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...
WECHAT_SUBSCRIBE_TEMPLATES_JSON='{"review":{"templateId":"WECHAT_REVIEW_TEMPLATE_ID","label":"复习提醒","page":"pages/practice/index","fields":{"thing1":"title","thing2":"message"},"aliases":["memory_review"]},"recitation":{"templateId":"WECHAT_RECITATION_TEMPLATE_ID","label":"读诵提醒","page":"pages/recitation/index","fields":{"thing1":"title","thing2":"message"},"aliases":["chant"]}}'
```

`fields` 的值默认是 `notification_jobs.payload` 内的路径；`scheduledAt` 等 job 根字段也可直接引用。真实发送必须使用 `WECHAT_LOGIN_MODE=real` 获得的 openid，`mock_*` 登录标识会被 dispatcher 拒绝。

provider 只有在模板配置有效、`WECHAT_APP_ID`、`WECHAT_APP_SECRET` 均非空且 `WECHAT_LOGIN_MODE=real` 时才 ready。capabilities 与授权保存共用该判断，不回传任何配置值。

dispatcher 每次仅 claim 一个到期任务为 `processing`，写入 `claim_token/claimed_at/lease_until` 后才允许外发。授权也会按 job 和 claim token 原子 reservation。每次微信消息 POST 前必须续租并原子递增 `provider_attempt_count`，实际 HTTP 最多 3 次，token 无效刷新后的 POST 同样计数。消息请求和响应体读取使用 10 秒 AbortController 超时，显著短于 5 分钟 lease。

只有微信明确返回且证明未送达的可重试错误才进入退避。消息 POST 的 timeout/network/invalid response 统一记为 `DELIVERY_OUTCOME_UNKNOWN`，job 直接 `failed` 等待人工复核并消费已 reservation 的授权；过期 `processing` lease 也按 unknown 失败，绝不重新 `pending` 或复用授权。

三层验证入口：

- 队列：`GET /api/notification-jobs`
- 授权：`GET /api/notification-capabilities` 和 `POST /api/notification-subscriptions/wechat`
- 外发：`POST /api/admin/notification-jobs/dispatch`，返回 `sent/failed/retrying/providers`

手动派发要求 `notification.dispatch`；仅 `super_admin`、`platform_ops`、`organization_admin` 拥有该权限。

Default local database settings:

```text
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=magic
PGPASSWORD=Noending5@
PGDATABASE=onemind
```
