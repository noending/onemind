# Task 4C Report: 认证测验路由与客户端 API

## 范围

- 仅提交 `backend/src/routes.js`、`common/api.js`、`backend/test/memory-assessment-routes.test.js`、`backend/test/client-assessment-api.test.js` 与本报告。
- 未修改仓储、schema、商城或播放代码；保留并审查了工作区既有的路由与客户端候选改动。

## RED

- 新增路由和客户端测试后执行 `cd backend && node --test test/memory-assessment-routes.test.js test/client-assessment-api.test.js`。
- 首次失败确认跨域允许头未包含 `Idempotency-Key`；修正测试请求头模拟后，其余认证、开始/完成幂等和客户端契约均通过。
- 再为预检成功状态添加断言，执行 `cd backend && node --test test/memory-assessment-routes.test.js`，失败为 `OPTIONS /api/memory-assessments` 返回 `404` 而非 `200`。

## 实现

- `POST /api/memory-assessments` 及 `POST /api/memory-plans/recommendation` 需要有效用户会话和 `Idempotency-Key`，分别返回 `AUTH_REQUIRED`、`IDEMPOTENCY_KEY_REQUIRED` 与 `ASSESSMENT_ID_REQUIRED`。
- 路由只从已验证会话注入 `userId`，忽略调用方提供的身份字段；开始和完成路径把仓储幂等语义直接暴露给客户端。
- 增加通用 `OPTIONS` 成功响应，并允许 `Idempotency-Key` 跨域请求头。
- 客户端新增创建测验、提交建议和读取版本结构函数；路径段使用 `encodeURIComponent`，幂等键仅转发到请求头而不会进入 JSON。

## 测试

- 路由测试使用 mock 微信登录接口取得真实签名 token，覆盖未认证、缺少键、缺少测验 ID、身份忽略、开始重试、完成重试和跨域预检。
- 客户端测试用最小 `wx` 存储/请求 stub 覆盖 URL、方法、认证头、精确幂等头、JSON 去重及路径编码。
- GREEN：聚焦 5/5 通过。
- 全量：`cd backend && npm test` 为 31 通过、0 失败、2 个既有 PostgreSQL gate 跳过；`npm run check`、`node --check ../common/api.js` 和 `git diff --check` 均通过。

## 自审与顾虑

- 仅暂存本任务所有权文件和报告；未还原其他工作区改动。
- PostgreSQL 测验持久化仍由 Task 4B 的环境门控测试覆盖，本任务的 HTTP 端到端覆盖固定使用内存仓储。
