# 长咒自适应学习阶段 A 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可复用于大悲咒、楞严咒等长咒的真实学习核心，包括内容层级、60 秒熟悉度测验、可配置周期、每日记忆单元范围、失败补练和幂等完成。

**Architecture:** 新增长咒专用的纯函数调度核心，并让内存仓库与 PostgreSQL 仓库通过相同接口持久化内容结构、计划、单元状态和每日任务。长咒通过新接口进入测验与计划设置页，训练页按当天任务项运行；现有短内容、诵读和商城路径保持兼容，旧长咒计划只提示迁移，不静默改写。

**Tech Stack:** 微信小程序原生 WXML/WXSS/CommonJS JavaScript、Node.js 18 内置测试运行器、Node HTTP 后端、PostgreSQL。

## Global Constraints

- 所有新增行为先写失败测试并确认按预期失败，再写生产代码。
- 不恢复音频播放功能，不加入语音识别。
- 7/14/28 天与自定义周期表示首轮学习周期，不表示永久掌握。
- 自动拆分内容不能直接发布；阶段 A 只消费已校对结构。
- 现有商城入口、音乐、唐卡、画、收藏、浏览记录和购物车必须保留。
- 不修改 `common/shop.js`、`pages/shop/index.js`、`pages/shop/index.wxml`、`pages/shop/index.wxss`，除非商城回归测试证明存在由本阶段引入的兼容问题。
- 不静默迁移旧长咒计划；旧计划显示迁移提示，由用户确认后创建新计划。
- 所有修改类新接口接受 `Idempotency-Key`。
- 新增文件保持 CommonJS 和 ASCII 代码字符；用户界面文案可以使用中文。

---

### Task 1: 建立测试入口与纯函数调度核心

**Files:**
- Create: `common/adaptive-memory.js`
- Create: `backend/test/adaptive-memory.test.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `normalizeTargetDays(value): number`
- Produces: `recommendPlan(input): Recommendation`
- Produces: `allocateDailyUnits(input): DailyAllocation`
- Produces: `applyReviewGrade(state, review): MemoryItemState`
- Produces: `isInitialComplete(states): boolean`
- Consumes: no repository or `wx` globals; this module must remain pure and directly testable.

- [ ] **Step 1: Add the Node test command and write recommendation tests**

Add to `backend/package.json`:

```json
"test": "node --test test/*.test.js"
```

Create `backend/test/adaptive-memory.test.js` with the first tests:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTargetDays,
  recommendPlan
} = require('../../common/adaptive-memory');

test('normalizes custom target days into the supported 3 to 84 day range', () => {
  assert.equal(normalizeTargetDays(1), 3);
  assert.equal(normalizeTargetDays(14), 14);
  assert.equal(normalizeTargetDays(120), 84);
});

test('recommends 28, 14, and 7 days from familiarity', () => {
  assert.equal(recommendPlan({ unitCount: 84, familiarityLevel: 'new', dailyMinutes: 15 }).targetDays, 28);
  assert.equal(recommendPlan({ unitCount: 84, familiarityLevel: 'partial', dailyMinutes: 15 }).targetDays, 14);
  assert.equal(recommendPlan({ unitCount: 84, familiarityLevel: 'familiar', dailyMinutes: 15 }).targetDays, 7);
});

test('shows workload instead of promising mastery', () => {
  const result = recommendPlan({ unitCount: 84, familiarityLevel: 'partial', dailyMinutes: 15 });
  assert.equal(result.newUnitsPerDay, 6);
  assert.match(result.disclaimer, /首轮学习/);
  assert.doesNotMatch(result.disclaimer, /一定背会/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module '../../common/adaptive-memory'`.

- [ ] **Step 3: Implement target-day normalization and plan recommendation**

Create `common/adaptive-memory.js` with these exports and return shape:

```js
const TARGET_DAY_MIN = 3;
const TARGET_DAY_MAX = 84;
const DEFAULT_TARGET_DAYS = {
  new: 28,
  partial: 14,
  familiar: 7
};

function normalizeTargetDays(value) {
  const parsed = Math.round(Number(value || 14));
  return Math.max(TARGET_DAY_MIN, Math.min(TARGET_DAY_MAX, parsed));
}

function recommendPlan({ unitCount, familiarityLevel = 'new', dailyMinutes = 15, targetDays } = {}) {
  const totalUnits = Math.max(1, Number(unitCount || 1));
  const recommendedDays = DEFAULT_TARGET_DAYS[familiarityLevel] || DEFAULT_TARGET_DAYS.new;
  const normalizedDays = normalizeTargetDays(targetDays || recommendedDays);
  const newUnitsPerDay = Math.max(1, Math.ceil(totalUnits / normalizedDays));
  const estimatedMinutes = Math.max(5, Math.ceil(newUnitsPerDay * 1.5 + Math.min(totalUnits, newUnitsPerDay * 2) * 0.5));
  const intensity = estimatedMinutes > Number(dailyMinutes || 15) ? 'high' : normalizedDays <= 7 ? 'high' : normalizedDays <= 14 ? 'standard' : 'steady';

  return {
    targetDays: normalizedDays,
    newUnitsPerDay,
    estimatedMinutes,
    dailyMinutes: Math.max(5, Number(dailyMinutes || 15)),
    intensity,
    disclaimer: `${normalizedDays} 天用于完成首轮学习，之后仍会继续长期复习。`
  };
}
```

- [ ] **Step 4: Write failing daily-allocation tests**

Append tests that assert due and weak items come before new items and that an 84-unit, 14-day plan never allocates all units:

```js
const { allocateDailyUnits } = require('../../common/adaptive-memory');

test('allocates due and weak units before new units', () => {
  const result = allocateDailyUnits({
    states: [
      { memoryUnitId: 'due', phase: 'reviewing', dueAt: '2026-07-10', lastGrade: 'good' },
      { memoryUnitId: 'weak', phase: 'learning', dueAt: '2026-07-12', lastGrade: 'again' },
      { memoryUnitId: 'new-1', phase: 'new' },
      { memoryUnitId: 'new-2', phase: 'new' }
    ],
    date: '2026-07-10',
    dailyMinutes: 15,
    targetDays: 14
  });

  assert.deepEqual(result.items.slice(0, 2).map((item) => item.taskType), ['due_review', 'weak_review']);
});

test('a 14 day great compassion allocation does not load all 84 units', () => {
  const states = Array.from({ length: 84 }, (_, index) => ({ memoryUnitId: `unit-${index + 1}`, phase: 'new' }));
  const result = allocateDailyUnits({ states, date: '2026-07-10', dailyMinutes: 15, targetDays: 14 });
  assert.equal(result.newUnitCount, 6);
  assert.ok(result.items.length < 84);
});
```

- [ ] **Step 5: Run tests, verify RED, then implement allocation**

Run `npm test`; expect FAIL because `allocateDailyUnits` is not exported. Implement it so it:

- sorts due items by `dueAt`;
- then includes `lastGrade === 'again'` items;
- calculates the new-item cap as `ceil(remainingNew / targetDays)` bounded by the daily minute budget;
- returns `{ items, newUnitCount, reviewUnitCount, weakUnitCount, estimatedMinutes }`;
- assigns `taskType` values `due_review`, `weak_review`, and `new`.

- [ ] **Step 6: Write failing grade and completion tests**

```js
const { applyReviewGrade, isInitialComplete } = require('../../common/adaptive-memory');

test('again creates a same-session retry and next-day due date', () => {
  const next = applyReviewGrade(
    { memoryUnitId: 'u1', phase: 'learning', successfulRecallCount: 0, crossDaySuccessCount: 0 },
    { grade: 'again', reviewedAt: '2026-07-10T08:00:00.000Z', mistakeCount: 1, hintCount: 1, latencyMs: 5000 }
  );
  assert.equal(next.lastGrade, 'again');
  assert.equal(next.needsSameSessionRetry, true);
  assert.equal(next.dueAt, '2026-07-11');
  assert.equal(next.lapseCount, 1);
});

test('a unit only becomes stable after a later-day successful recall', () => {
  const first = applyReviewGrade(
    { memoryUnitId: 'u1', phase: 'learning', successfulRecallCount: 0, crossDaySuccessCount: 0 },
    { grade: 'good', reviewedAt: '2026-07-10T08:00:00.000Z' }
  );
  const second = applyReviewGrade(first, { grade: 'good', reviewedAt: '2026-07-11T08:00:00.000Z' });
  assert.notEqual(first.phase, 'stable');
  assert.equal(second.phase, 'stable');
  assert.equal(isInitialComplete([second]), true);
});
```

- [ ] **Step 7: Run tests, verify RED, implement review transitions, then verify GREEN**

Implement grade intervals for phase A:

```js
const INTERVAL_BY_GRADE = { again: 1, good: 3, easy: 7 };
```

`applyReviewGrade` must preserve the previous state, increment counters, compare natural dates for cross-day success, and set `phase = 'stable'` only when `crossDaySuccessCount >= 1` and the latest grade is not `again`.

Run:

```bash
npm test
```

Expected: all adaptive-memory tests PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add common/adaptive-memory.js backend/test/adaptive-memory.test.js backend/package.json
git commit -m "feat: add adaptive long-content scheduler core"
```

---

### Task 2: 增加可迁移的自适应学习数据库结构

**Files:**
- Create: `backend/src/repositories/adaptiveSchema.js`
- Create: `backend/test/adaptive-schema.test.js`
- Modify: `backend/schema.sql`
- Modify: `backend/src/repositories/postgresStore.js`

**Interfaces:**
- Produces: `ensureAdaptiveSchema(execute): void`
- Produces tables: `content_sections`, `memory_units`, `memory_item_states`, `daily_study_tasks`, `daily_study_task_items`, `idempotency_records`
- Extends: `content_versions`, `memory_plans`

- [ ] **Step 1: Write a failing schema executor test**

Create `backend/test/adaptive-schema.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureAdaptiveSchema } = require('../src/repositories/adaptiveSchema');

test('adaptive schema creates every required table and plan column', () => {
  const statements = [];
  ensureAdaptiveSchema((sql) => statements.push(sql));
  const joined = statements.join('\n');
  for (const table of ['content_sections', 'memory_units', 'memory_item_states', 'daily_study_tasks', 'daily_study_task_items', 'idempotency_records']) {
    assert.match(joined, new RegExp(`create table if not exists ${table}`));
  }
  for (const column of ['content_version_id', 'scope_type', 'scope_id', 'target_days', 'daily_minutes', 'familiarity_level', 'strategy', 'expected_finish_date']) {
    assert.match(joined, new RegExp(`add column if not exists ${column}`));
  }
});
```

- [ ] **Step 2: Run tests and verify RED**

Run `npm test`; expect FAIL because `adaptiveSchema.js` does not exist.

- [ ] **Step 3: Implement schema statements in one focused module**

`ensureAdaptiveSchema(execute)` must call `execute(sql)` for:

```sql
alter table content_versions add column if not exists review_status varchar(32) not null default 'draft';
alter table content_versions add column if not exists source_note text;
alter table content_versions add column if not exists version_note text;
alter table content_versions add column if not exists reviewed_by uuid references admin_users(id);
alter table content_versions add column if not exists reviewed_at timestamptz;
alter table content_versions add column if not exists published_at timestamptz;

create table if not exists content_sections (
  id uuid primary key default gen_random_uuid(),
  content_version_id uuid not null references content_versions(id),
  title varchar(180) not null,
  subtitle varchar(220),
  source_anchor varchar(180),
  sort_order int not null,
  created_at timestamptz not null default now(),
  unique (content_version_id, sort_order)
);

create table if not exists memory_units (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references content_sections(id),
  text text not null,
  phonetic_text text,
  first_character_cue text,
  estimated_seconds int not null default 30,
  sort_order int not null,
  created_at timestamptz not null default now(),
  unique (section_id, sort_order)
);
```

Add the memory-state, daily-task and idempotency tables with the exact fields from the approved design. Add indexes for `(plan_id, due_at)`, `(plan_id, task_date)`, `(task_id, sort_order)`, and a unique constraint on `(user_id, idempotency_key)`.

- [ ] **Step 4: Extend `memory_plans` without removing legacy columns**

Add the following nullable compatibility columns, one `alter table memory_plans add column if not exists` statement per row:

```sql
content_version_id uuid references content_versions(id),
scope_type varchar(24) not null default 'full',
scope_id uuid,
target_days int,
daily_minutes int,
familiarity_level varchar(24),
strategy varchar(24),
expected_finish_date date,
adaptive_status varchar(32)
```

Keep `total_days`, `current_day`, `state`, and existing `review_tasks` until all short-content and old-plan consumers are migrated.

- [ ] **Step 5: Wire initialization and declarative schema**

- Call `ensureAdaptiveSchema(queryScalar)` from `ensureFeatureSchema()` in `postgresStore.js`.
- Mirror the same tables and columns in `backend/schema.sql`.
- Do not alter `assets`, `content_assets`, or any shop-related schema.

- [ ] **Step 6: Run tests and backend checks**

Run:

```bash
npm test
npm run check
```

Expected: tests PASS and all syntax checks exit 0.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/src/repositories/adaptiveSchema.js backend/test/adaptive-schema.test.js backend/schema.sql backend/src/repositories/postgresStore.js
git commit -m "feat: add adaptive learning persistence schema"
```

---

### Task 3: 提供已审核长咒结构并保持内容版本快照

**Files:**
- Modify: `common/content.js`
- Modify: `common/api.js`
- Modify: `backend/src/data/seed.js`
- Modify: `backend/src/repositories/memoryStore.js`
- Modify: `backend/src/repositories/postgresStore.js`
- Modify: `backend/src/routes.js`
- Create: `backend/test/content-structure.test.js`

**Interfaces:**
- Produces: `getContentStructure(contentId, versionId): ContentStructure`
- Produces endpoint: `GET /api/contents/:contentId/versions/:versionId/structure`
- Extends normalized content with `publishedVersionId`, `sourceNote`, `versionNote`, `reviewStatus`, `sections`

- [ ] **Step 1: Write failing content-structure tests**

Test the memory repository first:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/repositories/memoryStore');

test('great compassion exposes one or more reviewed sections and exactly 84 ordered units', () => {
  const content = store.listContents().find((item) => item.title === '大悲咒');
  const structure = store.getContentStructure(content.id, content.publishedVersionId);
  assert.equal(structure.reviewStatus, 'approved');
  assert.ok(structure.sections.length > 0);
  assert.equal(structure.sections.flatMap((section) => section.units).length, 84);
  assert.equal(structure.sections[0].units[0].sortOrder, 1);
});

test('unapproved content versions cannot be returned as plan-ready structures', () => {
  assert.throws(
    () => store.getContentStructure('draft-content', 'draft-version'),
    /CONTENT_VERSION_NOT_APPROVED/
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run `npm test`; expect FAIL because `getContentStructure` is not implemented.

- [ ] **Step 3: Add an approved seed structure for 大悲咒**

Keep the existing 84 strings as the authoritative unit order. Add seed metadata and a deterministic helper:

```js
function buildGreatCompassionSection(sectionIndex, startIndex, endIndex) {
  return {
    id: `great-compassion-section-${sectionIndex}`,
    title: `第${sectionIndex}学习段`,
    sortOrder: sectionIndex,
    units: GREAT_COMPASSION_SEGMENTS.slice(startIndex, endIndex).map((text, offset) => ({
      id: `great-compassion-unit-${startIndex + offset + 1}`,
      text,
      pinyin: '',
      firstCharacterCue: Array.from(text)[0] || '',
      estimatedSeconds: 30,
      sortOrder: startIndex + offset + 1
    }))
  };
}

publishedVersion: {
  id: 'great-compassion-v1',
  versionNo: 1,
  reviewStatus: 'approved',
  sourceNote: '经人工校对的首发版本',
  versionNote: '首版 84 句学习结构'
},
sections: [
  buildGreatCompassionSection(1, 0, 14),
  buildGreatCompassionSection(2, 14, 28),
  buildGreatCompassionSection(3, 28, 42),
  buildGreatCompassionSection(4, 42, 56),
  buildGreatCompassionSection(5, 56, 70),
  buildGreatCompassionSection(6, 70, 84)
]
```

Continue sections until all 84 units are represented exactly once. Do not invent pinyin where none has been reviewed; use an empty string.

- [ ] **Step 4: Implement repository structure reads**

- Memory store reads seed `publishedVersion` and `sections`.
- PostgreSQL store reads `content_versions`, `content_sections`, and `memory_units` ordered by `sort_order`.
- Both stores reject versions whose `review_status` is not `approved`.
- Return the same shape from both repositories.

- [ ] **Step 5: Add the public structure route**

In `routes.js`, parse the exact route pattern and return:

```json
{
  "data": {
    "contentId": "great-compassion-opening",
    "contentVersionId": "great-compassion-v1",
    "reviewStatus": "approved",
    "sections": []
  }
}
```

Return HTTP 404 for missing content/version and HTTP 409 for an unapproved version.

- [ ] **Step 6: Fix content normalization precedence**

In `common/api.js`, prefer server-provided `item.segments` and `item.sections` before built-in fallback data. Preserve built-in data only when the backend omits the field. Expose source/version/review fields instead of discarding them.

- [ ] **Step 7: Run tests and verify GREEN**

Run:

```bash
npm test
npm run check
node --check ../common/api.js
node --check ../common/content.js
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit Task 3**

```bash
git add common/content.js common/api.js backend/src/data/seed.js backend/src/repositories/memoryStore.js backend/src/repositories/postgresStore.js backend/src/routes.js backend/test/content-structure.test.js
git commit -m "feat: expose reviewed long-content structures"
```

---

### Task 4: 增加熟悉度测验和计划建议接口

**Files:**
- Modify: `backend/src/repositories/memoryStore.js`
- Modify: `backend/src/repositories/postgresStore.js`
- Modify: `backend/src/routes.js`
- Modify: `common/api.js`
- Create: `backend/test/memory-assessment.test.js`

**Interfaces:**
- Produces: `createMemoryAssessment(payload): Assessment`
- Produces: `recommendMemoryPlan(payload): Recommendation`
- Produces endpoints: `POST /api/memory-assessments`, `POST /api/memory-plans/recommendation`
- Consumes: `recommendPlan` from `common/adaptive-memory.js`

- [ ] **Step 1: Write failing assessment tests**

```js
test('assessment samples the beginning middle and end of the selected scope', () => {
  const sample = store.createMemoryAssessment({
    userId: 'demo-user',
    contentId: 'great-compassion-opening',
    scopeType: 'full'
  });
  assert.ok(sample.items.length >= 6 && sample.items.length <= 10);
  assert.equal(sample.items[0].positionBand, 'start');
  assert.ok(sample.items.some((item) => item.positionBand === 'middle'));
  assert.ok(sample.items.some((item) => item.positionBand === 'end'));
});

test('assessment answers produce a familiarity level and recommendation', () => {
  const result = store.recommendMemoryPlan({
    unitCount: 84,
    answers: Array.from({ length: 8 }, () => ({ result: 'partial', revealed: true, latencyMs: 4000 })),
    dailyMinutes: 15
  });
  assert.equal(result.familiarityLevel, 'partial');
  assert.equal(result.targetDays, 14);
});
```

- [ ] **Step 2: Run tests and verify RED**

Expected: methods are missing.

- [ ] **Step 3: Implement sampling and scoring**

- Sample deterministic positions from start, middle, and end so tests and retries use the same units.
- Score `cannot = 0`, `partial = 1`, `complete = 2`.
- Reduce one point when the answer was revealed.
- Map average score `< 0.75` to `new`, `< 1.5` to `partial`, otherwise `familiar`.
- Persist completed assessment answers with user, content version and scope.

- [ ] **Step 4: Add authenticated routes and front-end API functions**

Add:

```js
createMemoryAssessmentApi(payload)
recommendMemoryPlanApi(payload)
getContentStructureApi(contentId, versionId)
```

Both POST routes require `userSession`. Return `AUTH_REQUIRED` without silently creating demo-user data.

- [ ] **Step 5: Run tests and commit**

```bash
npm test
npm run check
node --check ../common/api.js
git add backend/src/repositories/memoryStore.js backend/src/repositories/postgresStore.js backend/src/routes.js common/api.js backend/test/memory-assessment.test.js
git commit -m "feat: add long-content assessment recommendations"
```

---

### Task 5: 创建自适应计划、每日任务与幂等完成

**Files:**
- Modify: `backend/src/repositories/memoryStore.js`
- Modify: `backend/src/repositories/postgresStore.js`
- Modify: `backend/src/routes.js`
- Modify: `common/api.js`
- Modify: `common/memory.js`
- Create: `backend/test/adaptive-plan.test.js`

**Interfaces:**
- Produces: `createAdaptivePlan(payload): MemoryPlan`
- Produces: `getTodayStudyTask(userId, planId, date): DailyStudyTask`
- Produces: `completeStudyTaskItem(payload): CompletionResult`
- Produces endpoint: `GET /api/study-tasks/today`
- Produces endpoint: `POST /api/study-task-items/:itemId/complete`

- [ ] **Step 1: Write failing plan-scope and allocation tests**

Cover full and section scopes with concrete assertions:

```js
test('full and section plans initialize only their selected units', () => {
  const content = store.listContents().find((item) => item.title === '大悲咒');
  const structure = store.getContentStructure(content.id, content.publishedVersionId);
  const section = structure.sections[0];
  const fullPlan = store.createAdaptivePlan({
    userId: 'adaptive-user-full',
    contentId: content.id,
    contentVersionId: content.publishedVersionId,
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10'
  });
  const sectionPlan = store.createAdaptivePlan({
    userId: 'adaptive-user-section',
    contentId: content.id,
    contentVersionId: content.publishedVersionId,
    scopeType: 'section',
    scopeId: section.id,
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10'
  });

  assert.equal(fullPlan.itemStates.length, 84);
  assert.deepEqual(
    sectionPlan.itemStates.map((item) => item.memoryUnitId),
    section.units.map((unit) => unit.id)
  );
});

test('a 14 day great compassion plan creates a first task with six new units', () => {
  const content = store.listContents().find((item) => item.title === '大悲咒');
  const plan = store.createAdaptivePlan({
    userId: 'adaptive-user-task',
    contentId: content.id,
    contentVersionId: content.publishedVersionId,
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10'
  });
  const task = store.getTodayStudyTask('adaptive-user-task', plan.id, '2026-07-10');
  assert.equal(task.newUnitCount, 6);
  assert.equal(task.items.filter((item) => item.taskType === 'new').length, 6);
});
```

Use fixed dates in every test; production functions must accept an injected date rather than calling `new Date()` internally.

- [ ] **Step 2: Run tests and verify RED**

Expected: adaptive plan methods are missing.

- [ ] **Step 3: Implement plan initialization**

For long content:

- validate approved version and selected scope;
- create one `MemoryItemState` per selected `MemoryUnit` with `phase = 'new'`;
- set `targetDays`, `dailyMinutes`, `familiarityLevel`, `strategy`, and `expectedFinishDate`;
- generate the first `DailyStudyTask` through `allocateDailyUnits`;
- preserve the old `createPlan` path for non-long content.

- [ ] **Step 4: Write failing retry and terminal-state tests**

```js
test('again leaves an executable retry even on the final unit', () => {
  const result = store.completeStudyTaskItem({ itemId, userId, grade: 'again', idempotencyKey: 'retry-final' });
  assert.ok(result.task.items.some((item) => item.status === 'pending'));
  assert.notEqual(result.plan.adaptiveStatus, 'initial_complete');
});

test('repeating an idempotency key returns the original result without changing counters', () => {
  const first = store.completeStudyTaskItem({ itemId, userId, grade: 'good', idempotencyKey: 'same-key' });
  const second = store.completeStudyTaskItem({ itemId, userId, grade: 'good', idempotencyKey: 'same-key' });
  assert.deepEqual(second, first);
});
```

- [ ] **Step 5: Implement idempotent item completion**

- Check `(userId, idempotencyKey)` before mutation.
- Apply the grade to the linked `MemoryItemState`.
- On `again`, append or reactivate one same-session `weak_review` task item.
- Mark the daily task complete only when no task items remain pending.
- Generate the next due task without pre-creating hundreds of fixed review tasks.
- Persist and return the full response in `idempotency_records`.

- [ ] **Step 6: Add routes and compatibility adapters**

- `POST /api/memory-plans` accepts adaptive fields for long content and keeps the old request valid for short content.
- `GET /api/study-tasks/today?planId=plan_123` returns only task items for the requested user.
- `POST /api/study-task-items/:itemId/complete` requires `Idempotency-Key` and validates ownership.
- `common/memory.js` maps adaptive plans without turning them into legacy fixed tasks.

- [ ] **Step 7: Run tests and commit**

```bash
npm test
npm run check
node --check ../common/api.js
node --check ../common/memory.js
git add backend/src/repositories/memoryStore.js backend/src/repositories/postgresStore.js backend/src/routes.js common/api.js common/memory.js backend/test/adaptive-plan.test.js
git commit -m "feat: add adaptive daily study tasks"
```

---

### Task 6: 增加长咒范围、测验与计划设置页面

**Files:**
- Create: `pages/assessment/index.js`
- Create: `pages/assessment/index.wxml`
- Create: `pages/assessment/index.wxss`
- Create: `pages/assessment/index.json`
- Create: `pages/plan-setup/index.js`
- Create: `pages/plan-setup/index.wxml`
- Create: `pages/plan-setup/index.wxss`
- Create: `pages/plan-setup/index.json`
- Create: `backend/test/plan-setup-view-model.test.js`
- Create: `common/plan-setup.js`
- Modify: `pages/library/index.js`
- Modify: `pages/library/index.wxml`
- Modify: `app.json`

**Interfaces:**
- Produces: `buildScopeOptions(structure): ScopeOption[]`
- Produces: `buildRecommendationCards(recommendation): RecommendationCard[]`
- Produces routes: `/pages/assessment/index`, `/pages/plan-setup/index`

- [ ] **Step 1: Write failing pure view-model tests**

```js
const { buildScopeOptions, buildRecommendationCards } = require('../../common/plan-setup');

test('scope options contain full text and every reviewed section', () => {
  const result = buildScopeOptions({ sections: [{ id: 's1', title: '第一会' }, { id: 's2', title: '第二会' }] });
  assert.deepEqual(result.map((item) => item.scopeType), ['full', 'section', 'section']);
});

test('recommendation cards always include 7 14 28 and custom options with workload', () => {
  const cards = buildRecommendationCards({ unitCount: 84, dailyMinutes: 15, recommendedTargetDays: 14 });
  assert.deepEqual(cards.map((item) => item.targetDays), [7, 14, 28, 'custom']);
  assert.ok(cards.slice(0, 3).every((item) => item.newUnitsPerDay > 0 && item.estimatedMinutes > 0));
});
```

- [ ] **Step 2: Run tests and verify RED, then implement `common/plan-setup.js`**

Keep all calculation in the pure module; pages only bind events and API calls.

- [ ] **Step 3: Build the assessment page**

Required states:

- loading structure;
- scope selection;
- 6 to 10 sampled items;
- first-character prompt;
- reveal action;
- three answers: `不会`, `部分记得`, `完整复现`;
- visible progress and elapsed time;
- error state with retry.

On completion, navigate to plan setup with assessment ID and scope, not raw answers in the URL.

- [ ] **Step 4: Build the plan setup page**

Required controls:

- segmented options for 7, 14, 28 days;
- numeric custom day input constrained to 3 to 84;
- daily-minute selector;
- workload summary: new units/day, estimated reviews, estimated minutes, intensity;
- explicit text “完成首轮学习，之后继续长期复习”;
- create-plan button with loading and duplicate-submit guard.

- [ ] **Step 5: Route long scientific plans through assessment**

In `pages/library/index.js`:

- keep short scientific/playful behavior unchanged;
- keep recitation behavior unchanged;
- when `lengthTier === 'long'` and mode is scientific, close the sheet and navigate to assessment;
- do not alter shop navigation or tabbar keys.

- [ ] **Step 6: Verify syntax and commit**

```bash
npm test
node --check ../common/plan-setup.js
node --check ../pages/assessment/index.js
node --check ../pages/plan-setup/index.js
node --check ../pages/library/index.js
git add app.json common/plan-setup.js pages/assessment pages/plan-setup pages/library/index.js pages/library/index.wxml backend/test/plan-setup-view-model.test.js
git commit -m "feat: add long-content assessment setup flow"
```

---

### Task 7: 将训练页切换为当天记忆单元任务

**Files:**
- Create: `common/practice-session.js`
- Create: `backend/test/practice-session.test.js`
- Modify: `pages/practice/index.js`
- Modify: `pages/practice/index.wxml`
- Modify: `pages/practice/index.wxss`

**Interfaces:**
- Produces: `createPracticeSession(task): PracticeSessionState`
- Produces: `advancePracticeStep(state, action): PracticeSessionState`
- Consumes: adaptive task items returned by `GET /api/study-tasks/today`

- [ ] **Step 1: Write failing practice state-machine tests**

Use one concrete adaptive task fixture:

```js
const DAILY_TASK = {
  id: 'task-1',
  items: [
    { id: 'item-1', memoryUnitId: 'unit-1', taskType: 'new', unit: { id: 'unit-1', text: '南无喝啰怛那哆啰夜耶', firstCharacterCue: '南' } },
    { id: 'item-2', memoryUnitId: 'unit-2', taskType: 'new', unit: { id: 'unit-2', text: '南无阿唎耶', firstCharacterCue: '南' } }
  ]
};

test('practice session contains only units from the daily task', () => {
  const state = createPracticeSession(DAILY_TASK);
  assert.deepEqual(state.queue.map((item) => item.memoryUnitId), ['unit-1', 'unit-2']);
  assert.equal(state.activeUnit.text, '南无喝啰怛那哆啰夜耶');
});

test('revealing an answer records a hint and prevents no-prompt success', () => {
  const state = createPracticeSession(DAILY_TASK);
  const revealed = advancePracticeStep(state, { type: 'reveal', at: 3000 });
  assert.equal(revealed.activeMetrics.hintCount, 1);
  assert.equal(revealed.activeMetrics.usedReveal, true);
});

test('again requeues the active unit after other current units', () => {
  const state = createPracticeSession(DAILY_TASK);
  const graded = advancePracticeStep(state, { type: 'grade', grade: 'again', at: 5000 });
  assert.deepEqual(graded.queue.map((item) => item.memoryUnitId), ['unit-2', 'unit-1']);
});

test('adaptive practice only exposes the three approved grades', () => {
  const state = createPracticeSession(DAILY_TASK);
  assert.deepEqual(state.allowedGrades, ['again', 'good', 'easy']);
  assert.equal(state.allowedGrades.includes('mastered'), false);
});
```

- [ ] **Step 2: Run tests and verify RED, then implement the pure state machine**

Use the exact steps:

```js
['study', 'first_character', 'free_recall', 'check', 'grade']
```

The state machine records start time, reveal time, hint count, mistake count and grade for the active memory unit.

- [ ] **Step 3: Add an adaptive branch to the practice page**

- If the plan has `contentVersionId` and `adaptiveStatus`, load the daily study task.
- Otherwise retain the existing short-content practice path.
- Render one active memory unit at a time with the daily queue visible as counts, not all 84 sentences.
- Remove the decorative audio note from adaptive cards.
- Keep the full-text link available for reference.

- [ ] **Step 4: Replace feedback in adaptive mode**

Show only:

- `需加强`
- `基本记得`
- `流畅复现`

Submit measured `latencyMs`, `mistakeCount`, `hintCount`, and an idempotency key. Do not derive errors from which feedback button was tapped.

- [ ] **Step 5: Show honest completion and sync copy**

After a successful response show next due time and remaining task count. Do not show “已掌握” unless the server returns a stable state derived from cross-day success.

- [ ] **Step 6: Run tests, syntax checks and UI parity checks**

```bash
npm test
node --check ../common/practice-session.js
node --check ../pages/practice/index.js
node ../tools/check-practice-parity.mjs
```

Expected: all pass. Update parity tokens only for intentional adaptive-mode additions; preserve existing short-mode baselines.

- [ ] **Step 7: Commit Task 7**

```bash
git add common/practice-session.js pages/practice/index.js pages/practice/index.wxml pages/practice/index.wxss backend/test/practice-session.test.js docs/ui-parity/practice.tokens.json
git commit -m "feat: train long content by daily memory units"
```

---

### Task 8: 接入今日任务、计划迁移提示与真实进度

**Files:**
- Create: `common/adaptive-progress.js`
- Modify: `pages/home/index.js`
- Modify: `pages/home/index.wxml`
- Modify: `pages/profile/index.js`
- Modify: `pages/profile/index.wxml`
- Modify: `common/memory.js`
- Create: `backend/test/adaptive-progress.test.js`

**Interfaces:**
- Produces: `buildAdaptiveTaskCard(task): TodayFocusItem`
- Produces: `withLegacyMigrationFlag(plan): MemoryPlanRow`
- Produces: `summarizeAdaptiveProgress(states): AdaptiveProgress`
- Extends today focus items with `taskId`, `newUnitCount`, `reviewUnitCount`, `weakUnitCount`, `estimatedMinutes`
- Extends plan rows with `stableUnitCount`, `totalUnitCount`, `expectedFinishDate`, `migrationRequired`

- [ ] **Step 1: Write failing progress and migration tests**

```js
const {
  buildAdaptiveTaskCard,
  withLegacyMigrationFlag,
  summarizeAdaptiveProgress
} = require('../../common/adaptive-progress');

test('today focus reports adaptive counts from the materialized daily task', () => {
  const card = buildAdaptiveTaskCard({
    id: 'adaptive-task-1',
    planId: 'adaptive-plan-1',
    title: '大悲咒',
    newUnitCount: 6,
    reviewUnitCount: 4,
    weakUnitCount: 2,
    estimatedMinutes: 15
  });
  assert.equal(card.newUnitCount, 6);
  assert.equal(card.reviewUnitCount, 4);
  assert.equal(card.weakUnitCount, 2);
  assert.equal(card.meta, '新学 6 · 复习 4 · 薄弱 2 · 约 15 分钟');
});

test('legacy long plans are marked migrationRequired without being rewritten', () => {
  const legacy = {
    id: 'legacy-long-plan',
    lengthTier: 'long',
    contentVersionId: '',
    tasks: [{ id: 'legacy-task-1', done: false }]
  };
  const before = JSON.stringify(legacy);
  const result = withLegacyMigrationFlag(legacy);
  assert.equal(result.migrationRequired, true);
  assert.equal(JSON.stringify(legacy), before);
});

test('stable progress is based on memory item states rather than fixed task count', () => {
  const states = [
    { phase: 'stable', dueAt: '2026-07-14', lastGrade: 'good' },
    { phase: 'stable', dueAt: '2026-07-17', lastGrade: 'easy' },
    { phase: 'reviewing', dueAt: '2026-07-10', lastGrade: 'good' },
    { phase: 'learning', dueAt: '2026-07-11', lastGrade: 'again' }
  ];
  const overview = summarizeAdaptiveProgress(states, '2026-07-10');
  assert.equal(overview.stableUnitCount, 2);
  assert.equal(overview.totalUnitCount, 4);
  assert.equal(overview.dueTodayCount, 1);
  assert.equal(overview.weakUnitCount, 1);
  assert.equal(overview.percent, 50);
});
```

- [ ] **Step 2: Run tests and verify RED, then implement repository summaries**

The repository must return both legacy and adaptive plan shapes. Do not convert adaptive states back into fake legacy review tasks.

- [ ] **Step 3: Update the home task card**

For adaptive tasks show:

```text
新学 6 · 复习 4 · 薄弱 2
预计 15 分钟
```

Opening the task passes `planId` and `taskId` to practice. Existing short and recitation task cards remain unchanged.

- [ ] **Step 4: Replace the generic curve for adaptive plans**

For adaptive plans, replace the hardcoded Ebbinghaus percentage chart with:

- stable units / total units;
- due today count;
- weak units count;
- expected first-pass completion date;
- next review date.

Keep the legacy chart only for old short plans until their separate migration phase.

- [ ] **Step 5: Add explicit long-plan migration action**

Display “升级为新的分句计划” for legacy long plans. User confirmation creates a new adaptive plan from the selected scope and archives the old plan only after the new plan succeeds.

- [ ] **Step 6: Run tests and parity checks**

```bash
npm test
node --check ../pages/home/index.js
node --check ../pages/profile/index.js
node ../tools/check-home-parity.mjs
node ../tools/check-profile-parity.mjs
```

- [ ] **Step 7: Commit Task 8**

```bash
git add common/adaptive-progress.js pages/home/index.js pages/home/index.wxml pages/profile/index.js pages/profile/index.wxml common/memory.js backend/test/adaptive-progress.test.js docs/ui-parity/home.tokens.json docs/ui-parity/profile.tokens.json
git commit -m "feat: surface adaptive study progress"
```

---

### Task 9: 全量回归、商城保护与阶段 A 验收

**Files:**
- Create: `backend/test/shop-regression.test.js`
- Modify: `backend/package.json` only if the final test command needs adjustment
- Modify: `docs/API_CONTRACT.md`
- Modify: `docs/PRODUCT_REQUIREMENTS.md`

**Interfaces:**
- Verifies the approved design and every prior task.
- Does not add new product behavior.

- [ ] **Step 1: Write the shop isolation regression test**

The test must load `common/shop.js`, create favorite/cart/browse state, run adaptive-memory functions, and assert the serialized shop state is unchanged:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const storage = new Map();

global.wx = {
  getStorageSync(key) {
    return storage.has(key) ? storage.get(key) : '';
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  }
};

const shop = require('../../common/shop');
const { recommendPlan, allocateDailyUnits } = require('../../common/adaptive-memory');

test('adaptive learning operations do not mutate shop state', () => {
  shop.toggleFavoriteProduct('music-heart-sutra');
  shop.recordRecentViewProduct('thangka-green-tara');
  shop.addProductToCart('energy-painting-compassion');
  const before = JSON.stringify(shop.getShopState());
  recommendPlan({ unitCount: 84, familiarityLevel: 'partial', dailyMinutes: 15 });
  allocateDailyUnits({
    states: Array.from({ length: 84 }, (_, index) => ({
      memoryUnitId: `unit-${index + 1}`,
      phase: 'new'
    })),
    date: '2026-07-10',
    dailyMinutes: 15,
    targetDays: 14
  });
  assert.equal(JSON.stringify(shop.getShopState()), before);
});
```

Also assert `app.json` still includes `pages/shop/index` and the tabbar component still maps the `shop` key.

- [ ] **Step 2: Run the focused regression test and verify it passes**

```bash
node --test test/shop-regression.test.js
```

- [ ] **Step 3: Update API and product documentation**

Document:

- content structure endpoint;
- assessment and recommendation payloads;
- adaptive plan fields;
- daily study task response;
- item completion grades and `Idempotency-Key`;
- legacy long-plan migration behavior;
- explicit statement that shop scope is unchanged.

- [ ] **Step 4: Run the full automated verification suite**

From `backend/`:

```bash
npm test
npm run check
```

From the repository root:

```bash
node --check common/adaptive-memory.js
node --check common/plan-setup.js
node --check common/practice-session.js
node --check common/api.js
node --check common/memory.js
node --check pages/library/index.js
node --check pages/assessment/index.js
node --check pages/plan-setup/index.js
node --check pages/practice/index.js
node --check pages/home/index.js
node --check pages/profile/index.js
node tools/check-ui-parity.mjs
```

Expected: zero failed tests, zero syntax errors, all parity checks pass.

- [ ] **Step 5: Run behavioral acceptance probes**

Use isolated Node processes to prove:

- 84 units with 14 days produce 6 new units on day one;
- `again` on the final unit leaves a pending retry;
- repeating one idempotency key does not change counters;
- a section plan contains no units from another section;
- shop state before and after adaptive operations is byte-for-byte equal.

- [ ] **Step 6: Inspect the final diff for accidental shop changes**

```bash
git diff --name-only HEAD~8..HEAD
git diff -- common/shop.js pages/shop/index.js pages/shop/index.wxml pages/shop/index.wxss
```

Expected: the second command has no output unless a separately justified compatibility fix was required.

- [ ] **Step 7: Commit Task 9**

```bash
git add backend/test/shop-regression.test.js backend/package.json docs/API_CONTRACT.md docs/PRODUCT_REQUIREMENTS.md
git commit -m "test: verify adaptive learning phase a"
```

## Phase A Definition of Done

- 大悲咒可以选择全文或章节，并完成 60 秒熟悉度测验。
- 用户可以选择 7、14、28 天或 3 至 84 天自定义首轮周期。
- 14 天计划首日只分配约 6 个新记忆单元，不加载全部 84 句。
- 每日任务包含到期、薄弱、新学和串联范围的可解释统计。
- `需加强` 会产生可执行补练；最后一个单元失败不会让计划失去下一步。
- 用户不能直接把长咒标为已掌握；稳定状态来自跨日成功。
- 所有新修改接口具备幂等保护。
- 旧长咒计划只显示迁移提示，不被静默改写。
- 现有短咒、诵读和商城功能通过回归检查。
- 自动化测试、语法检查和 UI parity 全部通过。
