# Task 5 统一审查修复报告

## 修复范围

- 修复 memory 自适应计划列表遗漏，以及幂等记录未绑定 operation/entity 的问题。
- 修复 PostgreSQL 同 key 并发创建会提交多套 plan/state/task/item 的问题。
- 修复 item 完成响应来自写前 JavaScript 快照、末项并发后终态无法收敛的问题。
- 为跨日期 pending `new` 分配增加数据库唯一约束、历史 `plan_id` 回填和有界重算。
- 让 PostgreSQL `listPlans` 返回真实 adaptive public shape，同时保持 legacy 行不变。
- 同步 runtime schema、声明式 schema 和 schema tests，并移除 Task 5 新增生产代码中的非 ASCII 字符串。

## TDD RED 证据

### Memory RED

命令：`node --test test/adaptive-plan.test.js`

- 8 通过、2 失败、8 个 PostgreSQL 门控跳过。
- `listPlans` 找不到刚创建的 adaptive plan。
- 完成操作使用过的 key 被计划创建错误复用，没有返回 `409 IDEMPOTENCY_KEY_CONFLICT`。

### 真实 PostgreSQL 并发 RED

命令：`RUN_POSTGRES_ADAPTIVE_PLAN_TEST=1 node --test test/adaptive-plan.test.js`

- 两个子 Node 进程使用同一 key 创建计划后，数据库实际存在 `2 plans / 168 states / 2 tasks / 12 items`，仅有 1 条幂等记录。
- 两个子进程并发完成最后两个 pending item 后，item 与 state 已终结，但数据库仍为 `task=pending / plan=active`。
- 两个子进程并发请求不同日期后，两个任务有 6 个重叠 pending `new` 单元。
- PostgreSQL `listPlans` 返回内部 content UUID，且缺少 adaptive fields/item states。

并发测试由数据库触发器在关键 UPDATE/INSERT 上延迟两个独立子进程；子进程复用父进程已初始化的测试库，没有各自执行初始化。

### Schema RED

命令：`node --test test/adaptive-schema.test.js`

- 4 通过、1 失败；缺少 task item `plan_id` 和 pending-new 部分唯一索引。

## 实现

1. 计划创建先在同一 SQL 事务中抢占完整幂等记录，所有领域 INSERT 都从 reservation 的 `RETURNING` 取数；输家不产生领域行，并在独立新查询中读取赢家响应。
2. 当前同步 `psql -c` 架构不采用“同一 data-modifying CTE 先 INSERT reservation、再 UPDATE 同一新行”的方案，因为兄弟 DML CTE 共享语句快照，无法可靠通过基表二次观察该新行。替代方案在 reservation 时直接写入预生成 entity ID 和确定性最终响应；后续任一写失败会回滚整条事务。
3. item mutation 先锁定 task、原子 claim pending item，再更新 state/插入 weak retry；mutation 提交后，用新的 PostgreSQL 快照集合式重算 task status/counters 和 plan adaptive status，再从数据库回读并持久化完成响应。
4. `daily_study_task_items.plan_id` 已在 runtime/declarative schema 中声明并回填；部分唯一索引阻止同 plan/unit 的 pending `new` 重叠。索引竞争失败会回滚整次 task+items 写入，最多从新快照重算 3 次，不保留空任务。
5. memory/PG 幂等 operation 统一为 `adaptive_plan_create` 与 `study_task_item_complete`，旧 operation 值在 schema 初始化时幂等迁移。
6. memory `listPlans` 合并 legacy/adaptive；PG 对 adaptive 行复用真实 public mapper，legacy 行保持原字段与 fixed tasks。

## GREEN 与完整验证

- `node --test test/adaptive-plan.test.js`：10 通过、8 个 PG 门控跳过、0 失败。
- `RUN_POSTGRES_ADAPTIVE_PLAN_TEST=1 node --test test/adaptive-plan.test.js`：18/18 通过、0 失败。
- `node --test test/adaptive-schema.test.js`：5/5 通过。
- `npm test`：56 通过、16 个 PG 门控跳过、0 失败。
- `npm run check`：通过。
- `node --check ../common/memory.js`：通过。
- Task 5 生产新增行 ASCII 扫描：无非 ASCII 新增。
- `git diff --check`：通过。

## 自审与顾虑

- 修改仅覆盖 brief ownership：三个 repository/schema 文件、声明式 schema、两个测试文件及本报告；未修改 routes、common/api、common/memory、商城、播放或诵读。
- 并发创建的幂等 claim、领域写和响应处于同一数据库事务；跨日期分配的 task 与 items 也处于同一语句事务。
- 若历史数据库已经存在重复 pending `new` 行，首次创建唯一索引会显式失败；本修复不在迁移中静默删除或改写既有学习任务，部署前应先审计并人工决定保留哪一天的分配。
