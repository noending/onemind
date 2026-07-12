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

test('Shanghai midnight advances clean recall and due date by the business day', () => {
  const next = applyReviewGrade(
    {
      memoryUnitId: 'u-shanghai-midnight',
      phase: 'learning',
      successfulRecallCount: 1,
      crossDaySuccessCount: 0,
      lastReviewedAt: '2026-07-11T15:59:59.999Z'
    },
    {
      grade: 'good',
      reviewedAt: '2026-07-11T16:00:00.000Z',
      hintCount: 0,
      mistakeCount: 0
    }
  );

  assert.equal(next.crossDaySuccessCount, 1);
  assert.equal(next.phase, 'stable');
  assert.equal(next.dueAt, '2026-07-15');
});

test('hinted or mistaken good reviews do not earn cross-day stable success', () => {
  const first = applyReviewGrade(
    { memoryUnitId: 'u1', phase: 'learning', successfulRecallCount: 0, crossDaySuccessCount: 0 },
    { grade: 'good', reviewedAt: '2026-07-10T08:00:00.000Z' }
  );
  const hinted = applyReviewGrade(first, {
    grade: 'good',
    reviewedAt: '2026-07-11T08:00:00.000Z',
    hintCount: 1,
    mistakeCount: 0
  });
  const mistaken = applyReviewGrade(hinted, {
    grade: 'easy',
    reviewedAt: '2026-07-12T08:00:00.000Z',
    hintCount: 0,
    mistakeCount: 1
  });
  const clean = applyReviewGrade(mistaken, {
    grade: 'easy',
    reviewedAt: '2026-07-13T08:00:00.000Z',
    hintCount: 0,
    mistakeCount: 0
  });

  assert.equal(hinted.crossDaySuccessCount, 0);
  assert.notEqual(hinted.phase, 'stable');
  assert.equal(mistaken.crossDaySuccessCount, 0);
  assert.notEqual(mistaken.phase, 'stable');
  assert.equal(clean.crossDaySuccessCount, 1);
  assert.equal(clean.phase, 'stable');
});

test('daily budget truncates due then weak backlog before allocating new units', () => {
  const due = Array.from({ length: 20 }, (_, index) => ({
    memoryUnitId: `due-${index + 1}`,
    phase: 'reviewing',
    dueAt: '2026-07-09',
    lastGrade: 'good'
  }));
  const weak = Array.from({ length: 20 }, (_, index) => ({
    memoryUnitId: `weak-${index + 1}`,
    phase: 'learning',
    dueAt: '2026-07-20',
    lastGrade: 'again'
  }));
  const fresh = Array.from({ length: 84 }, (_, index) => ({
    memoryUnitId: `new-${index + 1}`,
    phase: 'new'
  }));
  const result = allocateDailyUnits({
    states: [...due, ...weak, ...fresh],
    date: '2026-07-10',
    dailyMinutes: 5,
    targetDays: 14
  });

  assert.equal(result.reviewUnitCount, 10);
  assert.equal(result.weakUnitCount, 0);
  assert.equal(result.newUnitCount, 0);
  assert.equal(result.estimatedMinutes, 5);
  assert.deepEqual(result.items.map((item) => item.taskType), Array(10).fill('due_review'));
});

test('daily budget uses leftover time for weak before new and leaves backlog pending', () => {
  const states = [
    ...Array.from({ length: 3 }, (_, index) => ({
      memoryUnitId: `due-${index + 1}`,
      phase: 'reviewing',
      dueAt: '2026-07-09'
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      memoryUnitId: `weak-${index + 1}`,
      phase: 'learning',
      dueAt: '2026-07-20',
      lastGrade: 'again'
    })),
    ...Array.from({ length: 84 }, (_, index) => ({ memoryUnitId: `new-${index + 1}`, phase: 'new' }))
  ];
  const result = allocateDailyUnits({ states, date: '2026-07-10', dailyMinutes: 5, targetDays: 14 });

  assert.equal(result.reviewUnitCount, 3);
  assert.equal(result.weakUnitCount, 7);
  assert.equal(result.newUnitCount, 0);
  assert.ok(result.estimatedMinutes <= 5);
  assert.equal(result.items.length, 10);
});

test('minimum one-item exception is explicit when one item costs more than the budget', () => {
  const result = allocateDailyUnits({
    states: [{ memoryUnitId: 'due-1', phase: 'reviewing', dueAt: '2026-07-09' }],
    date: '2026-07-10',
    dailyMinutes: 0.25,
    targetDays: 14
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.estimatedMinutes, 0.5);
  assert.equal(result.minimumItemException, true);
});

test('an earlier out-of-order successful review does not count as a cross-day success', () => {
  const next = applyReviewGrade(
    {
      memoryUnitId: 'u1',
      phase: 'learning',
      successfulRecallCount: 1,
      crossDaySuccessCount: 0,
      lastReviewedAt: '2026-07-11T08:00:00.000Z'
    },
    { grade: 'good', reviewedAt: '2026-07-10T08:00:00.000Z' }
  );

  assert.equal(next.crossDaySuccessCount, 0);
  assert.notEqual(next.phase, 'stable');
});
