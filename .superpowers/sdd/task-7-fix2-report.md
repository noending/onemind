# Task 7 Fix 2 报告

## 修复范围

- `pages/practice/index.js`
  - 成功提交后，仍有待练单元时按新 `activeUnit.memoryUnitId` 从 `response.plan.itemStates` 读取阶段和下次复习时间。
  - 当当天队列结束时，只有计划的全部单元均为 `stable` 才显示稳定状态；不再使用刚完成单元的 `response.state` 代表整个计划。
- `backend/src/repositories/memoryStore.js`
  - 自适应任务项统一返回 `result` 为评分字符串，并返回 `latencyMs`、`mistakeCount`、`hintCount`。
  - 新建与弱项重试任务项初始化相同的测量字段。
- `backend/src/repositories/postgresStore.js`
  - PostgreSQL 读取路径将 JSON 结果映射为相同 DTO，并兼容既有 `lastLatencyMs` JSON 数据。

## TDD

- RED：`node --test test/task7-contract.test.js` 初次运行 7 项中 3 项失败。
  - 内存项返回 `{ grade, reviewedAt, lastLatencyMs, ... }`，而非统一 DTO。
  - 稳定单元提交后，下一待练单元和当天结束但计划未全稳定两种场景均错误显示“稳定”。
- RED：`RUN_POSTGRES_ADAPTIVE_PLAN_TEST=1 node --test --test-name-pattern='memory and postgres providers return the same task-item result DTO' test/adaptive-plan.test.js` 失败，确认 PostgreSQL 只返回评分字符串且缺少测量字段。
- GREEN：页面行为、内存 DTO、PostgreSQL provider parity 均通过。

## 新增覆盖

- 稳定单元完成后仍有 pending 新单元时，页面显示新单元的 `learning` 状态和其 `dueAt`。
- 当天队列结束但计划仍含非稳定单元时，页面不显示稳定状态。
- 内存 provider 在完成响应和重新读取任务中均返回统一任务项 DTO。
- PostgreSQL provider 与内存 provider 的 DTO 一致，且 PostgreSQL 重新读取结果保持一致。

## 验证

- `node --test test/adaptive-practice-page.test.js`：3/3 通过。
- `node --test test/task7-contract.test.js`：7/7 通过。
- PostgreSQL provider parity 聚焦测试：1/1 通过。
- `npm test`：116 项，98 通过、18 跳过、0 失败。
- `npm run check`：通过。
- `node --check ../pages/practice/index.js && node --check src/repositories/memoryStore.js && node --check src/repositories/postgresStore.js`：通过。
- `git diff --check`：通过。

## 顾虑

- 全量 PostgreSQL 测试文件的外层控制会话在 schema NOTICE 后未回传最终汇总，因此未将其结果计为验证证据；本次新增的真实 PostgreSQL parity 聚焦测试已通过。
- 未恢复播放能力；评分仍限制为 `again`、`good`、`easy`；旧短内容分支未改动；请求继续通过 `Idempotency-Key` 传递幂等键。

## 最后一个 Important：创建响应 DTO parity

### 修复

- PostgreSQL `createAdaptivePlan` 首次响应的 `itemStates` 现在包含 `lastLatencyMs`、`mistakeCount`、`hintCount`，初始值均为 `0`。
- 首次响应的 `task.items` 现在包含 `latencyMs`、`mistakeCount`、`hintCount` 与完整 `unit` 快照。
- 完整 DTO 在创建时写入幂等响应记录，因此首次创建与同键重试保持一致；字段 shape 与后续 GET mapper 返回一致。

### TDD

- RED：真实 memory/PostgreSQL 创建 parity 测试失败，精确显示 PostgreSQL 首次响应缺少 3 个 state 测量字段，以及 task item 的 3 个测量字段和 `unit`。
- GREEN：添加完整创建 DTO 后，同一测试确认 memory/PostgreSQL 创建响应 parity，并确认 PostgreSQL 首次响应与后续 `listPlans`、`getTodayStudyTask` 读取结果一致。

### 聚焦验证

- PostgreSQL 创建 DTO parity 与创建幂等测试：2/2 通过。
- memory 创建范围、首日分配与幂等测试：3/3 通过。
- `node --check src/repositories/postgresStore.js`：通过。
- `git diff --check`：通过。
- 按要求未重跑完整 PostgreSQL 集成测试文件。
