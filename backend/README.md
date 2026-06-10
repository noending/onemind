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
- Notification settings and job endpoints (`/api/notification-settings`, `/api/notification-jobs`).
- Admin role-based auth with route permission checks.
- Admin mock dispatch endpoint (`/api/admin/notification-jobs/dispatch`).

Not included yet:

- WeChat `code2Session` production integration.
- WeChat subscribe message delivery.
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
```

Default local database settings:

```text
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=magic
PGPASSWORD=Noending5@
PGDATABASE=onemind
```
