# Task 4B Report: PostgreSQL 测验仓储

## 范围

- 仅修改 `backend/src/repositories/postgresStore.js` 与 `backend/test/memory-assessment.test.js`。
- 未修改 schema、商城、播放、路由或客户端；工作区既有的 `backend/src/routes.js`、`common/api.js` 外部改动未触碰。

## RED

执行：`cd backend && RUN_POSTGRES_ASSESSMENT_TEST=1 node --test test/memory-assessment.test.js`

- 结果：8 个测试中 7 通过、1 失败，退出码 1。
- 失败原因：`postgresStore.createMemoryAssessment is not a function`，证明真实 PostgreSQL 测试覆盖了尚未实现的仓储入口。

## 实现

- 新增并导出 PostgreSQL `createMemoryAssessment` 与 `recommendMemoryPlan`，保持与 `memoryStore` 相同的测验/推荐响应结构、评分阈值和必填校验。
- 复用已批准的 `getContentStructure`，将公开内容及版本别名解析为内部 UUID；`scope_id` 保留公开引用。
- 开始记录持久化到 `memory_assessments`，按用户与开始幂等键返回原记录；抽样固定为 8 个首字提示并覆盖首、中、尾，不返回全文。
- 完成时校验测验归属，原子更新答案、熟悉度、状态、完成时间与完成幂等键，并用 `idempotency_records` 保存首次推荐响应，重试返回原响应。
- 不带完整测验上下文的直接推荐在任何数据库访问前返回纯计算结果，不写测验记录。

## GREEN 与验证

- 真实 PG：同一 gated 命令最终 8/8 通过，退出码 0。
- 默认聚焦：`node --test test/memory-assessment.test.js`，7 通过、0 失败、1 跳过。
- 全量：`npm test`，26 通过、0 失败、2 个 gated 测试跳过。
- 静态检查：`npm run check` 退出码 0。
- 差异检查：`git diff --check` 退出码 0。

## 自审

- 真实 PG 测试覆盖初始化、唯一开始/完成键、确定性 8 项抽样、无全文、完成重试，以及答案/熟悉度/完成状态回读。
- 完成更新与首次响应写入位于同一顶层数据修改 CTE，避免只更新测验但未保存幂等响应的中间状态。
- 提交暂存范围仅包含本任务拥有的两个源/测试文件与本报告。

## 顾虑

- 真实 PG 测试依赖本机 PostgreSQL 与逐次 `psql` 初始化，单次运行约 172 秒；默认测试通过 gate 保持快速。
