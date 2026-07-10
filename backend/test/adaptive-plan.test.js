const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const store = require('../src/repositories/memoryStore');
const { contents } = require('../src/data/seed');

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

test('today task is generated lazily for a later date and cannot be read by another user', () => {
  const plan = createAdaptivePlan();
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

test('a completed new unit is not allocated as new again on the next date', () => {
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
  assert.equal(nextDay.items.some((item) => item.memoryUnitId === sourceItem.memoryUnitId), false);
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

test('postgres generates later daily tasks lazily and enforces plan ownership', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_PLAN_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const plan = createPostgresAdaptivePlan(postgresStore);
  const later = postgresStore.getTodayStudyTask(plan.userId, plan.id, '2026-07-11');

  assert.equal(later.taskDate, '2026-07-11');
  assert.equal(
    later.items.some((item) => plan.task.items.some((first) => first.memoryUnitId === item.memoryUnitId)),
    false
  );
  assert.throws(() => postgresStore.getTodayStudyTask(crypto.randomUUID(), plan.id, '2026-07-11'), {
    code: 'STUDY_TASK_NOT_FOUND',
    statusCode: 404
  });
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
    reviewedAt: '2026-07-10T08:00:00.000Z'
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

  assert.equal(pendingRetries.length, 1);
  assert.equal(first.task.status, 'pending');
  assert.equal(first.plan.adaptiveStatus, 'active');
  assert.equal(duplicate.state.lapseCount, 1);
  assert.equal(duplicate.task.items.filter((item) => item.taskType === 'weak_review').length, 1);
});
