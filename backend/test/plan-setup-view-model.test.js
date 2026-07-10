const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildScopeOptions,
  buildRecommendationCards,
  normalizeCustomTargetDays
} = require('../../common/plan-setup');

test('scope options put full text before every reviewed section', () => {
  const result = buildScopeOptions({
    sections: [
      { id: 's1', title: '第一会' },
      { id: 's2', title: '第二会' }
    ]
  });

  assert.deepEqual(result.map((item) => item.scopeType), ['full', 'section', 'section']);
  assert.deepEqual(result.map((item) => item.scopeId), [null, 's1', 's2']);
});

test('scope options keep the full scope when sections are empty', () => {
  assert.deepEqual(buildScopeOptions({ sections: [] }), [{
    scopeType: 'full',
    scopeId: null,
    title: 'Full text',
    unitCount: 0
  }]);
});

test('scope options exclude explicitly unreviewed sections without changing structure', () => {
  const structure = {
    sections: [
      { id: 'reviewed', title: 'Reviewed', reviewStatus: 'approved', units: [{ id: 'u1' }] },
      { id: 'draft', title: 'Draft', reviewStatus: 'draft', units: [{ id: 'u2' }] }
    ]
  };
  const before = structuredClone(structure);

  const result = buildScopeOptions(structure);

  assert.deepEqual(result.map((item) => item.scopeId), [null, 'reviewed']);
  assert.deepEqual(structure, before);
});

test('scope options calculate full and section unit counts from the reviewed structure', () => {
  const options = buildScopeOptions({
    sections: [
      { id: 'first', title: '第一会', units: Array.from({ length: 42 }, (_, index) => ({ id: `a-${index}` })) },
      { id: 'second', title: '第二会', units: Array.from({ length: 42 }, (_, index) => ({ id: `b-${index}` })) }
    ]
  });

  assert.deepEqual(options.map((item) => item.unitCount), [84, 42, 42]);
});

test('recommendation cards use the shared 84 unit 14 day workload calculation', () => {
  const cards = buildRecommendationCards({
    unitCount: 84,
    dailyMinutes: 15,
    recommendedTargetDays: 14
  });
  const fourteenDayCard = cards[1];

  assert.deepEqual(cards.map((item) => item.targetDays), [7, 14, 28, 'custom']);
  assert.equal(fourteenDayCard.newUnitsPerDay, 6);
  assert.equal(fourteenDayCard.estimatedReviewUnits, 12);
  assert.equal(fourteenDayCard.estimatedMinutes, 15);
  assert.equal(fourteenDayCard.intensity, 'standard');
  assert.equal(fourteenDayCard.isRecommended, true);
  assert.ok(cards.slice(0, 3).every((item) => (
    Object.hasOwn(item, 'newUnitsPerDay')
    && Object.hasOwn(item, 'estimatedReviewUnits')
    && Object.hasOwn(item, 'estimatedMinutes')
    && Object.hasOwn(item, 'intensity')
    && Object.hasOwn(item, 'isRecommended')
  )));
});

test('recommendation cards accept targetDays as the recommendation alias', () => {
  const cards = buildRecommendationCards({ unitCount: 84, targetDays: 28 });

  assert.equal(cards.find((item) => item.targetDays === 28).isRecommended, true);
  assert.equal(cards.filter((item) => item.isRecommended).length, 1);
});

test('custom recommendation is an entry point without a numeric target day', () => {
  const custom = buildRecommendationCards({ unitCount: 84, recommendedTargetDays: 14 }).at(-1);

  assert.equal(custom.targetDays, 'custom');
  assert.equal(typeof custom.targetDays, 'string');
  assert.equal(custom.isRecommended, false);
  assert.equal(custom.newUnitsPerDay, null);
  assert.equal(custom.estimatedReviewUnits, null);
  assert.equal(custom.estimatedMinutes, null);
  assert.equal(custom.intensity, null);
});

test('recommendation cards reject missing or non-positive scope unit counts', () => {
  assert.throws(() => buildRecommendationCards({ unitCount: 0 }), /UNIT_COUNT_REQUIRED/);
  assert.throws(() => buildRecommendationCards({}), /UNIT_COUNT_REQUIRED/);
});

test('recommendation cards preserve real full and section workloads', () => {
  const full = buildRecommendationCards({ unitCount: 84, targetDays: 14 });
  const section = buildRecommendationCards({ unitCount: 14, targetDays: 14 });

  assert.equal(full.find((card) => card.targetDays === 14).newUnitsPerDay, 6);
  assert.equal(section.find((card) => card.targetDays === 14).newUnitsPerDay, 1);
});

test('custom target input clamps both visible and submitted values at supported boundaries', () => {
  assert.deepEqual(normalizeCustomTargetDays('1'), { displayValue: '3', targetDays: 3 });
  assert.deepEqual(normalizeCustomTargetDays('120'), { displayValue: '84', targetDays: 84 });
});

test('recommendation input is not mutated', () => {
  const recommendation = {
    unitCount: 84,
    dailyMinutes: 15,
    recommendedTargetDays: 14,
    familiarityLevel: 'partial'
  };
  const before = structuredClone(recommendation);

  buildRecommendationCards(recommendation);

  assert.deepEqual(recommendation, before);
});
