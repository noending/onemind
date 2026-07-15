# Task 5B 报告：PostgreSQL 自适应计划、每日任务与 item 完成

## 完成内容

- 在 `postgresStore` 中实现并导出 `createAdaptivePlan`、`getTodayStudyTask`、`completeStudyTaskItem`，返回结构与 `memoryStore` 保持同形。
- 将自适应计划、范围内 `memory_item_states`、每日任务快照及任务项持久化到既有 adaptive 表；84 个状态和每日任务项均使用集合式 SQL 写入，没有逐单元启动 `psql`。
- 将公共 content/version/section 引用解析为内部 UUID 持久化，并在对外结果中恢复公共 content/version/section 引用。
- 复用 `allocateDailyUnits`、`applyReviewGrade`、`isInitialComplete`，后续日期任务按需惰性生成，并排除其他日期仍 pending 的单元。
- 使用 `idempotency_records` 持久化创建和完成响应；校验 180 字符上限、操作类型和 item 实体绑定，跨 item 重用 key 返回 `IDEMPOTENCY_KEY_CONFLICT`。
- `again` 完成源 item 后只保留一个 pending `weak_review`；重复完成不重复增加计数，任务仅在没有 pending item 时完成。

## TDD 记录

- RED：先加入 4 个 `RUN_POSTGRES_ADAPTIVE_PLAN_TEST=1` gated 真实 PostgreSQL 场景并执行；内存契约 8 项通过，PG 4 项均按预期失败于 `postgresStore.createAdaptivePlan is not a function`。
- GREEN：实现后修正写入 CTE 必须位于 PostgreSQL 顶层、惰性任务 `VALUES` UUID 显式转换两处 SQL 问题。
- 自审：收紧完成事务中的状态更新条件，仅允许源 item 仍为 `pending` 时更新状态，降低并发重复提交覆盖风险。

## 验证

- `RUN_POSTGRES_ADAPTIVE_PLAN_TEST=1 node --test test/adaptive-plan.test.js`：12/12 通过，0 失败。
- `node --test test/adaptive-plan.test.js`：8 通过，4 个真实 PG gated 测试按环境条件跳过，0 失败。
- `npm test`：44 通过，12 个既有/新增 PostgreSQL gated 测试按环境条件跳过，0 失败。
- `npm run check`：通过。
- `git diff --check`：通过。

## 顾虑

- 当前仓储继续沿用同步 `psql` 进程模型；本任务已将 84 状态和任务项改为集合式 SQL，但一次业务调用仍会执行少量整组查询。后续若迁移到连接池，可进一步减少进程启动成本。
