# Task 5A 报告：内存自适应计划与每日任务状态机

## 完成内容

- 在 `memoryStore` 中新增自适应计划、每日任务和按用户幂等响应的内存集合。
- 实现并导出 `createAdaptivePlan`、`getTodayStudyTask`、`completeStudyTaskItem`；保留既有 `createPlan` 路径不变。
- 计划范围使用已审核的内容版本结构；每日任务的分配、评分和首轮完成判断分别复用 `allocateDailyUnits`、`applyReviewGrade`、`isInitialComplete`。
- 完成状态机支持固定日期、惰性后续任务、未完成和已完成新单元不重复分配、`again` 的单一同会话弱复习、任务待办归零才完成，以及跨日成功后的 `initial_complete`。

## TDD 记录

- RED：先运行 `node --test test/adaptive-plan.test.js`，初始 7 项接口测试因 `store.createAdaptivePlan is not a function` 失败。
- RED：补充跨日期未完成项去重测试，确认同一单元会被错误重复分配。
- GREEN：过滤已挂起任务的单元后，定向测试通过。
- RED：补充完成新单元的跨日去重测试，确认 `new` 阶段会重复分配。
- GREEN：首次评分前将新单元转入 `learning`，全部定向测试通过。

## 验证

- `node --test test/adaptive-plan.test.js`：8/8 通过。
- `npm test`：44 通过，8 个既有 PostgreSQL 集成测试按环境条件跳过，0 失败。
- `npm run check`：通过。
- `git diff --check`：通过。
