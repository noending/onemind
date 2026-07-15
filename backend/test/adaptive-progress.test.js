const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildAdaptiveTaskCard,
  withLegacyMigrationFlag,
  summarizeAdaptiveProgress
} = require('../../common/adaptive-progress');
const memoryStore = require('../src/repositories/memoryStore');

function uniqueKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function postgresSql(sql) {
  return execFileSync(process.env.PSQL_BIN || '/opt/homebrew/bin/psql', [
    '-X',
    '-h', process.env.PGHOST || '127.0.0.1',
    '-p', process.env.PGPORT || '5432',
    '-U', process.env.PGUSER || 'magic',
    '-d', process.env.PGDATABASE || 'onemind',
    '-v', 'ON_ERROR_STOP=1',
    '-t', '-A', '-c', sql
  ], {
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'Noending5@' },
    encoding: 'utf8'
  }).trim();
}

function sqlValue(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

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

  assert.equal(card.taskId, 'adaptive-task-1');
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

test('short legacy and adaptive plans do not request migration', () => {
  assert.equal(withLegacyMigrationFlag({ lengthTier: 'short', tasks: [] }).migrationRequired, false);
  assert.equal(withLegacyMigrationFlag({
    lengthTier: 'long',
    contentVersionId: 'content-version-1',
    itemStates: []
  }).migrationRequired, false);
});

test('profile renders legacy long plans as migration-only without building the old curve', () => {
  const previousPage = global.Page;
  let definition;
  global.Page = (pageDefinition) => { definition = pageDefinition; };
  global.wx = global.wx || {};
  delete require.cache[require.resolve('../../pages/profile/index.js')];
  require('../../pages/profile/index.js');
  global.Page = previousPage;

  const page = { ...definition, data: structuredClone(definition.data) };
  let measured = 0;
  page.setData = (patch, callback) => {
    Object.assign(page.data, patch);
    if (callback) callback();
  };
  page.measureAndBuildCurveChart = () => { measured += 1; };
  page.data.plans = [{
    id: 'legacy-long-profile',
    title: '大悲咒',
    tier: 'long',
    migrationRequired: true,
    totalDays: 28,
    currentDay: 4,
    tasks: []
  }];
  page.data.selectedPlanId = 'legacy-long-profile';

  page.refreshCurveData();

  assert.equal(page.data.selectedPlanMigrationRequired, true);
  assert.equal(page.data.selectedPlanIsAdaptive, false);
  assert.deepEqual(page.data.curveData, []);
  assert.equal(measured, 0);

  const markup = fs.readFileSync(path.resolve(__dirname, '../../pages/profile/index.wxml'), 'utf8');
  assert.match(markup, /wx:(?:if|elif)="\{\{selectedPlanMigrationRequired\}\}"[^>]*legacy-migration-panel/);
  assert.doesNotMatch(markup, /wx:elif="\{\{curveData\.length\}\}"[\s\S]*selectedPlanMigrationRequired[\s\S]*curve-chart-shell/);

  page.data.plans = [{
    id: 'legacy-short-profile',
    title: '六字大明咒',
    tier: 'short',
    migrationRequired: false,
    totalDays: 3,
    currentDay: 1,
    tasks: []
  }];
  page.data.selectedPlanId = 'legacy-short-profile';
  page.refreshCurveData();
  assert.equal(page.data.selectedPlanMigrationRequired, false);
  assert.equal(page.data.curveData.length, 31);
  assert.equal(measured, 1);
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
  assert.equal(overview.nextReviewDate, '2026-07-10');
  assert.equal(overview.percent, 50);
});

test('memory today focus includes the materialized adaptive daily task', () => {
  const userId = uniqueKey('adaptive-focus-owner');
  const today = memoryStore.todayDate();
  const plan = memoryStore.createAdaptivePlan({
    userId,
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: today,
    idempotencyKey: uniqueKey('adaptive-focus-plan')
  });

  const focus = memoryStore.listTodayFocus(userId);
  const task = focus.scientificTasks.find((item) => item.planId === plan.id);

  assert.ok(task);
  assert.equal(task.taskId, plan.task.id);
  assert.equal(task.newUnitCount, plan.task.newUnitCount);
  assert.equal(task.reviewUnitCount, plan.task.reviewUnitCount);
  assert.equal(task.weakUnitCount, plan.task.weakUnitCount);
  assert.equal(task.estimatedMinutes, plan.task.estimatedMinutes);
});

test('memory adaptive creation and list DTOs always expose the content title', () => {
  const userId = uniqueKey('adaptive-title-owner');
  const created = memoryStore.createAdaptivePlan({
    userId,
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10',
    idempotencyKey: uniqueKey('adaptive-title-plan')
  });
  const listed = memoryStore.listPlans(userId).find((plan) => plan.id === created.id);

  assert.equal(created.title, '大悲咒');
  assert.equal(listed.title, '大悲咒');
});

test('memory provider archives only the owning legacy plan and replay is idempotent', () => {
  const ownerId = uniqueKey('legacy-owner');
  const otherUserId = uniqueKey('legacy-other');
  const plan = memoryStore.createPlan({
    userId: ownerId,
    contentId: 'great-compassion-opening',
    startDate: '2026-07-10'
  }).plan;
  const idempotencyKey = uniqueKey('archive-legacy');

  assert.throws(() => memoryStore.archiveLegacyPlan({
    userId: otherUserId,
    planId: plan.id,
    idempotencyKey: uniqueKey('wrong-owner')
  }), { code: 'MEMORY_PLAN_NOT_FOUND', statusCode: 404 });

  const first = memoryStore.archiveLegacyPlan({ userId: ownerId, planId: plan.id, idempotencyKey });
  const replay = memoryStore.archiveLegacyPlan({ userId: ownerId, planId: plan.id, idempotencyKey });

  assert.deepEqual(replay, first);
  assert.equal(first.id, plan.id);
  assert.equal(first.archived, true);
  assert.equal(memoryStore.listPlans(ownerId).some((item) => item.id === plan.id), false);
});

test('legacy archive requires a bounded idempotency key', () => {
  const userId = uniqueKey('legacy-key-owner');
  const plan = memoryStore.createPlan({
    userId,
    contentId: 'great-compassion-opening',
    startDate: '2026-07-10'
  }).plan;

  assert.throws(() => memoryStore.archiveLegacyPlan({ userId, planId: plan.id }), {
    code: 'IDEMPOTENCY_KEY_REQUIRED',
    statusCode: 400
  });
  assert.throws(() => memoryStore.archiveLegacyPlan({
    userId,
    planId: plan.id,
    idempotencyKey: 'x'.repeat(181)
  }), { code: 'IDEMPOTENCY_KEY_INVALID', statusCode: 400 });
});

test('legacy archive rejects short plans outside the migration boundary', () => {
  const userId = uniqueKey('short-plan-owner');
  const plan = memoryStore.createPlan({
    userId,
    contentId: 'heart-sutra-core',
    startDate: '2026-07-10'
  }).plan;

  assert.throws(() => memoryStore.archiveLegacyPlan({
    userId,
    planId: plan.id,
    idempotencyKey: uniqueKey('short-plan-archive')
  }), { code: 'MEMORY_PLAN_NOT_MIGRATABLE', statusCode: 409 });
});

test('postgres provider matches legacy archive ownership, replay, and list behavior', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PROGRESS_TEST !== '1'
}, () => {
  const postgresStore = require('../src/repositories/postgresStore');
  postgresStore.initializeDatabase();
  const ownerId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  postgresSql(`
    insert into users (id, nickname) values
      (${sqlValue(ownerId)}, 'Adaptive progress owner'),
      (${sqlValue(otherUserId)}, 'Adaptive progress other')
  `);

  try {
    const plan = postgresStore.createPlan({
      userId: ownerId,
      contentId: 'great-compassion-opening',
      startDate: '2026-07-10'
    }).plan;
    const idempotencyKey = uniqueKey('postgres-archive-legacy');

    assert.throws(() => postgresStore.archiveLegacyPlan({
      userId: otherUserId,
      planId: plan.id,
      idempotencyKey: uniqueKey('postgres-wrong-owner')
    }), { code: 'MEMORY_PLAN_NOT_FOUND', statusCode: 404 });

    const first = postgresStore.archiveLegacyPlan({ userId: ownerId, planId: plan.id, idempotencyKey });
    const replay = postgresStore.archiveLegacyPlan({ userId: ownerId, planId: plan.id, idempotencyKey });
    assert.deepEqual(replay, first);
    assert.equal(postgresStore.listPlans(ownerId).some((item) => item.id === plan.id), false);
  } finally {
    postgresSql(`
      delete from idempotency_records where user_id in (${sqlValue(ownerId)}, ${sqlValue(otherUserId)});
      delete from notification_jobs where user_id in (${sqlValue(ownerId)}, ${sqlValue(otherUserId)});
      delete from review_records where user_id in (${sqlValue(ownerId)}, ${sqlValue(otherUserId)});
      delete from practice_sessions where user_id in (${sqlValue(ownerId)}, ${sqlValue(otherUserId)});
      delete from review_tasks where user_id in (${sqlValue(ownerId)}, ${sqlValue(otherUserId)});
      delete from memory_plans where user_id in (${sqlValue(ownerId)}, ${sqlValue(otherUserId)});
      delete from users where id in (${sqlValue(ownerId)}, ${sqlValue(otherUserId)})
    `);
  }
});
