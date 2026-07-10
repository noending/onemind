const test = require('node:test');
const assert = require('node:assert/strict');

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
