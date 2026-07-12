# 阶段 A 整分支终审 Important 修复报告

日期：2026-07-12

结论：DONE。5 个 Important 均按 TDD 完成修复，商城和播放域未修改。

## Finding 1：历史 pending 优先

- memory/PostgreSQL `getTodayStudyTask` 在生成指定日期任务前，先按日期升序返回该计划最早的、包含 pending item 的可执行历史任务。
- 昨日 `again` 产生的 `weak_review` 保留在历史任务中，完成历史任务后才生成新日期任务。
- 覆盖跨日漏练、昨日 again、ownership、并发读取和 provider 行为。

## Finding 2：稳定资格

- `good/easy` 仍按原间隔推进；`again` 的 lapse、次日 due 和同场 retry 语义不变。
- 只有 `good/easy && hintCount=0 && mistakeCount=0` 的跨日回忆才增加 `crossDaySuccessCount` 并获得稳定资格。
- 提示或错误的 good/easy 不再把单元推进到 stable。

## Finding 3：每日预算

- 分配顺序固定为 due、weak、new；三类都受 `dailyMinutes` 限制。
- review 成本为 0.5 分钟/项，new 成本为 1.5 分钟/项；84/14 首日保持 6 new。
- 大积压只取预算内前缀，剩余状态留待后续；仅预算不足以容纳任何一项时返回一项并标记 `minimumItemException`。
- `daily_study_tasks.estimated_minutes` 迁为 `numeric(6,1)`；same-session again retry 保留，但任务估时不超过 dailyMinutes。

## Finding 4：业务日期

- 新增统一 `Asia/Shanghai` 业务日期工具，memory/PostgreSQL 仓库和本地计划默认日期统一使用。
- `/api/study-tasks/today` 不再接受客户端 query date 作为生产权威日期；训练页请求不再传本地日期。
- repository/API 测试仍可显式注入固定日期；覆盖 UTC 15:59:59/16:00:00 的上海午夜边界。

## Finding 5：发布版本

- memory/PostgreSQL list/get content 统一返回权威 approved published version 的 `publishedVersionId`、`publishedVersionNo`、`reviewStatus`、`sourceNote`、`versionNote`、`sourceVersionNo`。
- PostgreSQL 选择最新 approved 且 `published_at` 非空的版本；新增 approved 版本测试和 provider parity。
- canonical Great Compassion v1 改为显式 upsert 修复冲突，并写入 `content.version.seed_reconciled` 审计；section/unit seed 同步改为可修复 upsert。
- backend 来源的客户端内容不再用内建 Great Compassion v1 补齐缺失发布字段；仅 local/fallback 允许内建版本。

## RED -> GREEN 证据

- 历史任务测试最初返回 2026-07-11 新任务而非 2026-07-10 pending，修复后通过。
- 提示/错误 good/easy 最初错误累计跨日成功，修复后仅 clean recall 累计。
- 5 分钟大积压最初装入 20 due + 10 weak，修复后只装入 10 due。
- 上海日期模块最初不存在，边界测试 RED；统一工具接入后 GREEN。
- PostgreSQL list/get 最初无 publishedVersionId，canonical v1 冲突被 DO NOTHING 保留；权威投影和显式审计修复后 GREEN。

## 最终验证

- `npm test`：183 tests，0 failed（默认跳过 PostgreSQL 门控）。
- 完整真实 PostgreSQL 门控：183 tests，182 pass，0 fail，1 skip；skip 为独立 seed-repair 破坏性测试。
- 独立真实 PostgreSQL canonical seed repair：1 pass，0 fail。
- `npm run check`：通过。
- 所有修改 JS 的 `node --check`：通过。
- `node tools/check-ui-parity.mjs`：Shop 13/13、Home 13/13、Library 16/16、Profile 14/14、Practice 14/14、Recitation 19/19。
- `git diff --check`：通过。

## Concerns

- canonical seed repair 测试会短暂制造数据库冲突，因此必须使用 `RUN_POSTGRES_SEED_REPAIR_TEST=1` 独立串行执行；不能与其他共享同一数据库的 PostgreSQL 测试并行。
- PostgreSQL 初始化仍会输出大量 `IF NOT EXISTS` NOTICE，不影响退出码和测试结果。
