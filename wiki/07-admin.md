# 07 · 管理后台（Admin Web）

后台是零依赖的纯静态 SPA，由后端在 `/admin` 与 `/admin/*` 路径下提供。

## 1. 文件结构

- 入口 [backend/admin/index.html](file:///Users/liam/Documents/workspace/oneMind/backend/admin/index.html)。
- 样式 [backend/admin/admin.css](file:///Users/liam/Documents/workspace/oneMind/backend/admin/admin.css)。
- 脚本 [backend/admin/admin.js](file:///Users/liam/Documents/workspace/oneMind/backend/admin/admin.js)。

## 2. 功能区（基于 index.html 节点）

- 顶栏 Hero：品牌 `一念法藏 · Admin`、标题 `数字法藏管理台`、说明文字。
- 状态卡片：服务连接状态（`#storeMode`）、健康文本（`#healthText`）、当前管理员角色（`#adminRoleText`）、退出按钮（`#logoutButton`）。
- 登录面板（`#loginPanel`）：用户名 / 密码表单，提交到 `/api/admin/login`。
- 指标网格（`#metrics`）：由 `admin.js` 拉取 `/api/admin/overview` 渲染。
- 内容库面板（`#contentsPanel`）：列表 + 创建 / 更新 / 归档。
- 资产库面板（`#assetsPanel`）：列表 + 创建 / 更新 / 归档 / 调整 `access_level`。
- 组织与成员面板（`#organizationsPanel`）。
- 审计日志面板（`#auditPanel`）。
- 提醒任务派发面板（`#notificationPanel`）。

## 3. 默认账号

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `magic` | `Noending5@` | `super_admin` |
| `editor` | `Noending5@` | `content_editor` |
| `reviewer` | `Noending5@` | `content_reviewer` |

> 内存模式下仅 `magic` 有效；`editor` / `reviewer` 需 PostgreSQL 模式 + `postgresStore` 完成 `initializeDatabase` 才会被写入种子。

## 4. 与后端的交互

- 登录：`POST /api/admin/login` → 写入 `localStorage` 中的 `oneMind.admin.token`。
- 鉴权头：`Authorization: Bearer <token>`。
- 退出：清 `localStorage` + 隐藏后续面板。
- 数据源切换：根据 `/health` 返回的 `storeMode` 显示「PostgreSQL / 内存」字样。

## 5. 权限矩阵

见 [06-backend.md](file:///Users/liam/Documents/workspace/oneMind/wiki/06-backend.md) §3 的 `ROLE_PERMISSIONS`。

- `super_admin` / `organization_admin`：可写 / 发 / 管权限 / 管成员。
- `platform_ops`：可写 / 发内容与资产。
- `content_editor`：可写内容与资产。
- `content_reviewer`：可发内容与资产。
- `asset_maintainer`：可写资产。
- `readonly_member`：仅可读。

## 6. 已知边界

- 静态资源仅 `index.html` / `admin.css` / `admin.js`；路由分发与鉴权在前端完成，深度操作仍由后端二次校验。
- 文件上传暂未实现（`schema.sql` 与 `assets` 仅有 URL 字段）。
- 微信真实 `code2Session` 需要配置 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`；默认 `mock` 模式会用 `code` 哈希生成本地 openid。
