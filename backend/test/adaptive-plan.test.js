const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const store = require('../src/repositories/memoryStore');
const { contents } = require('../src/data/seed');
const { createPracticeSession } = require('../../common/practice-session');

const POSTGRES_CONTENT_ID = '33333333-3333-4333-8333-000000000005';

function resolvePsqlBinary() {
  return [
    process.env.PSQL_BIN,
    '/opt/homebrew/bin/psql',
    '/usr/local/bin/psql',
    '/usr/bin/psql',
    'psql'
  ].filter(Boolean).find((candidate) => !candidate.includes('/') || fs.existsSync(candidate));
}

function sqlValue(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPostgresSql(sql) {
  return execFileSync(resolvePsqlBinary(), [
    '-X',
    '-h', process.env.PGHOST || '127.0.0.1',
    '-p', process.env.PGPORT || '5432',
    '-U', process.env.PGUSER || 'magic',
    '-d', process.env.PGDATABASE || 'onemind',
    '-v', 'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-c', sql
  ], {
    env: {
      ...process.env,
      PGPASSWORD: process.env.PGPASSWORD || 'Noending5@'
    },
    encoding: 'utf8'
  }).trim();
}

function queryPostgresRows(sql) {
  const result = runPostgresSql(`
    select coalesce(json_agg(row_to_json(result_row)), '[]'::json)
    from (${sql}) result_row
  `);
  return JSON.parse(result || '[]');
}

function createPostgresTestUser() {
  const userId = crypto.randomUUID();
  runPostgresSql(`
    insert into users (id, nickname)
    values (${sqlValue(userId)}, 'Adaptive concurrency test')
  `);
  return userId;
}

function cleanupPostgresAdaptiveUser(userId) {
  runPostgresSql(`
    delete from daily_study_task_items
    where plan_id in (
      select id from memory_plans where user_id = ${sqlValue(userId)}
    );
    delete from idempotency_records where user_id = ${sqlValue(userId)};
    delete from memory_plans where user_id = ${sqlValue(userId)};
    delete from users where id = ${sqlValue(userId)};
  `);
}

function installCompletionDelayTrigger() {
  runPostgresSql(`
    create or replace function onemind_test_delay_adaptive_completion()
    returns trigger language plpgsql as $$
    begin
      if current_setting('onemind.test_delay_adaptive_completion', true) = 'on' then
        perform pg_sleep(0.75);
      end if;
      return new;
    end
    $$;
    drop trigger if exists onemind_test_delay_adaptive_completion
      on daily_study_task_items;
    create trigger onemind_test_delay_adaptive_completion
      before update of status on daily_study_task_items
      for each row
      when (old.status = 'pending' and new.status = 'completed')
      execute function onemind_test_delay_adaptive_completion();
  `);
}

function removeCompletionDelayTrigger() {
  runPostgresSql(`
    drop trigger if exists onemind_test_delay_adaptive_completion
      on daily_study_task_items;
    drop function if exists onemind_test_delay_adaptive_completion();
  `);
}

function installCrossTaskReconciliationDelayTriggers() {
  runPostgresSql(`
    create or replace function onemind_test_delay_cross_task_mutation()
    returns trigger language plpgsql as $$
    begin
      if current_setting('onemind.test_delay_cross_task_mutation', true) = 'on' then
        perform pg_sleep(0.75);
      end if;
      return new;
    end
    $$;
    drop trigger if exists onemind_test_delay_cross_task_mutation
      on daily_study_task_items;
    create trigger onemind_test_delay_cross_task_mutation
      before update of status on daily_study_task_items
      for each row
      when (old.status = 'pending' and new.status = 'completed')
      execute function onemind_test_delay_cross_task_mutation();

    create or replace function onemind_test_delay_cross_task_reconciliation()
    returns trigger language plpgsql as $$
    begin
      if current_setting('onemind.test_delay_cross_task_reconciliation', true) = 'on' then
        perform pg_sleep(1.5);
      end if;
      return new;
    end
    $$;
    drop trigger if exists onemind_test_delay_cross_task_reconciliation
      on daily_study_tasks;
    create trigger onemind_test_delay_cross_task_reconciliation
      before update of status on daily_study_tasks
      for each row execute function onemind_test_delay_cross_task_reconciliation();
  `);
}

function removeCrossTaskReconciliationDelayTriggers() {
  runPostgresSql(`
    drop trigger if exists onemind_test_delay_cross_task_mutation
      on daily_study_task_items;
    drop function if exists onemind_test_delay_cross_task_mutation();
    drop trigger if exists onemind_test_delay_cross_task_reconciliation
      on daily_study_tasks;
    drop function if exists onemind_test_delay_cross_task_reconciliation();
  `);
}

function installTaskInsertDelayTrigger() {
  runPostgresSql(`
    create or replace function onemind_test_delay_adaptive_task_insert()
    returns trigger language plpgsql as $$
    begin
      if current_setting('onemind.test_delay_adaptive_task_insert', true) = 'on' then
        perform pg_sleep(0.75);
      end if;
      return new;
    end
    $$;
    drop trigger if exists onemind_test_delay_adaptive_task_insert
      on daily_study_tasks;
    create trigger onemind_test_delay_adaptive_task_insert
      before insert on daily_study_tasks
      for each row execute function onemind_test_delay_adaptive_task_insert();
  `);
}

function removeTaskInsertDelayTrigger() {
  runPostgresSql(`
    drop trigger if exists onemind_test_delay_adaptive_task_insert
      on daily_study_tasks;
    drop function if exists onemind_test_delay_adaptive_task_insert();
  `);
}

function runPostgresStoreChild(method, args, setting) {
  const runner = `
    const store = require('./src/repositories/postgresStore');
    try {
      const result = store[process.argv[1]](...JSON.parse(process.argv[2]));
      process.stdout.write(JSON.stringify(result));
    } catch (error) {
      process.stderr.write(JSON.stringify({
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        stderr: error.stderr ? String(error.stderr) : ''
      }));
      process.exitCode = 1;
    }
  `;
  const pgOptions = [process.env.PGOPTIONS, setting ? `-c ${setting}=on` : '']
    .filter(Boolean)
    .join(' ');

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', runner, method, JSON.stringify(args)], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PGOPTIONS: pgOptions },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Postgres child ${method} failed: ${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

function uniqueKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createAdaptivePlan(overrides = {}) {
  return store.createAdaptivePlan({
    userId: uniqueKey('adaptive-user'),
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10',
    idempotencyKey: uniqueKey('adaptive-plan'),
    ...overrides
  });
}

let gatedPostgresStore = null;

function getGatedPostgresStore() {
  if (!gatedPostgresStore) {
    gatedPostgresStore = require('../src/repositories/postgresStore');
    gatedPostgresStore.initializeDatabase();
  }
  return gatedPostgresStore;
}

function createPostgresAdaptivePlan(postgresStore, overrides = {}) {
  return postgresStore.createAdaptivePlan({
    userId: 'demo-user',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10',
    idempotencyKey: uniqueKey('postgres-adaptive-plan'),
    ...overrides
  });
}

function completePostgresTask(postgresStore, plan, task = plan.task, reviewedAt = '2026-07-10T08:00:00.000Z') {
  task.items.filter((item) => item.status === 'pending').forEach((item, index) => {
    postgresStore.completeStudyTaskItem({
      userId: plan.userId,
      itemId: item.id,
      grade: 'good',
      idempotencyKey: uniqueKey(`postgres-complete-task-${index}`),
      reviewedAt
    });
  });
}

function prepareSinglePostgresAllocationCandidate(plan, taskType) {
  const memoryUnitId = plan.task.items[0].memoryUnitId;
  const candidate = taskType === 'due_review'
    ? "phase = 'learning', last_grade = 'good', due_at = '2026-07-11'::date"
    : "phase = 'learning', last_grade = 'again', due_at = '2026-07-20'::date";
  runPostgresSql(`
    update memory_item_states
    set phase = 'stable', last_grade = 'good', due_at = '2026-07-20'::date,
      updated_at = now()
    where plan_id = ${sqlValue(plan.id)};
    update memory_item_states
    set ${candidate}, updated_at = now()
    where plan_id = ${sqlValue(plan.id)}
      and memory_unit_id = ${sqlValue(memoryUnitId)};
  `);
  return memoryUnitId;
}

function pickTaskItemResultDto(item) {
  return {
    result: item.result,
    latencyMs: item.latencyMs,
    mistakeCount: item.mistakeCount,
    hintCount: item.hintCount
  };
}

function pickAdaptiveCreationParity(plan) {
  return {
    itemStates: plan.itemStates.map(({ memoryUnitId, ...state }) => state),
    taskItems: plan.task.items.map(({ id, taskId, memoryUnitId, unit, ...item }) => ({
      ...item,
      unit: unit && {
        text: unit.text,
        firstCharacterCue: unit.firstCharacterCue
      }
    }))
  };
}

test('full and section adaptive plans initialize only their selected units', () => {
  const structure = store.getContentStructure('great-compassion-opening', 'great-compassion-v1');
  const section = structure.sections[0];
  const fullPlan = createAdaptivePlan({ userId: uniqueKey('full-user') });
  const sectionPlan = createAdaptivePlan({
    userId: uniqueKey('section-user'),
    scopeType: 'section',
    scopeId: section.id
  });

  assert.equal(fullPlan.itemStates.length, 84);
  assert.deepEqual(sectionPlan.itemStates.map((item) => item.memoryUnitId), section.units.map((unit) => unit.id));
  assert.equal(fullPlan.startDate, '2026-07-10');
  assert.equal(fullPlan.expectedFinishDate, '2026-07-23');
});

test('a 14 day great compassion plan creates exactly six new units on its first fixed-date task', () => {
  const plan = createAdaptivePlan();
  const task = plan.task;
  const today = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-10');

  assert.deepEqual(today, task);
  assert.equal(today.taskDate, '2026-07-10');
  assert.equal(today.newUnitCount, 6);
  assert.equal(today.items.filter((item) => item.taskType === 'new').length, 6);
});

test('adaptive plan creation is idempotent and does not reinitialize item states', () => {
  const userId = uniqueKey('idempotent-user');
  const idempotencyKey = uniqueKey('create-key');
  const first = createAdaptivePlan({ userId, idempotencyKey });
  const second = createAdaptivePlan({
    userId,
    idempotencyKey,
    scopeType: 'section',
    scopeId: 'great-compassion-section-2'
  });

  assert.deepEqual(second, first);
  assert.equal(second.itemStates.length, 84);
});

test('memory listPlans returns legacy and adaptive plans with the real adaptive shape', () => {
  const userId = uniqueKey('mixed-plan-user');
  const legacy = store.createPlan({
    userId,
    contentId: 'heart-sutra-core',
    startDate: '2026-07-10'
  }).plan;
  const adaptive = createAdaptivePlan({ userId });
  const listed = store.listPlans(userId);
  const listedLegacy = listed.find((plan) => plan.id === legacy.id);
  const listedAdaptive = listed.find((plan) => plan.id === adaptive.id);

  assert.ok(listedLegacy);
  assert.ok(Array.isArray(listedLegacy.tasks));
  assert.ok(listedAdaptive);
  assert.equal(listedAdaptive.contentVersionId, adaptive.contentVersionId);
  assert.equal(listedAdaptive.title, '大悲咒');
  assert.equal(listedAdaptive.adaptiveStatus, adaptive.adaptiveStatus);
  assert.deepEqual(listedAdaptive.itemStates, adaptive.itemStates);
  assert.equal(Object.hasOwn(listedAdaptive, 'task'), false);
});

test('memory idempotency keys cannot cross adaptive operations', () => {
  const userId = uniqueKey('operation-bound-user');
  const createKey = uniqueKey('operation-create');
  const completionKey = uniqueKey('operation-complete');
  const plan = createAdaptivePlan({ userId, idempotencyKey: createKey });
  const item = plan.task.items[0];

  assert.throws(() => store.completeStudyTaskItem({
    userId,
    itemId: item.id,
    grade: 'good',
    idempotencyKey: createKey,
    reviewedAt: '2026-07-10T08:00:00.000Z'
  }), { code: 'IDEMPOTENCY_KEY_CONFLICT', statusCode: 409 });

  store.completeStudyTaskItem({
    userId,
    itemId: item.id,
    grade: 'good',
    idempotencyKey: completionKey,
    reviewedAt: '2026-07-10T08:00:00.000Z'
  });
  assert.throws(() => createAdaptivePlan({
    userId,
    idempotencyKey: completionKey
  }), { code: 'IDEMPOTENCY_KEY_CONFLICT', statusCode: 409 });
});

test('later task is generated only after the historical task completes and enforces ownership', () => {
  const plan = createAdaptivePlan();
  plan.task.items.forEach((item, index) => {
    store.completeStudyTaskItem({
      itemId: item.id,
      userId: plan.userId,
      grade: 'good',
      idempotencyKey: uniqueKey(`complete-before-later-${index}`),
      reviewedAt: '2026-07-10T08:00:00.000Z'
    });
  });
  const nextDay = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-11');

  assert.equal(nextDay.taskDate, '2026-07-11');
  assert.equal(
    nextDay.items.some((item) => plan.task.items.some((firstDayItem) => firstDayItem.memoryUnitId === item.memoryUnitId)),
    false
  );
  assert.throws(() => store.getTodayStudyTask(uniqueKey('other-user'), plan.id, '2026-07-11'), {
    code: 'STUDY_TASK_NOT_FOUND',
    statusCode: 404
  });
});

test('item completion validates grades, is idempotent, and rejects a key reused for another item', () => {
  const plan = createAdaptivePlan();
  const task = plan.task;
  const firstItem = task.items[0];
  const secondItem = task.items[1];
  const idempotencyKey = uniqueKey('completion-key');

  assert.throws(() => store.completeStudyTaskItem({
    itemId: firstItem.id,
    userId: plan.userId,
    grade: 'wrong',
    idempotencyKey: uniqueKey('invalid-grade'),
    reviewedAt: '2026-07-10T08:00:00.000Z'
  }), { code: 'REVIEW_GRADE_INVALID', statusCode: 400 });

  const first = store.completeStudyTaskItem({
    itemId: firstItem.id,
    userId: plan.userId,
    grade: 'good',
    idempotencyKey,
    reviewedAt: '2026-07-10T08:00:00.000Z'
  });
  const repeated = store.completeStudyTaskItem({
    itemId: firstItem.id,
    userId: plan.userId,
    grade: 'easy',
    idempotencyKey,
    reviewedAt: '2026-07-10T09:00:00.000Z'
  });

  assert.deepEqual(repeated, first);
  assert.throws(() => store.completeStudyTaskItem({
    itemId: secondItem.id,
    userId: plan.userId,
    grade: 'good',
    idempotencyKey,
    reviewedAt: '2026-07-10T08:00:00.000Z'
  }), { code: 'IDEMPOTENCY_KEY_CONFLICT', statusCode: 409 });
});

test('a historical completed new item is not returned as another pending new allocation', () => {
  const plan = createAdaptivePlan();
  const sourceItem = plan.task.items[0];
  store.completeStudyTaskItem({
    itemId: sourceItem.id,
    userId: plan.userId,
    grade: 'good',
    idempotencyKey: uniqueKey('complete-new'),
    reviewedAt: '2026-07-10T08:00:00.000Z'
  });

  const nextDay = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-11');
  const historicalItem = nextDay.items.find((item) => item.memoryUnitId === sourceItem.memoryUnitId);
  assert.equal(nextDay.id, plan.task.id);
  assert.equal(historicalItem.status, 'completed');
  assert.equal(nextDay.items.some((item) => (
    item.memoryUnitId === sourceItem.memoryUnitId
    && item.taskType === 'new'
    && item.status === 'pending'
  )), false);
});

test('memory provider returns the earliest unfinished historical task before allocating today', () => {
  const plan = createAdaptivePlan();
  const historical = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-11');

  assert.equal(historical.id, plan.task.id);
  assert.equal(historical.taskDate, '2026-07-10');
  assert.throws(() => store.getTodayStudyTask(uniqueKey('other-owner'), plan.id, '2026-07-11'), {
    code: 'STUDY_TASK_NOT_FOUND',
    statusCode: 404
  });
});

test('memory provider keeps yesterday again retry executable before creating a new date task', () => {
  const plan = createAdaptivePlan();
  const sourceItem = plan.task.items[0];
  const failed = store.completeStudyTaskItem({
    itemId: sourceItem.id,
    userId: plan.userId,
    grade: 'again',
    idempotencyKey: uniqueKey('historical-again'),
    reviewedAt: '2026-07-10T08:00:00.000Z'
  });
  const retry = failed.task.items.find((item) => item.taskType === 'weak_review' && item.status === 'pending');
  const nextDay = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-11');

  assert.ok(retry);
  assert.equal(nextDay.id, plan.task.id);
  assert.equal(nextDay.items.some((item) => item.id === retry.id), true);
});

test('memory provider allocates today only after every historical item is completed', () => {
  const plan = createAdaptivePlan();
  plan.task.items.forEach((item, index) => {
    store.completeStudyTaskItem({
      itemId: item.id,
      userId: plan.userId,
      grade: 'good',
      idempotencyKey: uniqueKey(`finish-history-${index}`),
      reviewedAt: '2026-07-10T08:00:00.000Z'
    });
  });

  const today = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-11');
  assert.notEqual(today.id, plan.task.id);
  assert.equal(today.taskDate, '2026-07-11');
  assert.equal(today.newUnitCount, 6);
});

test('repository completion only grants stable cross-day success to clean recall', () => {
  const content = {
    id: uniqueKey('stable-content'),
    title: 'Stable qualification content',
    body: 'Unit',
    preview: 'Unit',
    publishStatus: 'published',
    publishedVersion: { id: uniqueKey('stable-version'), reviewStatus: 'approved' },
    sections: [{
      id: uniqueKey('stable-section'),
      title: 'Stable section',
      sortOrder: 1,
      units: [{ id: uniqueKey('stable-unit'), text: 'Unit', sortOrder: 1 }]
    }]
  };
  contents.push(content);

  try {
    const plan = createAdaptivePlan({
      contentId: content.id,
      contentVersionId: content.publishedVersion.id,
      targetDays: 3,
      dailyMinutes: 5
    });
    store.completeStudyTaskItem({
      itemId: plan.task.items[0].id,
      userId: plan.userId,
      grade: 'good',
      idempotencyKey: uniqueKey('stable-clean-first'),
      reviewedAt: '2026-07-10T08:00:00.000Z'
    });
    const reviewTask = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-13');
    const hinted = store.completeStudyTaskItem({
      itemId: reviewTask.items[0].id,
      userId: plan.userId,
      grade: 'good',
      hintCount: 1,
      mistakeCount: 0,
      idempotencyKey: uniqueKey('stable-hinted-second'),
      reviewedAt: '2026-07-13T08:00:00.000Z'
    });

    assert.equal(hinted.state.crossDaySuccessCount, 0);
    assert.notEqual(hinted.state.phase, 'stable');
    assert.equal(hinted.state.hintCount, 1);
  } finally {
    contents.splice(contents.indexOf(content), 1);
  }
});

test('again appends one weak retry, duplicate source completion is inert, and task stays pending', () => {
  const plan = createAdaptivePlan();
  const task = plan.task;
  const sourceItem = task.items[0];
  const first = store.completeStudyTaskItem({
    itemId: sourceItem.id,
    userId: plan.userId,
    grade: 'again',
    idempotencyKey: uniqueKey('again-source'),
    reviewedAt: '2026-07-10T08:00:00.000Z'
  });
  const duplicate = store.completeStudyTaskItem({
    itemId: sourceItem.id,
    userId: plan.userId,
    grade: 'again',
    idempotencyKey: uniqueKey('again-duplicate'),
    reviewedAt: '2026-07-10T08:01:00.000Z'
  });
  const retries = first.task.items.filter((item) => item.taskType === 'weak_review' && item.status === 'pending');

  assert.equal(retries.length, 1);
  assert.equal(first.task.status, 'pending');
  assert.equal(duplicate.task.items.filter((item) => item.taskType === 'weak_review').length, 1);
  assert.equal(duplicate.state.lapseCount, 1);
});

test('same-session again retry never raises the task estimate above daily minutes', () => {
  const plan = createAdaptivePlan({ dailyMinutes: 9 });
  const result = store.completeStudyTaskItem({
    itemId: plan.task.items[0].id,
    userId: plan.userId,
    grade: 'again',
    idempotencyKey: uniqueKey('again-budget-cap'),
    reviewedAt: '2026-07-10T08:00:00.000Z'
  });

  assert.equal(plan.task.estimatedMinutes, 9);
  assert.ok(result.task.estimatedMinutes <= plan.dailyMinutes);
  assert.equal(result.task.items.some((item) => item.taskType === 'weak_review'), true);
});

test('a final-unit again leaves one weak retry and blocks initial completion until it succeeds', () => {
  const content = {
    id: uniqueKey('single-unit-content'),
    title: 'Single unit adaptive content',
    body: 'Unit',
    preview: 'Unit',
    publishStatus: 'published',
    publishedVersion: { id: uniqueKey('single-unit-version'), reviewStatus: 'approved' },
    sections: [{
      id: uniqueKey('single-unit-section'),
      title: 'Single unit section',
      sortOrder: 1,
      units: [{ id: uniqueKey('single-unit'), text: 'Unit', sortOrder: 1 }]
    }]
  };
  contents.push(content);

  try {
    const plan = createAdaptivePlan({
      contentId: content.id,
      contentVersionId: content.publishedVersion.id,
      targetDays: 3,
      dailyMinutes: 60
    });
    const first = store.completeStudyTaskItem({
      itemId: plan.task.items[0].id,
      userId: plan.userId,
      grade: 'good',
      idempotencyKey: uniqueKey('first-good'),
      reviewedAt: '2026-07-10T08:00:00.000Z'
    });
    const stableTask = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-13');
    const stable = store.completeStudyTaskItem({
      itemId: stableTask.items[0].id,
      userId: plan.userId,
      grade: 'good',
      idempotencyKey: uniqueKey('second-good'),
      reviewedAt: '2026-07-13T08:00:00.000Z'
    });
    const finalTask = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-16');
    const again = store.completeStudyTaskItem({
      itemId: finalTask.items[0].id,
      userId: plan.userId,
      grade: 'again',
      idempotencyKey: uniqueKey('again-final'),
      reviewedAt: '2026-07-16T08:00:00.000Z'
    });
    const retry = again.task.items.find((item) => item.taskType === 'weak_review' && item.status === 'pending');

    assert.equal(first.plan.adaptiveStatus, 'active');
    assert.equal(stable.plan.adaptiveStatus, 'initial_complete');
    assert.ok(retry);
    assert.equal(again.task.status, 'pending');
    assert.notEqual(again.plan.adaptiveStatus, 'initial_complete');
  } finally {
    contents.splice(contents.indexOf(content), 1);
  }
});

test('postgres full and section plans persist scoped states and creation idempotency', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const fullKey = uniqueKey('postgres-full-plan');
  const fullPlan = createPostgresAdaptivePlan(postgresStore, { idempotencyKey: fullKey });
  const repeated = createPostgresAdaptivePlan(postgresStore, {
    idempotencyKey: fullKey,
    scopeType: 'section',
    scopeId: 'great-compassion-section-2'
  });
  const sectionPlan = createPostgresAdaptivePlan(postgresStore, {
    idempotencyKey: uniqueKey('postgres-section-plan'),
    scopeType: 'section',
    scopeId: 'great-compassion-section-2'
  });

  assert.deepEqual(repeated, fullPlan);
  assert.equal(fullPlan.itemStates.length, 84);
  assert.equal(sectionPlan.itemStates.length, 14);
  assert.equal(fullPlan.contentId, 'great-compassion-opening');
  assert.equal(fullPlan.contentVersionId, 'great-compassion-v1');
  assert.equal(sectionPlan.scopeId, 'great-compassion-section-2');
  assert.equal(fullPlan.startDate, '2026-07-10');
  assert.equal(fullPlan.expectedFinishDate, '2026-07-23');
  assert.equal(fullPlan.task.newUnitCount, 6);
  assert.equal(fullPlan.task.items.filter((item) => item.taskType === 'new').length, 6);
});

test('memory and postgres creation responses expose the same complete adaptive DTO', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const memoryPlan = createAdaptivePlan();
  const postgresStore = getGatedPostgresStore();
  const postgresUserId = createPostgresTestUser();

  try {
    const postgresPlan = createPostgresAdaptivePlan(postgresStore, { userId: postgresUserId });
    const rereadPlan = postgresStore.listPlans(postgresUserId)
      .find((plan) => plan.id === postgresPlan.id);
    const rereadTask = postgresStore.getTodayStudyTask(postgresUserId, postgresPlan.id, '2026-07-10');

    assert.equal(memoryPlan.title, '大悲咒');
    assert.equal(postgresPlan.title, memoryPlan.title);
    assert.equal(rereadPlan.title, memoryPlan.title);
    assert.deepEqual(pickAdaptiveCreationParity(postgresPlan), pickAdaptiveCreationParity(memoryPlan));
    assert.deepEqual(postgresPlan.itemStates, rereadPlan.itemStates);
    assert.deepEqual(postgresPlan.task, rereadTask);
  } finally {
    cleanupPostgresAdaptiveUser(postgresUserId);
  }
});

test('postgres generates later daily tasks lazily and enforces plan ownership', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const plan = createPostgresAdaptivePlan(postgresStore);
  completePostgresTask(postgresStore, plan);
  const later = postgresStore.getTodayStudyTask(plan.userId, plan.id, '2026-07-11');
  const session = createPracticeSession(later, { startAt: 1000 });
  const expectedUnit = postgresStore
    .getContentStructure('great-compassion-opening', 'great-compassion-v1')
    .sections
    .flatMap((section) => section.units)
    .find((unit) => unit.id === later.items[0].memoryUnitId);

  assert.equal(later.taskDate, '2026-07-11');
  assert.deepEqual(later.items[0].unit, {
    id: expectedUnit.id,
    text: expectedUnit.text,
    firstCharacterCue: expectedUnit.firstCharacterCue
  });
  assert.equal(session.activeUnit.text, later.items[0].unit.text);
  assert.equal(
    later.items.some((item) => plan.task.items.some((first) => first.memoryUnitId === item.memoryUnitId)),
    false
  );
  assert.throws(() => postgresStore.getTodayStudyTask(crypto.randomUUID(), plan.id, '2026-07-11'), {
    code: 'STUDY_TASK_NOT_FOUND',
    statusCode: 404
  });
});

test('postgres concurrent today reads return the same earliest historical task with ownership parity', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, async () => {
  const postgresStore = getGatedPostgresStore();
  const userId = createPostgresTestUser();
  const plan = createPostgresAdaptivePlan(postgresStore, { userId });

  try {
    const [first, second] = await Promise.all([
      runPostgresStoreChild('getTodayStudyTask', [userId, plan.id, '2026-07-11']),
      runPostgresStoreChild('getTodayStudyTask', [userId, plan.id, '2026-07-11'])
    ]);
    const [counts] = queryPostgresRows(`
      select count(*)::int as "taskCount"
      from daily_study_tasks
      where plan_id = ${sqlValue(plan.id)}
    `);

    assert.equal(first.id, plan.task.id);
    assert.equal(second.id, plan.task.id);
    assert.equal(first.taskDate, '2026-07-10');
    assert.equal(counts.taskCount, 1);
    assert.throws(() => postgresStore.getTodayStudyTask(crypto.randomUUID(), plan.id, '2026-07-11'), {
      code: 'STUDY_TASK_NOT_FOUND',
      statusCode: 404
    });
  } finally {
    cleanupPostgresAdaptiveUser(userId);
  }
});

test('postgres repository does not grant stable cross-day success to hinted good recall', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const userId = createPostgresTestUser();
  const plan = createPostgresAdaptivePlan(postgresStore, { userId });

  try {
    plan.task.items.forEach((item, index) => {
      postgresStore.completeStudyTaskItem({
        userId,
        itemId: item.id,
        grade: 'good',
        reviewedAt: '2026-07-10T08:00:00.000Z',
        idempotencyKey: uniqueKey(`postgres-stable-first-${index}`)
      });
    });
    const reviewTask = postgresStore.getTodayStudyTask(userId, plan.id, '2026-07-13');
    const reviewItem = reviewTask.items.find((item) => item.memoryUnitId === plan.task.items[0].memoryUnitId);
    const hinted = postgresStore.completeStudyTaskItem({
      userId,
      itemId: reviewItem.id,
      grade: 'good',
      hintCount: 1,
      mistakeCount: 0,
      reviewedAt: '2026-07-13T08:00:00.000Z',
      idempotencyKey: uniqueKey('postgres-stable-hinted')
    });

    assert.equal(hinted.state.crossDaySuccessCount, 0);
    assert.notEqual(hinted.state.phase, 'stable');
    assert.equal(hinted.state.hintCount, 1);
  } finally {
    cleanupPostgresAdaptiveUser(userId);
  }
});

test('postgres large due backlog matches pure allocation and stays within daily budget', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const { allocateDailyUnits } = require('../../common/adaptive-memory');
  const userId = createPostgresTestUser();
  const plan = createPostgresAdaptivePlan(postgresStore, { userId });

  try {
    runPostgresSql(`
      update daily_study_task_items set status = 'completed', updated_at = now()
      where plan_id = ${sqlValue(plan.id)};
      update daily_study_tasks set status = 'completed', updated_at = now()
      where plan_id = ${sqlValue(plan.id)};
      update memory_item_states
      set phase = 'reviewing', due_at = '2026-07-09'::date,
        last_grade = 'good', updated_at = now()
      where plan_id = ${sqlValue(plan.id)};
    `);
    const states = Array.from({ length: 84 }, (_, index) => ({
      memoryUnitId: `unit-${index + 1}`,
      phase: 'reviewing',
      dueAt: '2026-07-09',
      lastGrade: 'good'
    }));
    const expected = allocateDailyUnits({
      states,
      date: '2026-07-10',
      dailyMinutes: 15,
      targetDays: 14
    });
    const task = postgresStore.getTodayStudyTask(userId, plan.id, '2026-07-11');

    assert.equal(task.reviewUnitCount, expected.reviewUnitCount);
    assert.equal(task.weakUnitCount, expected.weakUnitCount);
    assert.equal(task.newUnitCount, expected.newUnitCount);
    assert.equal(task.estimatedMinutes, expected.estimatedMinutes);
    assert.equal(task.items.length, 30);
    assert.ok(task.estimatedMinutes <= plan.dailyMinutes);
  } finally {
    cleanupPostgresAdaptiveUser(userId);
  }
});

test('postgres item completion is idempotent and binds keys to one item', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const plan = createPostgresAdaptivePlan(postgresStore);
  const [firstItem, secondItem] = plan.task.items;
  const idempotencyKey = uniqueKey('postgres-item-completion');
  const first = postgresStore.completeStudyTaskItem({
    itemId: firstItem.id,
    userId: plan.userId,
    grade: 'good',
    idempotencyKey,
    reviewedAt: '2026-07-10T08:00:00.000Z',
    latencyMs: -100,
    mistakeCount: 2.8,
    hintCount: 'invalid'
  });
  const repeated = postgresStore.completeStudyTaskItem({
    itemId: firstItem.id,
    userId: plan.userId,
    grade: 'easy',
    idempotencyKey,
    reviewedAt: '2026-07-10T09:00:00.000Z'
  });

  assert.deepEqual(repeated, first);
  assert.equal(first.state.successfulRecallCount, 1);
  assert.equal(first.state.lastLatencyMs, 0);
  assert.equal(first.state.mistakeCount, 2);
  assert.equal(first.state.hintCount, 0);
  assert.throws(() => postgresStore.completeStudyTaskItem({
    itemId: secondItem.id,
    userId: plan.userId,
    grade: 'good',
    idempotencyKey,
    reviewedAt: '2026-07-10T08:00:00.000Z'
  }), {
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    statusCode: 409
  });
});

test('memory and postgres providers return the same task-item result DTO', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const metrics = { latencyMs: 1234, mistakeCount: 2, hintCount: 1 };
  const memoryPlan = createAdaptivePlan();
  const memory = store.completeStudyTaskItem({
    userId: memoryPlan.userId,
    itemId: memoryPlan.task.items[0].id,
    grade: 'good',
    reviewedAt: '2026-07-10T08:00:00.000Z',
    idempotencyKey: uniqueKey('memory-result-dto'),
    ...metrics
  });
  const postgresStore = getGatedPostgresStore();
  const postgresUserId = createPostgresTestUser();
  const postgresPlan = createPostgresAdaptivePlan(postgresStore, { userId: postgresUserId });

  try {
    const postgres = postgresStore.completeStudyTaskItem({
      userId: postgresPlan.userId,
      itemId: postgresPlan.task.items[0].id,
      grade: 'good',
      reviewedAt: '2026-07-10T08:00:00.000Z',
      idempotencyKey: uniqueKey('postgres-result-dto'),
      ...metrics
    });
    const reread = postgresStore.getTodayStudyTask(postgresPlan.userId, postgresPlan.id, '2026-07-10');

    assert.deepEqual(pickTaskItemResultDto(postgres.item), pickTaskItemResultDto(memory.item));
    assert.deepEqual(pickTaskItemResultDto(reread.items[0]), pickTaskItemResultDto(postgres.item));
  } finally {
    cleanupPostgresAdaptiveUser(postgresUserId);
  }
});

test('postgres again leaves exactly one pending weak retry and duplicate completion is inert', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const plan = createPostgresAdaptivePlan(postgresStore);
  const sourceItem = plan.task.items[0];
  const first = postgresStore.completeStudyTaskItem({
    itemId: sourceItem.id,
    userId: plan.userId,
    grade: 'again',
    idempotencyKey: uniqueKey('postgres-again-source'),
    reviewedAt: '2026-07-10T08:00:00.000Z'
  });
  const duplicate = postgresStore.completeStudyTaskItem({
    itemId: sourceItem.id,
    userId: plan.userId,
    grade: 'again',
    idempotencyKey: uniqueKey('postgres-again-duplicate'),
    reviewedAt: '2026-07-10T08:01:00.000Z'
  });
  const pendingRetries = first.task.items.filter((item) => (
    item.memoryUnitId === sourceItem.memoryUnitId
    && item.taskType === 'weak_review'
    && item.status === 'pending'
  ));
  const completedSource = first.task.items.find((item) => item.id === sourceItem.id);

  assert.equal(pendingRetries.length, 1);
  assert.deepEqual(pendingRetries[0].unit, completedSource.unit);
  assert.equal(first.task.status, 'pending');
  assert.equal(first.plan.adaptiveStatus, 'active');
  assert.equal(duplicate.state.lapseCount, 1);
  assert.equal(duplicate.task.items.filter((item) => item.taskType === 'weak_review').length, 1);
});

test('postgres same-session again retry preserves the daily estimate cap', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const userId = createPostgresTestUser();
  const plan = createPostgresAdaptivePlan(postgresStore, { userId, dailyMinutes: 9 });

  try {
    const result = postgresStore.completeStudyTaskItem({
      itemId: plan.task.items[0].id,
      userId,
      grade: 'again',
      idempotencyKey: uniqueKey('postgres-again-budget-cap'),
      reviewedAt: '2026-07-10T08:00:00.000Z'
    });

    assert.ok(result.task.estimatedMinutes <= plan.dailyMinutes);
    assert.equal(result.task.items.some((item) => item.taskType === 'weak_review'), true);
  } finally {
    cleanupPostgresAdaptiveUser(userId);
  }
});

test('postgres concurrent same-key plan creation persists exactly one entity set', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, async () => {
  getGatedPostgresStore();
  const userId = createPostgresTestUser();
  const idempotencyKey = uniqueKey('postgres-concurrent-create');
  const payload = {
    userId,
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10',
    idempotencyKey
  };

  try {
    const [first, second] = await Promise.all([
      runPostgresStoreChild('createAdaptivePlan', [payload]),
      runPostgresStoreChild('createAdaptivePlan', [payload])
    ]);
    const [counts] = queryPostgresRows(`
      select
        (select count(*)::int from memory_plans
          where user_id = ${sqlValue(userId)} and adaptive_status is not null) as "planCount",
        (select count(*)::int from memory_item_states
          where user_id = ${sqlValue(userId)}) as "stateCount",
        (select count(*)::int from daily_study_tasks task
          join memory_plans plan on plan.id = task.plan_id
          where plan.user_id = ${sqlValue(userId)}) as "taskCount",
        (select count(*)::int from daily_study_task_items item
          join daily_study_tasks task on task.id = item.task_id
          join memory_plans plan on plan.id = task.plan_id
          where plan.user_id = ${sqlValue(userId)}) as "itemCount",
        (select count(*)::int from idempotency_records
          where user_id = ${sqlValue(userId)}
            and idempotency_key = ${sqlValue(idempotencyKey)}) as "recordCount",
        (select operation_type from idempotency_records
          where user_id = ${sqlValue(userId)}
            and idempotency_key = ${sqlValue(idempotencyKey)}) as "operationType"
    `);

    assert.equal(first.id, second.id);
    assert.deepEqual(counts, {
      planCount: 1,
      stateCount: 84,
      taskCount: 1,
      itemCount: 6,
      recordCount: 1,
      operationType: 'adaptive_plan_create'
    });
  } finally {
    cleanupPostgresAdaptiveUser(userId);
  }
});

test('postgres concurrent final-item completion reconciles and persists database terminal state', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, async () => {
  const postgresStore = getGatedPostgresStore();
  const userId = createPostgresTestUser();
  const plan = createPostgresAdaptivePlan(postgresStore, { userId });
  const finalItems = plan.task.items.slice(-2);
  const completionKeys = [
    uniqueKey('postgres-concurrent-complete-a'),
    uniqueKey('postgres-concurrent-complete-b')
  ];

  runPostgresSql(`
    update memory_item_states
    set phase = 'stable', last_grade = 'good',
      last_reviewed_at = '2026-07-09T08:00:00.000Z'::timestamptz,
      due_at = '2026-07-20'::date, successful_recall_count = 2,
      cross_day_success_count = 1, updated_at = now()
    where plan_id = ${sqlValue(plan.id)};
    update memory_item_states
    set phase = 'learning', cross_day_success_count = 0,
      successful_recall_count = 1
    where plan_id = ${sqlValue(plan.id)}
      and memory_unit_id in (${finalItems.map((item) => sqlValue(item.memoryUnitId)).join(',')});
    update daily_study_task_items
    set status = 'completed',
      result = '{"grade":"good","completedAt":"2026-07-10T07:00:00.000Z"}'::jsonb,
      updated_at = now()
    where task_id = ${sqlValue(plan.task.id)}
      and id not in (${finalItems.map((item) => sqlValue(item.id)).join(',')});
    update daily_study_tasks set status = 'pending', updated_at = now()
      where id = ${sqlValue(plan.task.id)};
    update memory_plans set adaptive_status = 'active', updated_at = now()
      where id = ${sqlValue(plan.id)};
  `);
  installCompletionDelayTrigger();

  try {
    const results = await Promise.all(finalItems.map((item, index) => (
      runPostgresStoreChild('completeStudyTaskItem', [{
        userId,
        itemId: item.id,
        grade: 'good',
        idempotencyKey: completionKeys[index],
        reviewedAt: '2026-07-10T08:00:00.000Z'
      }], 'onemind.test_delay_adaptive_completion')
    )));
    const [terminal] = queryPostgresRows(`
      select
        task.status as "taskStatus",
        plan.adaptive_status as "adaptiveStatus",
        (select count(*)::int from daily_study_task_items
          where task_id = task.id and status = 'pending') as "pendingItemCount",
        (select count(*)::int from memory_item_states
          where plan_id = plan.id and phase <> 'stable') as "nonStableStateCount"
      from daily_study_tasks task
      join memory_plans plan on plan.id = task.plan_id
      where task.id = ${sqlValue(plan.task.id)}
    `);
    const records = queryPostgresRows(`
      select operation_type as "operationType", response_payload as response
      from idempotency_records
      where user_id = ${sqlValue(userId)}
        and idempotency_key in (${completionKeys.map(sqlValue).join(',')})
      order by idempotency_key
    `);

    assert.deepEqual(terminal, {
      taskStatus: 'completed',
      adaptiveStatus: 'initial_complete',
      pendingItemCount: 0,
      nonStableStateCount: 0
    });
    assert.equal(results.some((result) => (
      result.task.status === 'completed'
      && result.plan.adaptiveStatus === 'initial_complete'
    )), true);
    assert.equal(records.length, 2);
    assert.equal(records.every((record) => record.operationType === 'study_task_item_complete'), true);
    assert.equal(records.some((record) => (
      record.response.task.status === 'completed'
      && record.response.plan.adaptiveStatus === 'initial_complete'
    )), true);
  } finally {
    removeCompletionDelayTrigger();
    cleanupPostgresAdaptiveUser(userId);
  }
});

test('postgres cross-task final-item completion converges plan status after stale reconciliation', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, async () => {
  const postgresStore = getGatedPostgresStore();
  const userId = createPostgresTestUser();
  const plan = createPostgresAdaptivePlan(postgresStore, { userId });
  completePostgresTask(postgresStore, plan);
  const secondTask = postgresStore.getTodayStudyTask(userId, plan.id, '2026-07-11');
  const finalItems = [plan.task.items.at(-1), secondTask.items.at(-1)];
  const completionKeys = [
    uniqueKey('postgres-cross-task-complete-a'),
    uniqueKey('postgres-cross-task-complete-b')
  ];

  runPostgresSql(`
    update memory_item_states
    set phase = 'stable', last_grade = 'good',
      last_reviewed_at = '2026-07-09T08:00:00.000Z'::timestamptz,
      due_at = '2026-07-20'::date, successful_recall_count = 2,
      cross_day_success_count = 1, updated_at = now()
    where plan_id = ${sqlValue(plan.id)};
    update memory_item_states
    set phase = 'learning', cross_day_success_count = 0,
      successful_recall_count = 1
    where plan_id = ${sqlValue(plan.id)}
      and memory_unit_id in (${finalItems.map((item) => sqlValue(item.memoryUnitId)).join(',')});
    update daily_study_task_items
    set status = 'completed',
      result = '{"grade":"good","completedAt":"2026-07-09T07:00:00.000Z"}'::jsonb,
      updated_at = now()
    where plan_id = ${sqlValue(plan.id)}
      and id not in (${finalItems.map((item) => sqlValue(item.id)).join(',')});
    update daily_study_task_items
    set status = 'pending', result = null, updated_at = now()
    where id in (${finalItems.map((item) => sqlValue(item.id)).join(',')});
    update daily_study_tasks set status = 'pending', updated_at = now()
      where id in (${[plan.task.id, secondTask.id].map(sqlValue).join(',')});
    update memory_plans set adaptive_status = 'active', updated_at = now()
      where id = ${sqlValue(plan.id)};
  `);
  installCrossTaskReconciliationDelayTriggers();

  try {
    const firstCompletion = runPostgresStoreChild(
      'completeStudyTaskItem',
      [{
        userId,
        itemId: finalItems[0].id,
        grade: 'good',
        idempotencyKey: completionKeys[0],
        reviewedAt: '2026-07-10T08:00:00.000Z'
      }],
      'onemind.test_delay_cross_task_reconciliation'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const secondCompletion = runPostgresStoreChild(
      'completeStudyTaskItem',
      [{
        userId,
        itemId: finalItems[1].id,
        grade: 'good',
        idempotencyKey: completionKeys[1],
        reviewedAt: '2026-07-11T08:00:00.000Z'
      }],
      'onemind.test_delay_cross_task_mutation'
    );
    const results = await Promise.all([firstCompletion, secondCompletion]);
    const [terminal] = queryPostgresRows(`
      select
        plan.adaptive_status as "adaptiveStatus",
        (select count(*)::int from daily_study_tasks
          where id in (${[plan.task.id, secondTask.id].map(sqlValue).join(',')})
            and status = 'completed') as "completedTaskCount",
        (select count(*)::int from memory_item_states
          where plan_id = plan.id and phase <> 'stable') as "nonStableStateCount",
        (select count(*)::int
          from daily_study_task_items retry_item
          join daily_study_tasks retry_task on retry_task.id = retry_item.task_id
          where retry_task.plan_id = plan.id
            and retry_item.task_type = 'weak_review'
            and retry_item.status = 'pending') as "pendingRetryCount"
      from memory_plans plan
      where plan.id = ${sqlValue(plan.id)}
    `);
    const records = queryPostgresRows(`
      select response_payload as response
      from idempotency_records
      where user_id = ${sqlValue(userId)}
        and idempotency_key in (${completionKeys.map(sqlValue).join(',')})
    `);

    assert.deepEqual(terminal, {
      adaptiveStatus: 'initial_complete',
      completedTaskCount: 2,
      nonStableStateCount: 0,
      pendingRetryCount: 0
    });
    assert.equal(results.every((result) => (
      result.task.status === 'completed'
      && result.plan.adaptiveStatus === 'initial_complete'
    )), true);
    assert.equal(records.length, 2);
    assert.equal(records.every((record) => (
      record.response.task.status === 'completed'
      && record.response.plan.adaptiveStatus === 'initial_complete'
    )), true);
  } finally {
    removeCrossTaskReconciliationDelayTriggers();
    cleanupPostgresAdaptiveUser(userId);
  }
});

test('postgres concurrent different-date new allocation returns one winning task', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, async () => {
  const postgresStore = getGatedPostgresStore();
  const userId = createPostgresTestUser();
  const plan = createPostgresAdaptivePlan(postgresStore, { userId });
  completePostgresTask(postgresStore, plan);
  installTaskInsertDelayTrigger();

  try {
    const [firstDate, secondDate] = await Promise.all([
      runPostgresStoreChild(
        'getTodayStudyTask',
        [userId, plan.id, '2026-07-11'],
        'onemind.test_delay_adaptive_task_insert'
      ),
      runPostgresStoreChild(
        'getTodayStudyTask',
        [userId, plan.id, '2026-07-12'],
        'onemind.test_delay_adaptive_task_insert'
      )
    ]);
    const firstNewIds = new Set(firstDate.items
      .filter((item) => item.taskType === 'new' && item.status === 'pending')
      .map((item) => item.memoryUnitId));
    const secondNewIds = new Set(secondDate.items
      .filter((item) => item.taskType === 'new' && item.status === 'pending')
      .map((item) => item.memoryUnitId));
    const [stored] = queryPostgresRows(`
      select
        (select count(*)::int from daily_study_tasks
          where plan_id = ${sqlValue(plan.id)}
            and task_date in ('2026-07-11'::date, '2026-07-12'::date)) as "taskCount",
        (select count(*)::int from daily_study_tasks task
          where task.plan_id = ${sqlValue(plan.id)}
            and task.task_date in ('2026-07-11'::date, '2026-07-12'::date)
            and not exists (
              select 1 from daily_study_task_items item where item.task_id = task.id
            )) as "emptyTaskCount",
        (select count(*)::int from (
          select item.memory_unit_id
          from daily_study_task_items item
          join daily_study_tasks task on task.id = item.task_id
          where task.plan_id = ${sqlValue(plan.id)}
            and item.task_type = 'new'
            and item.status = 'pending'
          group by item.memory_unit_id
          having count(*) > 1
        ) duplicated) as "duplicatePendingNewCount"
    `);

    assert.equal(firstDate.id, secondDate.id);
    assert.ok(firstNewIds.size > 0);
    assert.deepEqual(secondNewIds, firstNewIds);
    assert.deepEqual(stored, {
      taskCount: 1,
      emptyTaskCount: 0,
      duplicatePendingNewCount: 0
    });
  } finally {
    removeTaskInsertDelayTrigger();
    cleanupPostgresAdaptiveUser(userId);
  }
});

for (const taskType of ['due_review', 'weak_review']) {
  test(`postgres concurrent different-date allocation returns one winning ${taskType} task`, {
    skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
  }, async () => {
    const postgresStore = getGatedPostgresStore();
    const userId = createPostgresTestUser();
    const plan = createPostgresAdaptivePlan(postgresStore, { userId });
    completePostgresTask(postgresStore, plan);
    const memoryUnitId = prepareSinglePostgresAllocationCandidate(plan, taskType);
    installTaskInsertDelayTrigger();

    try {
      const [first, second] = await Promise.all([
        runPostgresStoreChild(
          'getTodayStudyTask',
          [userId, plan.id, '2026-07-11'],
          'onemind.test_delay_adaptive_task_insert'
        ),
        runPostgresStoreChild(
          'getTodayStudyTask',
          [userId, plan.id, '2026-07-12'],
          'onemind.test_delay_adaptive_task_insert'
        )
      ]);
      const pending = queryPostgresRows(`
        select task.id::text as "taskId", task.task_date::text as "taskDate",
          item.task_type as "taskType", item.memory_unit_id::text as "memoryUnitId"
        from daily_study_task_items item
        join daily_study_tasks task on task.id = item.task_id
        where item.plan_id = ${sqlValue(plan.id)}
          and item.memory_unit_id = ${sqlValue(memoryUnitId)}
          and item.status = 'pending'
        order by task.task_date asc, task.created_at asc
      `);

      assert.equal(first.id, second.id);
      assert.equal(pending.length, 1);
      assert.equal(first.id, pending[0].taskId);
      assert.equal(pending[0].taskType, taskType);
    } finally {
      removeTaskInsertDelayTrigger();
      cleanupPostgresAdaptiveUser(userId);
    }
  });
}

test('postgres listPlans returns the real adaptive public shape and unchanged legacy rows', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const userId = createPostgresTestUser();
  const legacyId = crypto.randomUUID();
  runPostgresSql(`
    insert into memory_plans (
      id, user_id, content_id, mode, title, start_date,
      total_days, current_day, state
    ) values (
      ${sqlValue(legacyId)}, ${sqlValue(userId)}, ${sqlValue(POSTGRES_CONTENT_ID)},
      'scientific', 'Legacy test plan', '2026-07-10'::date, 5, 1, 'reviewing'
    )
  `);

  try {
    const adaptive = createPostgresAdaptivePlan(postgresStore, { userId });
    const listed = postgresStore.listPlans(userId);
    const listedLegacy = listed.find((plan) => plan.id === legacyId);
    const listedAdaptive = listed.find((plan) => plan.id === adaptive.id);

    assert.ok(listedLegacy);
    assert.ok(Array.isArray(listedLegacy.tasks));
    assert.equal(Object.hasOwn(listedLegacy, 'itemStates'), false);
    assert.ok(listedAdaptive);
    for (const field of [
      'userId', 'contentId', 'contentVersionId', 'scopeType', 'scopeId',
      'targetDays', 'dailyMinutes', 'familiarityLevel', 'strategy',
      'startDate', 'expectedFinishDate', 'adaptiveStatus', 'title'
    ]) {
      assert.deepEqual(listedAdaptive[field], adaptive[field], field);
    }
    assert.deepEqual(listedAdaptive.itemStates, adaptive.itemStates);
    assert.equal(Object.hasOwn(listedAdaptive, 'task'), false);
  } finally {
    cleanupPostgresAdaptiveUser(userId);
  }
});
