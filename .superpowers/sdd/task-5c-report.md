# Task 5C 报告：自适应计划路由、客户端 API 与兼容映射

## 完成内容

- `POST /api/memory-plans` 现在按 `contentVersionId` 或自适应字段分流到 `createAdaptivePlan`，要求有效的 `Idempotency-Key`，只使用登录会话用户；原有短计划请求继续走 `createPlan`，无需幂等键。
- 新增已认证的 `GET /api/study-tasks/today` 与 `POST /api/study-task-items/:itemId/complete`，完成 `planId`、幂等键边界、用户 ownership 和仓储业务错误透传。
- 客户端 `createMemoryPlanApi` 将 `idempotencyKey` 从 JSON 移到请求头，并新增、导出今日任务与 item 完成 API，路径和查询参数均做百分号编码。
- `common/memory.js` 可识别 adaptive plan，保留内容版本、范围、计划参数、策略、预计完成日期、状态和 item states；adaptive plan 的兼容 `tasks` 保持空数组，不把状态合成为 legacy fixed tasks。
- legacy 计划映射和旧式短计划创建行为保持不变。

## TDD 记录

- RED：先新增 route/client/mapping 三个测试文件并运行；10 项中 7 项按预期失败，命中缺少键校验、新路由、新客户端 API、header 搬移和 adaptive 映射字段，legacy 映射测试保持通过。
- GREEN：实现三个生产文件后，聚焦测试 10/10 通过。

## 验证

- `node --test test/adaptive-plan-routes.test.js test/client-adaptive-plan-api.test.js test/memory-adaptive-compat.test.js`：10/10 通过。
- `npm test`：54 通过，12 个 PostgreSQL 环境门控测试跳过，0 失败。
- `npm run check`：通过。
- `node --check ../common/api.js`：通过。
- `node --check ../common/memory.js`：通过。
- `git diff --check`：通过。

## 自审与顾虑

- 自审确认只修改 6 个所有权文件并新增本报告，没有修改 repositories、schema、商城、播放或诵读代码。
- PostgreSQL adaptive 路由行为由 5B 的仓储实现提供；本次完整测试未启用真实 PostgreSQL 环境门控，因此真实 PG 覆盖仍依赖 5B 已记录的 gated 测试结果。
