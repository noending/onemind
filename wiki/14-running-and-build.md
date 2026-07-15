# 14 · 运行与构建

## 1. 前台 MiniApp

### 1.1 环境

- 微信开发者工具：最新稳定版（需支持 `multiPlatform`）。
- 无 Node 依赖。前台运行不依赖 `package.json`。

### 1.2 启动步骤

1. 打开微信开发者工具 → 「导入项目」→ 选择仓库根目录（不是 `backend/`）。
2. 项目会自动识别：
   - `project.config.json` → `compileType: miniprogram`、`appid: wx852e7aca1252a0e7`。
   - `project.miniapp.json` → 三端配置。
3. 模拟器默认 `simulatorType: wechat`；可在右上角切换其他 MiniApp 模拟器（iOS / Android / OHOS）。
4. 点击「编译」即可在模拟器中预览。

### 1.3 启用后端

前台默认走本地数据；启用后端有两种方式：

- 在「我的 → 提醒设置」相关流程或调试代码中调用 `setBackendEnabled(true)`，或在小程序 storage 中写入 `oneMind.api.enabled = true`。
- 临时切换 Base URL：调用 `setBaseUrl("http://127.0.0.1:8787")` 或在 storage 中写 `oneMind.api.baseUrl`。

### 1.4 真机调试

- 微信开发者工具 → 「真机调试」；iOS / Android / OHOS 可分别在各自 MiniApp 模拟器中扫码进入。

## 2. 后端

### 2.1 环境

- Node.js 18+（`backend/package.json` 的 `engines.node: ">=18"`）。
- 可选：PostgreSQL 14+；不可用时自动回退到内存仓库。
- 可选：系统已安装 `psql`（`postgresStore.js` 通过 `child_process.execFileSync('psql', ...)` 调用）。

### 2.2 启动

```bash
cd backend
npm run check       # 语法检查（无需安装依赖）
npm start           # node src/server.js
```

输出：

```text
oneMind backend listening at http://127.0.0.1:8787
oneMind repository connected to PostgreSQL
```

或（PostgreSQL 不可用时）：

```text
oneMind repository using memory fallback: <reason>
```

### 2.3 健康检查

```bash
curl http://127.0.0.1:8787/health
```

返回：

```json
{ "ok": true, "service": "oneMind backend", "phase": "phase-3-phase-4-skeleton", "storeMode": "postgres" }
```

### 2.4 Admin 后台

浏览器打开 `http://127.0.0.1:8787/admin`，使用默认账号登录：

- `magic` / `Noending5@`（super_admin）
- `editor` / `Noending5@`（content_editor，PG 模式可用）
- `reviewer` / `Noending5@`（content_reviewer，PG 模式可用）

### 2.5 关键环境变量

```text
PORT=8787
HOST=127.0.0.1
ADMIN_USERNAME=magic
ADMIN_PASSWORD=Noending5@
ADMIN_TOKEN_SECRET=oneMind-local-admin
USER_TOKEN_SECRET=oneMind-local-user
WECHAT_LOGIN_MODE=mock
WECHAT_APP_ID=
WECHAT_APP_SECRET=
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=magic
PGPASSWORD=Noending5@
PGDATABASE=onemind
```

## 3. 设计参考 Web 包（design/）

### 3.1 安装与运行

```bash
cd design
pnpm install         # 依赖：React + Vite + Tailwind + shadcn/ui 风格
pnpm dev             # 启动 Vite Dev Server
```

### 3.2 截图

打开 Vite 预览页面，使用浏览器截屏工具将目标页面截取为 PNG，存入 `docs/ui-parity/screenshots/design/<page>.png`。

## 4. UI 一致性工具

```bash
cd tools
pnpm install
pnpm compare:shop
pnpm check:shop
pnpm compare:library
pnpm check:library
pnpm compare:ui
pnpm check:ui
```

## 5. 调试建议

- 路由 / 平台识别问题：检查 `app.json` 的 `pages` 顺序与 `app-tabbar.active`。
- 平台能力差异：使用「我的 → 平台」自检页。
- 后端连接失败：先 `/health` 看 `storeMode`，再 `setBackendEnabled(true)` 后重试。
- 数据回退：内存模式下，关闭后端进程即丢失全部数据；PG 模式才持久化。
- 训练页模式文案：检查 `pages/practice` 的 `mode` 与 `common/memory.js` 的 `methodForDay`。

## 6. 常见错误

- `REQUEST_TIMEOUT`：网络或后端未启动。检查 Base URL、端口、防火墙。
- `INVALID_CREDENTIALS`：管理员账号密码错误。检查 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。
- `WECHAT_CODE2SESSION_FAILED`：在 `real` 模式下 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 配置错误；可切到 `mock` / `hybrid`。
- `psql: command not found`：PostgreSQL 客户端未安装，仓库会回退到内存模式（不报错，仅 `console.warn`）。

## 7. 持续集成（建议）

- Lint：`npm run check`（后端语法）。
- 像素对齐：`tools` 下的 `compare:*` + `check:*`。
- 文档同步：每次功能变动同步 [docs/](file:///Users/liam/Documents/workspace/oneMind/docs) 与 `wiki/`。

## 8. 发布

- 微信小程序：在微信开发者工具中「上传」并提交审核。
- iOS / Android / OHOS MiniApp：按 `project.miniapp.json` 中三端配置构建。
- 后续阶段：将后端迁移到正式框架（Express / Fastify / Hono），并接入持久化数据库与对象存储。
