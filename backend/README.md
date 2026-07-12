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

三层验证入口：

- 队列：`GET /api/notification-jobs`
- 授权：`GET /api/notification-capabilities` 和 `POST /api/notification-subscriptions/wechat`
- 外发：`POST /api/admin/notification-jobs/dispatch`，返回 `sent/failed/retrying/providers`

Default local database settings:

```text
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=magic
PGPASSWORD=Noending5@
PGDATABASE=onemind
```
