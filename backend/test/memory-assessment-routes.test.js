const test = require('node:test');
const assert = require('node:assert/strict');

const memoryStore = require('../src/repositories/memoryStore');
const storeModulePath = require.resolve('../src/repositories/store');

require.cache[storeModulePath] = {
  id: storeModulePath,
  filename: storeModulePath,
  loaded: true,
  exports: {
    ...memoryStore,
    getStoreMode: () => 'memory'
  }
};

const { handleRequest } = require('../src/routes');

function uniqueKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fixedLengthKey(prefix, length) {
  return `${uniqueKey(prefix)}${'x'.repeat(length)}`.slice(0, length);
}

function request({ method = 'POST', pathname, headers = {}, payload }) {
  return new Promise((resolve, reject) => {
    const response = {
      writeHead(statusCode, responseHeaders) {
        this.statusCode = statusCode;
        this.headers = responseHeaders;
      },
      end(body) {
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: body ? JSON.parse(body) : null
        });
      }
    };

    handleRequest({ method, url: pathname, headers }, response, payload ? JSON.stringify(payload) : '').catch(reject);
  });
}

async function login() {
  const response = await request({
    pathname: '/api/auth/wechat/login',
    payload: {
      code: uniqueKey('assessment-route-login'),
      userInfo: { nickName: 'Assessment Route User' }
    }
  });

  assert.equal(response.statusCode, 200);
  return response.body.data;
}

function authorization(token) {
  return { authorization: `Bearer ${token}` };
}

test('assessment routes require a signed user session and an idempotency key', async () => {
  const unauthenticated = await request({
    pathname: '/api/memory-assessments',
    payload: {
      contentId: 'great-compassion-opening',
      contentVersionId: 'great-compassion-v1'
    }
  });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.body.error, 'AUTH_REQUIRED');

  const session = await login();
  const missingStartKey = await request({
    pathname: '/api/memory-assessments',
    headers: authorization(session.token),
    payload: {
      contentId: 'great-compassion-opening',
      contentVersionId: 'great-compassion-v1'
    }
  });
  assert.equal(missingStartKey.statusCode, 400);
  assert.equal(missingStartKey.body.error, 'IDEMPOTENCY_KEY_REQUIRED');

  const missingCompletionKey = await request({
    pathname: '/api/memory-plans/recommendation',
    headers: authorization(session.token),
    payload: { assessmentId: 'unused' }
  });
  assert.equal(missingCompletionKey.statusCode, 400);
  assert.equal(missingCompletionKey.body.error, 'IDEMPOTENCY_KEY_REQUIRED');

  const missingAssessmentId = await request({
    pathname: '/api/memory-plans/recommendation',
    headers: {
      ...authorization(session.token),
      'idempotency-key': uniqueKey('missing-assessment-id')
    },
    payload: {}
  });
  assert.equal(missingAssessmentId.statusCode, 400);
  assert.equal(missingAssessmentId.body.error, 'ASSESSMENT_ID_REQUIRED');

  const blankAssessmentId = await request({
    pathname: '/api/memory-plans/recommendation',
    headers: {
      ...authorization(session.token),
      'idempotency-key': uniqueKey('blank-assessment-id')
    },
    payload: { assessmentId: '   ' }
  });
  assert.equal(blankAssessmentId.statusCode, 400);
  assert.equal(blankAssessmentId.body.error, 'ASSESSMENT_ID_REQUIRED');
});

test('assessment routes accept 180-character idempotency keys and reject longer keys', async () => {
  const session = await login();
  const oversizedKey = fixedLengthKey('route-too-long', 181);
  const oversizedStart = await request({
    pathname: '/api/memory-assessments',
    headers: {
      ...authorization(session.token),
      'idempotency-key': oversizedKey
    },
    payload: {
      contentId: 'great-compassion-opening',
      contentVersionId: 'great-compassion-v1'
    }
  });
  const oversizedCompletion = await request({
    pathname: '/api/memory-plans/recommendation',
    headers: {
      ...authorization(session.token),
      'idempotency-key': oversizedKey
    },
    payload: {}
  });

  assert.equal(oversizedStart.statusCode, 400);
  assert.equal(oversizedStart.body.error, 'IDEMPOTENCY_KEY_INVALID');
  assert.equal(oversizedCompletion.statusCode, 400);
  assert.equal(oversizedCompletion.body.error, 'IDEMPOTENCY_KEY_INVALID');

  const acceptedStart = await request({
    pathname: '/api/memory-assessments',
    headers: {
      ...authorization(session.token),
      'idempotency-key': fixedLengthKey('route-start-limit', 180)
    },
    payload: {
      contentId: 'great-compassion-opening',
      contentVersionId: 'great-compassion-v1'
    }
  });
  const answers = acceptedStart.body.data.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'partial'
  }));
  const acceptedCompletion = await request({
    pathname: '/api/memory-plans/recommendation',
    headers: {
      ...authorization(session.token),
      'idempotency-key': fixedLengthKey('route-completion-limit', 180)
    },
    payload: {
      assessmentId: acceptedStart.body.data.id,
      answers
    }
  });

  assert.equal(acceptedStart.statusCode, 201);
  assert.equal(acceptedCompletion.statusCode, 200);
});

test('assessment routes use the authenticated user and preserve start and completion idempotency', async () => {
  const session = await login();
  const startKey = uniqueKey('assessment-start');
  const createPayload = {
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    userId: 'caller-controlled-user'
  };
  const firstStart = await request({
    pathname: '/api/memory-assessments',
    headers: {
      ...authorization(session.token),
      'idempotency-key': startKey
    },
    payload: createPayload
  });
  const repeatedStart = await request({
    pathname: '/api/memory-assessments',
    headers: {
      ...authorization(session.token),
      'idempotency-key': startKey
    },
    payload: {
      ...createPayload,
      scopeType: 'section',
      scopeId: 'great-compassion-section-2',
      userId: 'another-caller-controlled-user'
    }
  });

  assert.equal(firstStart.statusCode, 201);
  assert.equal(firstStart.body.data.userId, session.user.id);
  assert.notEqual(firstStart.body.data.userId, createPayload.userId);
  assert.deepEqual(repeatedStart.body.data, firstStart.body.data);

  const answers = firstStart.body.data.items.map((item) => ({
    memoryUnitId: item.memoryUnitId,
    result: 'complete',
    revealed: false,
    latencyMs: 2500
  }));
  const completionKey = uniqueKey('assessment-completion');
  const firstCompletion = await request({
    pathname: '/api/memory-plans/recommendation',
    headers: {
      ...authorization(session.token),
      'idempotency-key': completionKey
    },
    payload: {
      assessmentId: firstStart.body.data.id,
      answers,
      dailyMinutes: 15,
      userId: 'caller-controlled-user'
    }
  });
  const repeatedCompletion = await request({
    pathname: '/api/memory-plans/recommendation',
    headers: {
      ...authorization(session.token),
      'idempotency-key': completionKey
    },
    payload: {
      assessmentId: firstStart.body.data.id,
      answers: answers.map((answer) => ({ ...answer, result: 'cannot' })),
      dailyMinutes: 60,
      userId: 'another-caller-controlled-user'
    }
  });

  assert.equal(firstCompletion.statusCode, 200);
  assert.equal(firstCompletion.body.data.assessment.userId, session.user.id);
  assert.equal(firstCompletion.body.data.assessment.status, 'completed');
  assert.deepEqual(repeatedCompletion.body.data, firstCompletion.body.data);
});

test('assessment routes allow the idempotency header for cross-origin clients', async () => {
  const response = await request({
    method: 'OPTIONS',
    pathname: '/api/memory-assessments'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Access-Control-Allow-Headers'].includes('Idempotency-Key'), true);
});
