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

function fixedLengthKey(prefix, length) {
  return `${uniqueKey(prefix)}${'x'.repeat(length)}`.slice(0, length);
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

let gatedPostgresStore = null;

function getGatedPostgresStore() {
  if (!gatedPostgresStore) {
    gatedPostgresStore = require('../src/repositories/postgresStore');
    gatedPostgresStore.initializeDatabase();
  }
  return gatedPostgresStore;
}

function createPostgresAssessment(postgresStore, overrides = {}) {
  return postgresStore.createMemoryAssessment({
    userId: 'demo-user',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    scopeId: null,
    idempotencyKey: uniqueKey('postgres-assessment-start'),
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
    title: 'Short assessment content',
    body: 'Alpha Beta Gamma',
    preview: 'Alpha Beta Gamma',
    segments: ['Alpha', 'Beta', 'Gamma'],
    publishStatus: 'published',
    reviewStatus: 'approved',
    publishedVersion: {
      id: uniqueKey('short-version'),
      versionNo: 1,
      reviewStatus: 'approved'
    },
    sections: [{
      id: uniqueKey('short-section'),
      title: 'Short section',
      sortOrder: 1,
      units: ['Alpha', 'Beta', 'Gamma'].map((text, index) => ({
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
  })).reverse();
  const normalizedAnswers = assessment.items.map((item) => (
    answers.find((answer) => answer.memoryUnitId === item.memoryUnitId)
  ));
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
  assert.deepEqual(first.assessment.answers, normalizedAnswers);
  assert.equal(first.assessment.familiarityLevel, 'familiar');
});

test('completed assessment only allows its original completion key to retry', () => {
  const firstAssessment = createAssessment();
  const secondAssessment = createAssessment();
  const originalKey = uniqueKey('assessment-original-completion');
  const newKey = uniqueKey('assessment-new-completion');
  const answersFor = (assessment, result = 'complete') => assessment.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result
  }));
  const firstResponse = memoryStore.recommendMemoryPlan({
    assessmentId: firstAssessment.id,
    userId: firstAssessment.userId,
    idempotencyKey: originalKey,
    answers: answersFor(firstAssessment)
  });

  assert.throws(() => memoryStore.recommendMemoryPlan({
    assessmentId: firstAssessment.id,
    userId: firstAssessment.userId,
    idempotencyKey: newKey,
    answers: answersFor(firstAssessment, 'cannot')
  }), {
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    statusCode: 409
  });

  const originalRetry = memoryStore.recommendMemoryPlan({
    assessmentId: firstAssessment.id,
    userId: firstAssessment.userId,
    idempotencyKey: originalKey,
    answers: answersFor(firstAssessment, 'cannot')
  });
  const secondResponse = memoryStore.recommendMemoryPlan({
    assessmentId: secondAssessment.id,
    userId: secondAssessment.userId,
    idempotencyKey: newKey,
    answers: answersFor(secondAssessment)
  });

  assert.deepEqual(originalRetry, firstResponse);
  assert.equal(secondResponse.assessment.id, secondAssessment.id);
});

test('assessment completion rejects unknown missing and duplicate sampled unit answers', () => {
  const invalidAnswers = {
    unknown(assessment, answers) {
      return answers.map((answer, index) => (
        index === 0 ? { ...answer, memoryUnitId: 'unknown-memory-unit' } : answer
      ));
    },
    missing(assessment, answers) {
      return answers.slice(1);
    },
    duplicate(assessment, answers) {
      return answers.map((answer, index) => (
        index === answers.length - 1
          ? { ...answer, memoryUnitId: assessment.items[0].memoryUnitId }
          : answer
      ));
    }
  };

  Object.entries(invalidAnswers).forEach(([kind, mutate]) => {
    const assessment = createAssessment();
    const answers = assessment.items.map((item) => ({
      memoryUnitId: item.memoryUnitId,
      result: 'partial'
    }));

    assert.throws(() => memoryStore.recommendMemoryPlan({
      assessmentId: assessment.id,
      userId: assessment.userId,
      idempotencyKey: uniqueKey(`invalid-${kind}`),
      answers: mutate(assessment, answers)
    }), {
      code: 'ASSESSMENT_ANSWERS_INVALID',
      statusCode: 400
    });
  });
});

test('completion key cannot return a response from another assessment', () => {
  const first = createAssessment();
  const second = createAssessment();
  const completionKey = uniqueKey('cross-assessment-completion');
  const answersFor = (assessment) => assessment.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'complete'
  }));

  memoryStore.recommendMemoryPlan({
    assessmentId: first.id,
    userId: first.userId,
    idempotencyKey: completionKey,
    answers: answersFor(first)
  });

  assert.throws(() => memoryStore.recommendMemoryPlan({
    assessmentId: second.id,
    userId: second.userId,
    idempotencyKey: completionKey,
    answers: answersFor(second)
  }), {
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    statusCode: 409
  });
});

test('memory assessment idempotency keys accept 180 characters and reject longer values', () => {
  const startKey = fixedLengthKey('memory-start-limit', 180);
  const completionKey = fixedLengthKey('memory-completion-limit', 180);
  const assessment = createAssessment({ idempotencyKey: startKey });
  const answers = assessment.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'partial'
  }));

  assert.equal(assessment.status, 'started');
  assert.equal(memoryStore.recommendMemoryPlan({
    assessmentId: assessment.id,
    userId: assessment.userId,
    idempotencyKey: completionKey,
    answers
  }).assessment.status, 'completed');
  assert.throws(() => createAssessment({ idempotencyKey: '   ' }), {
    code: 'IDEMPOTENCY_KEY_REQUIRED',
    statusCode: 400
  });
  assert.throws(() => createAssessment({
    idempotencyKey: fixedLengthKey('memory-start-too-long', 181)
  }), {
    code: 'IDEMPOTENCY_KEY_INVALID',
    statusCode: 400
  });
  assert.throws(() => memoryStore.recommendMemoryPlan({
    assessmentId: createAssessment().id,
    userId: assessment.userId,
    idempotencyKey: fixedLengthKey('memory-completion-too-long', 181),
    answers
  }), {
    code: 'IDEMPOTENCY_KEY_INVALID',
    statusCode: 400
  });
});

test('postgres persists assessment start and completion idempotently', {
  skip: process.env.RUN_POSTGRES_ASSESSMENT_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const startKey = fixedLengthKey('postgres-assessment-start', 180);
  const completionKey = fixedLengthKey('postgres-assessment-complete', 180);

  const first = createPostgresAssessment(postgresStore, { idempotencyKey: startKey });
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
  })).reverse();
  const normalizedAnswers = first.items.map((item) => (
    answers.find((answer) => answer.memoryUnitId === item.memoryUnitId)
  ));
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
  assert.deepEqual(persisted.answers, normalizedAnswers);
  assert.equal(persisted.familiarityLevel, 'familiar');
  assert.equal(persisted.status, 'completed');
  assert.ok(persisted.completedAt);
});

test('postgres completion key cannot return a response from another assessment', {
  skip: process.env.RUN_POSTGRES_ASSESSMENT_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const first = createPostgresAssessment(postgresStore);
  const second = createPostgresAssessment(postgresStore);
  const completionKey = uniqueKey('postgres-cross-assessment-completion');
  const firstAnswers = first.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'complete'
  }));
  const secondAnswers = second.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'partial'
  }));

  postgresStore.recommendMemoryPlan({
    assessmentId: first.id,
    userId: first.userId,
    idempotencyKey: completionKey,
    answers: firstAnswers
  });
  assert.throws(() => postgresStore.recommendMemoryPlan({
    assessmentId: second.id,
    userId: second.userId,
    idempotencyKey: completionKey,
    answers: secondAnswers
  }), {
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    statusCode: 409
  });
});

test('completed postgres assessment only allows its original completion key to retry', {
  skip: process.env.RUN_POSTGRES_ASSESSMENT_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const firstAssessment = createPostgresAssessment(postgresStore);
  const secondAssessment = createPostgresAssessment(postgresStore);
  const originalKey = uniqueKey('postgres-original-completion');
  const newKey = uniqueKey('postgres-new-completion');
  const answersFor = (assessment, result = 'complete') => assessment.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result
  }));
  const firstResponse = postgresStore.recommendMemoryPlan({
    assessmentId: firstAssessment.id,
    userId: firstAssessment.userId,
    idempotencyKey: originalKey,
    answers: answersFor(firstAssessment)
  });

  assert.throws(() => postgresStore.recommendMemoryPlan({
    assessmentId: firstAssessment.id,
    userId: firstAssessment.userId,
    idempotencyKey: newKey,
    answers: answersFor(firstAssessment, 'cannot')
  }), {
    code: 'IDEMPOTENCY_KEY_CONFLICT',
    statusCode: 409
  });

  const originalRetry = postgresStore.recommendMemoryPlan({
    assessmentId: firstAssessment.id,
    userId: firstAssessment.userId,
    idempotencyKey: originalKey,
    answers: answersFor(firstAssessment, 'cannot')
  });
  const secondResponse = postgresStore.recommendMemoryPlan({
    assessmentId: secondAssessment.id,
    userId: secondAssessment.userId,
    idempotencyKey: newKey,
    answers: answersFor(secondAssessment)
  });

  assert.deepEqual(originalRetry, firstResponse);
  assert.equal(secondResponse.assessment.id, secondAssessment.id);
});

const postgresInvalidAnswerMutations = {
  unknown: (assessment, validAnswers) => validAnswers.map((answer, index) => (
    index === 0 ? { ...answer, memoryUnitId: 'unknown-memory-unit' } : answer
  )),
  missing: (assessment, validAnswers) => validAnswers.slice(1),
  duplicate: (assessment, validAnswers) => validAnswers.map((answer, index) => (
    index === validAnswers.length - 1
      ? { ...answer, memoryUnitId: assessment.items[0].memoryUnitId }
      : answer
  ))
};

Object.entries(postgresInvalidAnswerMutations).forEach(([kind, mutate]) => {
  test(`postgres assessment completion rejects ${kind} sampled unit answers`, {
    skip: process.env.RUN_POSTGRES_ASSESSMENT_TEST !== '1'
  }, () => {
    const postgresStore = getGatedPostgresStore();
    const assessment = createPostgresAssessment(postgresStore);
    const validAnswers = assessment.items.map((item) => ({
      memoryUnitId: item.memoryUnitId,
      result: 'partial'
    }));
    assert.throws(() => postgresStore.recommendMemoryPlan({
      assessmentId: assessment.id,
      userId: assessment.userId,
      idempotencyKey: uniqueKey(`postgres-invalid-completion-${kind}`),
      answers: mutate(assessment, validAnswers)
    }), {
      code: 'ASSESSMENT_ANSWERS_INVALID',
      statusCode: 400
    });
  });
});

test('postgres assessment idempotency keys reject blank and oversized values', {
  skip: process.env.RUN_POSTGRES_ASSESSMENT_TEST !== '1'
}, () => {
  const postgresStore = getGatedPostgresStore();
  const assessment = createPostgresAssessment(postgresStore);
  const answers = assessment.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'partial'
  }));

  assert.throws(() => createPostgresAssessment(postgresStore, { idempotencyKey: '  ' }), {
    code: 'IDEMPOTENCY_KEY_REQUIRED',
    statusCode: 400
  });
  assert.throws(() => postgresStore.createMemoryAssessment({
    userId: 'demo-user',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    idempotencyKey: fixedLengthKey('postgres-start-too-long', 181)
  }), {
    code: 'IDEMPOTENCY_KEY_INVALID',
    statusCode: 400
  });
  assert.throws(() => postgresStore.recommendMemoryPlan({
    assessmentId: assessment.id,
    userId: assessment.userId,
    idempotencyKey: fixedLengthKey('postgres-completion-too-long', 181),
    answers
  }), {
    code: 'IDEMPOTENCY_KEY_INVALID',
    statusCode: 400
  });
});
