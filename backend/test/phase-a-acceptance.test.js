const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../src/repositories/memoryStore');
const {
  recommendPlan,
  allocateDailyUnits
} = require('../../common/adaptive-memory');

const FIXED_DATE = '2026-07-10';
const FIXED_REVIEWED_AT = '2026-07-10T08:00:00.000Z';

function createFullPlan(testId) {
  return store.createAdaptivePlan({
    userId: `phase-a-${testId}`,
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: FIXED_DATE,
    idempotencyKey: `phase-a-${testId}-plan`
  });
}

test('84 units over 14 days allocate six new units on day one', () => {
  const plan = createFullPlan('day-one-allocation');

  assert.equal(plan.itemStates.length, 84);
  assert.equal(plan.task.newUnitCount, 6);
  assert.equal(plan.task.items.filter((item) => item.taskType === 'new').length, 6);
});

test('again on the final daily item leaves one pending weak retry', () => {
  const plan = createFullPlan('final-again');
  const userId = plan.userId;
  const initialItems = [...plan.task.items];

  initialItems.slice(0, -1).forEach((item, index) => {
    store.completeStudyTaskItem({
      userId,
      itemId: item.id,
      grade: 'good',
      reviewedAt: FIXED_REVIEWED_AT,
      idempotencyKey: `phase-a-final-again-good-${index + 1}`
    });
  });

  const result = store.completeStudyTaskItem({
    userId,
    itemId: initialItems.at(-1).id,
    grade: 'again',
    reviewedAt: FIXED_REVIEWED_AT,
    idempotencyKey: 'phase-a-final-again-retry'
  });
  const pendingWeakRetries = result.task.items.filter((item) => (
    item.status === 'pending' && item.taskType === 'weak_review'
  ));

  assert.equal(result.task.status, 'pending');
  assert.equal(pendingWeakRetries.length, 1);
  assert.equal(pendingWeakRetries[0].memoryUnitId, initialItems.at(-1).memoryUnitId);
});

test('replaying one idempotency key leaves completion counters unchanged', () => {
  const plan = createFullPlan('idempotent-completion');
  const itemId = plan.task.items[0].id;
  const payload = {
    userId: plan.userId,
    itemId,
    grade: 'good',
    reviewedAt: FIXED_REVIEWED_AT,
    idempotencyKey: 'phase-a-idempotent-completion-key'
  };

  const first = store.completeStudyTaskItem(payload);
  const replay = store.completeStudyTaskItem({
    ...payload,
    grade: 'easy',
    reviewedAt: '2026-07-10T09:00:00.000Z'
  });

  assert.deepEqual(replay, first);
  assert.deepEqual({
    successfulRecallCount: replay.state.successfulRecallCount,
    crossDaySuccessCount: replay.state.crossDaySuccessCount,
    lapseCount: replay.state.lapseCount
  }, {
    successfulRecallCount: 1,
    crossDaySuccessCount: 0,
    lapseCount: 0
  });
});

test('a section plan contains no units from another section', () => {
  const structure = store.getContentStructure('great-compassion-opening', 'great-compassion-v1');
  const selectedSection = structure.sections[0];
  const selectedUnitIds = new Set(selectedSection.units.map((unit) => unit.id));
  const otherUnitIds = new Set(
    structure.sections.slice(1).flatMap((section) => section.units.map((unit) => unit.id))
  );
  const plan = store.createAdaptivePlan({
    userId: 'phase-a-section-isolation',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'section',
    scopeId: selectedSection.id,
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: FIXED_DATE,
    idempotencyKey: 'phase-a-section-isolation-plan'
  });

  assert.equal(plan.itemStates.length, selectedUnitIds.size);
  assert.ok(plan.itemStates.every((state) => selectedUnitIds.has(state.memoryUnitId)));
  assert.ok(plan.itemStates.every((state) => !otherUnitIds.has(state.memoryUnitId)));
});

test('adaptive operations leave serialized shop state byte-for-byte unchanged', () => {
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
    date: FIXED_DATE,
    dailyMinutes: 15,
    targetDays: 14
  });

  assert.equal(JSON.stringify(shop.getShopState()), before);
});
