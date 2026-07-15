# Task 4A Report: 测验 Schema 与内存仓储

## 范围

- 仅提交 `backend/src/repositories/adaptiveSchema.js`、`backend/schema.sql`、`backend/test/adaptive-schema.test.js`、`backend/src/repositories/memoryStore.js`、`backend/test/memory-assessment.test.js`。
- 未修改 `postgresStore`、路由、`common/api`、商城或播放代码。

## RED

执行：`cd backend && node --test test/memory-assessment.test.js`

- 结果：6 个测试中 5 通过、1 失败，退出码 1。
- 失败测试：`assessment creation requires a user identity before persisting state`。
- 原因：原有实现会以空 `userId` 创建测验，未满足测验记录必须关联用户的仓储契约。

## GREEN

在 `createMemoryAssessment` 中增加 `userId`、`contentId`、`contentVersionId` 的 400 级必填校验；随后执行：

`cd backend && node --test test/memory-assessment.test.js test/adaptive-schema.test.js`

- 结果：12/12 通过，退出码 0。

## 实现

- 运行时和声明式 schema 均增加精确的 `memory_assessments` 表与 `memory_assessments_completion_key_uidx` 部分唯一索引；schema 镜像和幂等 DDL 测试同步覆盖。
- 内存仓储保存测验开始、抽样项、作答、熟悉度、开始/完成幂等键及完成响应。
- 抽样使用批准的内容版本结构；全量或选段范围均按顺序确定性抽样，至少 8 个单元取 8 个，否则每个单元一次，跨起始/中间/结束区间；输出没有全文或答案文本。
- 评分为 `cannot=0`、`partial=1`、`complete=2`，揭示扣 1 且不低于 0；平均分映射为 `new`、`partial`、`familiar`，并调用 `recommendPlan`。
- 完整作答在带 `assessmentId`、`userId`、完成幂等键时持久化；同一完成键返回首次推荐和测验状态。

## 测试

- 覆盖确定性 8 项抽样、首中尾区间、无全文、短范围无重复、选段范围、开始幂等、身份必填、揭示惩罚、阈值、纯评分调用、完成持久化和完成幂等。
- 覆盖 schema 表、开始唯一约束、完成唯一索引、运行时/声明式镜像和重复 DDL。

## 自审

- 对照补充需求确认列名、默认值、外键、唯一约束及部分索引文本一致。
- 对照仓储需求确认只从 `getContentStructure` 获得已批准版本，并复制返回对象防止调用方改写内存状态。
- 已确认本次提交只暂存 Task 4A 的五个源文件及本报告；工作树中的路由和客户端 API 改动不纳入。

## 顾虑

- PostgreSQL 仓储、HTTP 路由与客户端 API 属于拆分后的其他任务，未在本任务中端到端验证；本任务通过内存仓储和 schema 镜像测试验证其职责边界。
