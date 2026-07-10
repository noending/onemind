const test = require('node:test');
const assert = require('node:assert/strict');

const storage = new Map([
  ['oneMind.api.enabled', true],
  ['oneMind.auth.token', 'signed-user-token']
]);
let remotePlans = [];

global.wx = {
  getStorageSync(key) {
    return storage.get(key);
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  }
};

const apiModulePath = require.resolve('../../common/api');
const realApi = require(apiModulePath);
require.cache[apiModulePath].exports = {
  ...realApi,
  listMemoryPlansApi: () => Promise.resolve(remotePlans)
};

const memory = require('../../common/memory');

test('adaptive mapping preserves adaptive fields and does not synthesize legacy tasks', async () => {
  const itemStates = [{
    id: 'state-1',
    memoryUnitId: 'unit-1',
    phase: 'learning',
    stability: 1.5,
    difficulty: 4,
    dueDate: '2026-07-11',
    lapseCount: 1
  }];
  remotePlans = [{
    id: 'adaptive-plan-1',
    userId: 'adaptive-user',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'section',
    scopeId: 'great-compassion-section-1',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    strategy: 'standard',
    startDate: '2026-07-10',
    expectedFinishDate: '2026-07-23',
    adaptiveStatus: 'active',
    itemStates
  }];

  const [mapped] = await memory.syncPlansFromBackend();

  assert.equal(mapped.contentVersionId, 'great-compassion-v1');
  assert.equal(mapped.scopeType, 'section');
  assert.equal(mapped.scopeId, 'great-compassion-section-1');
  assert.equal(mapped.targetDays, 14);
  assert.equal(mapped.dailyMinutes, 15);
  assert.equal(mapped.familiarityLevel, 'partial');
  assert.equal(mapped.strategy, 'standard');
  assert.equal(mapped.expectedFinishDate, '2026-07-23');
  assert.equal(mapped.adaptiveStatus, 'active');
  assert.deepEqual(mapped.itemStates, itemStates);
  assert.deepEqual(mapped.tasks, []);
});

test('legacy mapping keeps existing fixed-task compatibility fields unchanged', async () => {
  remotePlans = [{
    id: 'legacy-plan-1',
    userId: 'legacy-user',
    contentId: 'six-syllable-mantra',
    title: '六字大明咒',
    mode: 'playful',
    startDate: '2026-07-10',
    totalDays: 3,
    currentDay: 2,
    state: 'reviewing',
    streakHits: 1,
    masteryScore: 40,
    tasks: [{
      id: 'legacy-task-1',
      planId: 'legacy-plan-1',
      dayIndex: 2,
      dueDate: '2026-07-11',
      method: '首字提示',
      status: 'completed',
      result: 'needs_work',
      completedAt: '2026-07-11T08:00:00.000Z'
    }]
  }];

  const [mapped] = await memory.syncPlansFromBackend();

  assert.equal(mapped.mode, 'playful');
  assert.equal(mapped.totalDays, 3);
  assert.equal(mapped.currentDay, 2);
  assert.equal(mapped.state, 'reviewing');
  assert.equal(mapped.streakHits, 1);
  assert.equal(mapped.masteryScore, 40);
  assert.deepEqual(mapped.tasks[0], {
    id: 'legacy-task-1',
    planId: 'legacy-plan-1',
    dayIndex: 1,
    scheduledDate: '2026-07-11',
    method: '首字提示',
    done: true,
    result: 'needsWork',
    completedAt: '2026-07-11T08:00:00.000Z',
    createdAt: '',
    updatedAt: ''
  });
});
