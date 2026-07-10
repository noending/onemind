# Task 4 统一审查修复报告

## 范围

- 修改 `backend/src/repositories/memoryStore.js`、`backend/src/repositories/postgresStore.js`、`backend/src/routes.js`。
- 扩充 `backend/test/memory-assessment.test.js` 与 `backend/test/memory-assessment-routes.test.js`；检查 `backend/test/client-assessment-api.test.js`，无需修改客户端契约。
- 未修改 `common/api.js`、schema、商城、播放或 UI 生产文案。

## RED

命令：

`cd backend && node --test test/memory-assessment.test.js test/memory-assessment-routes.test.js test/client-assessment-api.test.js`

- 退出码：1。
- 结果：22 项中 10 通过、6 失败、6 个 PostgreSQL gate 跳过。
- 关键失败：空白 `assessmentId` 返回 200；181 字符路由键返回 201；逆序答案原样持久化；未知答案、跨 assessment 完成键和空白仓储键均未抛出预期错误。

命令：

`cd backend && RUN_POSTGRES_ASSESSMENT_TEST=1 node --test test/memory-assessment.test.js`

- 退出码：1。
- 结果：16 项中 6 通过、10 失败。
- 关键失败：PG 逆序答案未规范化；跨 assessment 完成键返回旧响应；unknown、missing、duplicate 三类答案均未拒绝；空白键未拒绝。

## 修复

- 内存完成缓存保存 `assessmentId` 与响应；相同用户和完成键用于其他 assessment 时返回 `409 IDEMPOTENCY_KEY_CONFLICT`。
- PostgreSQL 幂等查询回读 `entityId` 并与当前 assessment 比较；写入后的 SQL 回读同时限定操作类型和当前实体，后续并发回读也执行相同冲突检查。
- 带 assessment 上下文时，两个仓储均要求答案恰好覆盖 sampled items 一次；未知、缺失、重复和数量不符统一返回 `400 ASSESSMENT_ANSWERS_INVALID`，持久化顺序按 sampled items 规范化。
- 纯 `recommendMemoryPlan` 评分路径保持兼容，仍允许答案不带 `memoryUnitId`。
- 路由先 trim `assessmentId`；空白返回 `ASSESSMENT_ID_REQUIRED`。
- 路由及两个仓储统一拒绝空白和超过 180 字符的幂等键，180 字符开始键和完成键均有通过覆盖。
- 三个 Task 4 新增测试文件中的固定测试数据均为 ASCII；未改 UI 文案。

## GREEN 与验证

- 聚焦：22 项中 16 通过、0 失败、6 个 PG gate 跳过，退出码 0。
- 真实 PG：16/16 通过，退出码 0。
- `npm test`：42 项中 35 通过、0 失败、7 个既有环境 gate 跳过，退出码 0。
- `npm run check`：退出码 0。
- `node --check ../common/api.js`：退出码 0。
- `git diff --check`：退出码 0。
- 三个新增测试文件 ASCII 扫描无匹配。

## 自审与顾虑

- 差异仅包含 Task 4 所有权文件和本报告，未还原或覆盖他人改动。
- schema 已具备 180 字符列和完成键唯一索引，本修复无需 schema 变更。
- PG gate 依赖本机 PostgreSQL；默认 `npm test` 继续按既有设计跳过这些环境测试，真实 PG 命令已单独通过。

## 第二轮复审修复

### RED

命令：

`cd backend && node --test test/memory-assessment.test.js`

- 退出码：1。
- 结果：18 项中 10 通过、1 失败、7 个 PostgreSQL gate 跳过。
- 关键失败：assessment A 用 K1 完成后，A/K2 未抛 `IDEMPOTENCY_KEY_CONFLICT`，测试报告 `Missing expected exception`。

命令：

`cd backend && RUN_POSTGRES_ASSESSMENT_TEST=1 node --test test/memory-assessment.test.js`

- 退出码：1。
- 结果：18 项中 16 通过、2 失败。
- 关键失败：memory 与 PostgreSQL 的 A/K2 场景均未抛 `IDEMPOTENCY_KEY_CONFLICT`。

### 修复

- memory assessment 已有 `completionResponse` 时，先比较当前 key 与 `completionIdempotencyKey`；仅原 key 返回原响应，其他 key 返回 409。
- PostgreSQL assessment 已有 `completionIdempotencyKey` 时执行相同比较；仅原 key 才读取原幂等记录。
- 保留原有 `entityId` 比较、答案集合校验和 sampled items 顺序规范化。
- 回归测试同时确认原 K1 仍返回首次响应，并用 B/K2 成功证明 A/K2 冲突未错误绑定 K2。
- 既有 `server.js` 会将仓储错误的 `statusCode` 与消息映射为 HTTP 响应，本轮不需要路由代码或 route 测试变更。

### GREEN 与验证

- 聚焦：18 项中 11 通过、0 失败、7 个 PG gate 跳过，退出码 0。
- 真实 PG：18/18 通过，退出码 0。
- `npm test`：44 项中 36 通过、0 失败、8 个环境 gate 跳过，退出码 0。
- `npm run check`：退出码 0。
- `node --check ../common/api.js`：退出码 0。
- `git diff --check`：退出码 0。
