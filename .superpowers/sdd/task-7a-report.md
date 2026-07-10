# Task 7A 报告：adaptive practice 纯状态机

## Status

- 新增 `common/practice-session.js`，提供 `createPracticeSession(task, options?)` 和 `advancePracticeStep(state, action)`。
- 固定阶段为 `study`、`first_character`、`free_recall`、`check`、`grade`；允许 grade 仅为 `again`、`good`、`easy`。
- 队列严格来自 `task.items`，保留 item 的 `id`、`memoryUnitId`、`taskType`、`unit`；`again` 将当前项排到现有项之后，`good/easy` 移除当前项。
- 状态转移不可变；记录 active start、阶段耗时、`revealAt`、`usedReveal`、`hintCount`、`mistakeCount`、`latencyMs` 和 `grade`。
- 重复 reveal 不重复计提示；错误只由 `mark_mistake` 显式累计；完成时返回 `activeUnit: null`、`isComplete: true`。

## TDD

- RED：初次运行聚焦测试因 `common/practice-session.js` 不存在而失败。
- RED：新增“提示不重置阶段计时”测试后先得到 `1000 !== 2000`，随后修复阶段起点计时。
- GREEN：聚焦测试最终 11/11 通过。

## 验证

- `cd backend && npm test`：105 项，88 通过、17 跳过、0 失败。
- `cd backend && node --test test/practice-session.test.js`：11/11 通过。
- `cd backend && node --check ../common/practice-session.js`：通过。
- `git diff --check`：通过。

## 顾虑

- 本任务按分配范围未修改 practice 页面；页面接入属于 brief 的后续 Task 7 步骤。
- PostgreSQL 相关既有测试因环境条件跳过；本任务本身为纯状态机，不依赖数据库。
