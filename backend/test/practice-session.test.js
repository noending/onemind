const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPracticeSession,
  advancePracticeStep
} = require('../../common/practice-session');

const DAILY_TASK = {
  id: 'task-1',
  items: [
    {
      id: 'item-1',
      memoryUnitId: 'unit-1',
      taskType: 'new',
      unit: { id: 'unit-1', text: '南无喝啰怛那哆啰夜耶', firstCharacterCue: '南' }
    },
    {
      id: 'item-2',
      memoryUnitId: 'unit-2',
      taskType: 'new',
      unit: { id: 'unit-2', text: '南无阿唎耶', firstCharacterCue: '南' }
    }
  ]
};

test('practice session contains only units from the daily task', () => {
  const state = createPracticeSession(DAILY_TASK, { startAt: 1000 });

  assert.deepEqual(state.queue.map((item) => item.memoryUnitId), ['unit-1', 'unit-2']);
  assert.equal(state.activeUnit.text, '南无喝啰怛那哆啰夜耶');
  assert.deepEqual(state.steps, ['study', 'first_character', 'free_recall', 'check', 'grade']);
  assert.equal(state.step, 'study');
  assert.equal(state.activeMetrics.startedAt, 1000);
});

test('revealing an answer records one hint and prevents no-prompt success', () => {
  const state = createPracticeSession(DAILY_TASK, { startAt: 1000 });
  const revealed = advancePracticeStep(state, { type: 'reveal', at: 3000 });
  const repeated = advancePracticeStep(revealed, { type: 'reveal', at: 4000 });

  assert.equal(revealed.activeMetrics.revealAt, 3000);
  assert.equal(revealed.activeMetrics.hintCount, 1);
  assert.equal(revealed.activeMetrics.usedReveal, true);
  assert.equal(repeated.activeMetrics.revealAt, 3000);
  assert.equal(repeated.activeMetrics.hintCount, 1);
});

test('practice steps advance in order and record elapsed time per step', () => {
  let state = createPracticeSession(DAILY_TASK, { startAt: 1000 });
  state = advancePracticeStep(state, { type: 'advance', at: 1500 });
  state = advancePracticeStep(state, { type: 'advance', at: 2700 });
  state = advancePracticeStep(state, { type: 'advance', at: 4200 });
  state = advancePracticeStep(state, { type: 'advance', at: 5000 });

  assert.equal(state.step, 'grade');
  assert.deepEqual(state.activeMetrics.stepTimes, {
    study: 500,
    first_character: 1200,
    free_recall: 1500,
    check: 800
  });
});

test('hints do not reset the active step timer', () => {
  let state = createPracticeSession(DAILY_TASK, { startAt: 1000 });
  state = advancePracticeStep(state, { type: 'reveal', at: 2000 });
  state = advancePracticeStep(state, { type: 'advance', at: 3000 });

  assert.equal(state.activeMetrics.stepTimes.study, 2000);
});

test('mark_mistake explicitly increments mistakes without inferring them from grade', () => {
  let state = createPracticeSession(DAILY_TASK, { startAt: 1000 });
  state = advancePracticeStep(state, { type: 'mark_mistake', at: 2000 });
  state = advancePracticeStep(state, { type: 'mark_mistake', at: 2500 });

  assert.equal(state.activeMetrics.mistakeCount, 2);
  const graded = advancePracticeStep(state, { type: 'grade', grade: 'good', at: 3000 });
  assert.equal(graded.lastResult.mistakeCount, 2);
});

test('grading records latency and grade while retaining item identity', () => {
  let state = createPracticeSession(DAILY_TASK, { startAt: 1000 });
  state = advancePracticeStep(state, { type: 'reveal', at: 2000 });
  const graded = advancePracticeStep(state, { type: 'grade', grade: 'easy', at: 5000 });

  assert.equal(graded.lastResult.id, 'item-1');
  assert.equal(graded.lastResult.memoryUnitId, 'unit-1');
  assert.equal(graded.lastResult.taskType, 'new');
  assert.equal(graded.lastResult.grade, 'easy');
  assert.equal(graded.lastResult.latencyMs, 4000);
  assert.equal(graded.lastResult.usedReveal, true);
  assert.equal(graded.lastResult.hintCount, 1);
});

test('again requeues the active unit after other current units', () => {
  const state = createPracticeSession(DAILY_TASK, { startAt: 1000 });
  const graded = advancePracticeStep(state, { type: 'grade', grade: 'again', at: 5000 });

  assert.deepEqual(graded.queue.map((item) => item.memoryUnitId), ['unit-2', 'unit-1']);
  assert.equal(graded.activeUnit.memoryUnitId, 'unit-2');
  assert.equal(graded.activeMetrics.startedAt, 5000);
});

test('good removes the active unit and easy completes the final unit', () => {
  const state = createPracticeSession(DAILY_TASK, { startAt: 1000 });
  const afterGood = advancePracticeStep(state, { type: 'grade', grade: 'good', at: 2000 });
  const completed = advancePracticeStep(afterGood, { type: 'grade', grade: 'easy', at: 4000 });

  assert.deepEqual(afterGood.queue.map((item) => item.memoryUnitId), ['unit-2']);
  assert.equal(completed.activeUnit, null);
  assert.equal(completed.activeMetrics, null);
  assert.equal(completed.isComplete, true);
  assert.deepEqual(completed.queue, []);
});

test('adaptive practice only exposes the three approved grades', () => {
  const state = createPracticeSession(DAILY_TASK);

  assert.deepEqual(state.allowedGrades, ['again', 'good', 'easy']);
  assert.equal(state.allowedGrades.includes('mastered'), false);
});

test('invalid actions and grades are rejected without changing the input state', () => {
  const state = createPracticeSession(DAILY_TASK, { startAt: 1000 });

  assert.throws(
    () => advancePracticeStep(state, { type: 'grade', grade: 'mastered', at: 2000 }),
    /INVALID_GRADE/
  );
  assert.throws(
    () => advancePracticeStep(state, { type: 'unknown', at: 2000 }),
    /INVALID_ACTION/
  );
  assert.equal(state.step, 'study');
  assert.equal(state.activeMetrics.grade, null);
});

test('state transitions are immutable and preserve the task item shape', () => {
  const taskBefore = structuredClone(DAILY_TASK);
  const state = createPracticeSession(DAILY_TASK, { startAt: 1000 });
  const next = advancePracticeStep(state, { type: 'mark_mistake', at: 2000 });

  assert.deepEqual(DAILY_TASK, taskBefore);
  assert.notEqual(next, state);
  assert.notEqual(next.queue, state.queue);
  assert.notEqual(next.activeMetrics, state.activeMetrics);
  assert.equal(next.activeUnit.id, 'item-1');
  assert.equal(next.activeUnit.memoryUnitId, 'unit-1');
  assert.equal(next.activeUnit.taskType, 'new');
  assert.equal(next.activeUnit.text, DAILY_TASK.items[0].unit.text);
  assert.equal(next.activeUnit.firstCharacterCue, DAILY_TASK.items[0].unit.firstCharacterCue);
  assert.deepEqual(next.activeUnit.unit, DAILY_TASK.items[0].unit);
});
