const test = require('node:test');
const assert = require('node:assert/strict');

const { contents: seedContents } = require('../src/data/seed');
const memoryStore = require('../src/repositories/memoryStore');

const ASSESSMENT_KEYS = [
  'answers',
  'completedAt',
  'contentId',
  'contentVersionId',
  'createdAt',
  'familiarityLevel',
  'id',
  'items',
  'scopeId',
  'scopeType',
  'status',
  'userId'
];

function uniqueKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createAssessment(overrides = {}) {
  return memoryStore.createMemoryAssessment({
    userId: 'demo-user',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    scopeId: null,
    idempotencyKey: uniqueKey('assessment-start'),
    ...overrides
  });
}

test('assessment samples exactly eight deterministic cues across start middle and end', () => {
  const first = createAssessment();
  const second = createAssessment();

  assert.equal(first.items.length, 8);
  assert.deepEqual(first.items, second.items);
  assert.equal(first.items[0].positionBand, 'start');
  assert.ok(first.items.some((item) => item.positionBand === 'middle'));
  assert.equal(first.items.at(-1).positionBand, 'end');
  assert.deepEqual(Object.keys(first).sort(), ASSESSMENT_KEYS);
  assert.ok(first.items.every((item) => (
    item.memoryUnitId
    && item.firstCharacterCue
    && Number.isInteger(item.sortOrder)
    && !Object.hasOwn(item, 'text')
    && !Object.hasOwn(item, 'answerText')
    && !Object.hasOwn(item, 'unitText')
  )));
});

test('assessment returns every available unit once when the scope has fewer than eight units', () => {
  const content = {
    id: uniqueKey('short-content'),
    title: '短测验内容',
    body: '甲乙丙',
    preview: '甲乙丙',
    segments: ['甲', '乙', '丙'],
    publishStatus: 'published',
    reviewStatus: 'approved',
    publishedVersion: {
      id: uniqueKey('short-version'),
      versionNo: 1,
      reviewStatus: 'approved'
    },
    sections: [{
      id: uniqueKey('short-section'),
      title: '短段',
      sortOrder: 1,
      units: ['甲', '乙', '丙'].map((text, index) => ({
        id: uniqueKey(`short-unit-${index}`),
        text,
        firstCharacterCue: text,
        sortOrder: index + 1
      }))
    }]
  };
  seedContents.push(content);

  try {
    const assessment = createAssessment({
      contentId: content.id,
      contentVersionId: content.publishedVersion.id
    });
    assert.equal(assessment.items.length, 3);
    assert.equal(new Set(assessment.items.map((item) => item.memoryUnitId)).size, 3);
    assert.deepEqual(assessment.items.map((item) => item.positionBand), ['start', 'middle', 'end']);
  } finally {
    seedContents.splice(seedContents.indexOf(content), 1);
  }
});

test('assessment limits samples to the selected section scope', () => {
  const assessment = createAssessment({
    scopeType: 'section',
    scopeId: 'great-compassion-section-2'
  });

  assert.equal(assessment.items.length, 8);
  assert.ok(assessment.items.every((item) => (
    item.memoryUnitId.startsWith('great-compassion-unit-')
    && item.sortOrder >= 15
    && item.sortOrder <= 28
  )));
});

test('assessment creation is idempotent per user and start key', () => {
  const idempotencyKey = uniqueKey('assessment-idempotent-start');
  const first = createAssessment({ idempotencyKey });
  const second = createAssessment({
    idempotencyKey,
    scopeType: 'section',
    scopeId: 'great-compassion-section-2'
  });

  assert.deepEqual(second, first);
});

test('assessment creation requires a user identity before persisting state', () => {
  assert.throws(() => createAssessment({ userId: '' }), {
    code: 'ASSESSMENT_USER_REQUIRED',
    statusCode: 400
  });
});

test('scoring applies reveal penalty and exact familiarity thresholds before recommending a plan', () => {
  const partial = memoryStore.recommendMemoryPlan({
    unitCount: 84,
    answers: Array.from({ length: 8 }, () => ({ result: 'partial', revealed: false, latencyMs: 4000 })),
    dailyMinutes: 15
  });
  const revealedComplete = memoryStore.recommendMemoryPlan({
    unitCount: 84,
    answers: Array.from({ length: 8 }, () => ({ result: 'complete', revealed: true, latencyMs: 3000 })),
    dailyMinutes: 15
  });
  const revealedPartial = memoryStore.recommendMemoryPlan({
    unitCount: 84,
    answers: Array.from({ length: 8 }, () => ({ result: 'partial', revealed: true, latencyMs: 4000 })),
    dailyMinutes: 15
  });
  const thresholdPartial = memoryStore.recommendMemoryPlan({
    unitCount: 8,
    answers: [
      ...Array.from({ length: 6 }, () => ({ result: 'partial' })),
      ...Array.from({ length: 2 }, () => ({ result: 'cannot' }))
    ]
  });
  const thresholdFamiliar = memoryStore.recommendMemoryPlan({
    unitCount: 8,
    answers: [
      ...Array.from({ length: 4 }, () => ({ result: 'complete' })),
      ...Array.from({ length: 4 }, () => ({ result: 'partial' }))
    ]
  });

  assert.equal(partial.averageScore, 1);
  assert.equal(partial.familiarityLevel, 'partial');
  assert.equal(partial.targetDays, 14);
  assert.equal(revealedComplete.familiarityLevel, 'partial');
  assert.equal(revealedPartial.familiarityLevel, 'new');
  assert.equal(thresholdPartial.averageScore, 0.75);
  assert.equal(thresholdPartial.familiarityLevel, 'partial');
  assert.equal(thresholdFamiliar.averageScore, 1.5);
  assert.equal(thresholdFamiliar.familiarityLevel, 'familiar');
});

test('assessment completion persists answers and is idempotent per user and completion key', () => {
  const assessment = createAssessment();
  const idempotencyKey = uniqueKey('assessment-idempotent-complete');
  const answers = assessment.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'complete',
    revealed: false,
    latencyMs: 2500
  }));
  const first = memoryStore.recommendMemoryPlan({
    assessmentId: assessment.id,
    userId: assessment.userId,
    idempotencyKey,
    answers,
    dailyMinutes: 15
  });
  const second = memoryStore.recommendMemoryPlan({
    assessmentId: assessment.id,
    userId: assessment.userId,
    idempotencyKey,
    answers: answers.map((answer) => ({ ...answer, result: 'cannot' })),
    dailyMinutes: 60
  });

  assert.deepEqual(second, first);
  assert.equal(first.familiarityLevel, 'familiar');
  assert.equal(first.assessment.status, 'completed');
  assert.deepEqual(first.assessment.answers, answers);
  assert.equal(first.assessment.familiarityLevel, 'familiar');
});

test('postgres persists assessment start and completion idempotently', {
  skip: process.env.RUN_POSTGRES_ASSESSMENT_TEST !== '1'
}, () => {
  const postgresStore = require('../src/repositories/postgresStore');
  const startKey = uniqueKey('postgres-assessment-start');
  const completionKey = uniqueKey('postgres-assessment-complete');

  postgresStore.initializeDatabase();
  const first = postgresStore.createMemoryAssessment({
    userId: 'demo-user',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    scopeId: null,
    idempotencyKey: startKey
  });
  const repeatedStart = postgresStore.createMemoryAssessment({
    userId: 'demo-user',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'section',
    scopeId: 'ignored-by-idempotency',
    idempotencyKey: startKey
  });

  assert.equal(first.items.length, 8);
  assert.deepEqual(repeatedStart, first);
  assert.equal(first.items[0].positionBand, 'start');
  assert.ok(first.items.some((item) => item.positionBand === 'middle'));
  assert.equal(first.items.at(-1).positionBand, 'end');
  assert.ok(first.items.every((item) => (
    !Object.hasOwn(item, 'text')
    && !Object.hasOwn(item, 'answerText')
    && !Object.hasOwn(item, 'unitText')
  )));

  const answers = first.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'complete',
    revealed: false,
    latencyMs: 2500
  }));
  const completed = postgresStore.recommendMemoryPlan({
    assessmentId: first.id,
    userId: first.userId,
    idempotencyKey: completionKey,
    answers,
    dailyMinutes: 15
  });
  const repeatedCompletion = postgresStore.recommendMemoryPlan({
    assessmentId: first.id,
    userId: first.userId,
    idempotencyKey: completionKey,
    answers: answers.map((answer) => ({ ...answer, result: 'cannot' })),
    dailyMinutes: 60
  });
  const persisted = postgresStore.createMemoryAssessment({
    userId: 'demo-user',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    idempotencyKey: startKey
  });

  assert.deepEqual(repeatedCompletion, completed);
  assert.equal(completed.familiarityLevel, 'familiar');
  assert.equal(completed.assessment.status, 'completed');
  assert.deepEqual(persisted.answers, answers);
  assert.equal(persisted.familiarityLevel, 'familiar');
  assert.equal(persisted.status, 'completed');
  assert.ok(persisted.completedAt);
});
