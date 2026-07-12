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

function request({ method = 'GET', pathname, headers = {}, payload }) {
  return new Promise((resolve) => {
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

    handleRequest(
      { method, url: pathname, headers },
      response,
      payload === undefined ? '' : JSON.stringify(payload)
    ).catch((error) => {
      resolve({
        statusCode: error.statusCode || 500,
        body: { error: error.statusCode ? error.message : 'INTERNAL_SERVER_ERROR' }
      });
    });
  });
}

async function login() {
  const response = await request({
    method: 'POST',
    pathname: '/api/auth/wechat/login',
    payload: {
      code: uniqueKey('adaptive-route-login'),
      userInfo: { nickName: 'Adaptive Route User' }
    }
  });
  assert.equal(response.statusCode, 200);
  return response.body.data;
}

function authorization(token) {
  return { authorization: `Bearer ${token}` };
}

function adaptivePayload(overrides = {}) {
  return {
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10',
    ...overrides
  };
}

test('adaptive plan creation requires authentication and a valid idempotency key', async () => {
  const unauthenticated = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    payload: adaptivePayload()
  });
  assert.equal(unauthenticated.statusCode, 401);

  const session = await login();
  const missingKey = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    headers: authorization(session.token),
    payload: adaptivePayload()
  });
  const oversizedKey = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    headers: {
      ...authorization(session.token),
      'idempotency-key': fixedLengthKey('adaptive-route-too-long', 181)
    },
    payload: adaptivePayload()
  });

  assert.equal(missingKey.statusCode, 400);
  assert.equal(missingKey.body.error, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(oversizedKey.statusCode, 400);
  assert.equal(oversizedKey.body.error, 'IDEMPOTENCY_KEY_INVALID');
});

test('adaptive plan creation uses the signed-in user and is idempotent', async () => {
  const session = await login();
  const idempotencyKey = uniqueKey('adaptive-route-create');
  const headers = {
    ...authorization(session.token),
    'idempotency-key': idempotencyKey
  };
  const first = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    headers,
    payload: adaptivePayload({ userId: 'caller-controlled-user' })
  });
  const repeated = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    headers,
    payload: adaptivePayload({
      userId: 'another-caller-controlled-user',
      scopeType: 'section',
      scopeId: 'great-compassion-section-2'
    })
  });

  assert.equal(first.statusCode, 201);
  assert.equal(first.body.data.userId, session.user.id);
  assert.notEqual(first.body.data.userId, 'caller-controlled-user');
  assert.deepEqual(repeated.body.data, first.body.data);
});

test('legacy short-plan creation remains valid without an idempotency key', async () => {
  const session = await login();
  const response = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    headers: authorization(session.token),
    payload: {
      contentId: 'six-syllable-mantra',
      startDate: '2026-07-10',
      mode: 'scientific'
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.contentId, 'six-syllable-mantra');
  assert.equal(Array.isArray(response.body.data.tasks), true);
});

test('legacy long-plan archive enforces auth ownership and idempotent replay', async () => {
  const unauthenticated = await request({
    method: 'POST',
    pathname: '/api/memory-plans/unused/archive',
    headers: { 'idempotency-key': uniqueKey('unauthenticated-archive') }
  });
  assert.equal(unauthenticated.statusCode, 401);

  const owner = await login();
  const otherUser = await login();
  const created = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    headers: authorization(owner.token),
    payload: {
      contentId: 'great-compassion-opening',
      startDate: '2026-07-10',
      mode: 'scientific'
    }
  });
  const planId = created.body.data.id;
  const missingKey = await request({
    method: 'POST',
    pathname: `/api/memory-plans/${encodeURIComponent(planId)}/archive`,
    headers: authorization(owner.token)
  });
  const wrongOwner = await request({
    method: 'POST',
    pathname: `/api/memory-plans/${encodeURIComponent(planId)}/archive`,
    headers: {
      ...authorization(otherUser.token),
      'idempotency-key': uniqueKey('wrong-owner-archive')
    }
  });
  const idempotencyKey = uniqueKey('owner-archive');
  const headers = {
    ...authorization(owner.token),
    'idempotency-key': idempotencyKey
  };
  const first = await request({
    method: 'POST',
    pathname: `/api/memory-plans/${encodeURIComponent(planId)}/archive`,
    headers
  });
  const replay = await request({
    method: 'POST',
    pathname: `/api/memory-plans/${encodeURIComponent(planId)}/archive`,
    headers
  });
  const listed = await request({
    pathname: '/api/memory-plans',
    headers: authorization(owner.token)
  });

  assert.equal(missingKey.statusCode, 400);
  assert.equal(missingKey.body.error, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(wrongOwner.statusCode, 404);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(replay.body.data, first.body.data);
  assert.equal(listed.body.data.some((plan) => plan.id === planId), false);
});

test('today study task requires auth, planId, and plan ownership', async () => {
  const unauthenticated = await request({
    pathname: '/api/study-tasks/today?planId=unused'
  });
  assert.equal(unauthenticated.statusCode, 401);

  const owner = await login();
  const missingPlanId = await request({
    pathname: '/api/study-tasks/today',
    headers: authorization(owner.token)
  });
  assert.equal(missingPlanId.statusCode, 400);
  assert.equal(missingPlanId.body.error, 'PLAN_ID_REQUIRED');

  const create = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    headers: {
      ...authorization(owner.token),
      'idempotency-key': uniqueKey('adaptive-route-owner')
    },
    payload: adaptivePayload()
  });
  const ownerTask = await request({
    pathname: `/api/study-tasks/today?planId=${encodeURIComponent(create.body.data.id)}&date=2026-07-10`,
    headers: authorization(owner.token)
  });
  assert.equal(ownerTask.statusCode, 200);
  assert.equal(ownerTask.body.data.planId, create.body.data.id);

  const otherUser = await login();
  const unowned = await request({
    pathname: `/api/study-tasks/today?planId=${encodeURIComponent(create.body.data.id)}&date=2026-07-10`,
    headers: authorization(otherUser.token)
  });
  assert.equal(unowned.statusCode, 404);
  assert.equal(unowned.body.error, 'STUDY_TASK_NOT_FOUND');
});

test('study item completion validates keys and preserves idempotent results', async () => {
  const session = await login();
  const create = await request({
    method: 'POST',
    pathname: '/api/memory-plans',
    headers: {
      ...authorization(session.token),
      'idempotency-key': uniqueKey('adaptive-route-completion-plan')
    },
    payload: adaptivePayload()
  });
  const itemId = create.body.data.task.items[0].id;
  const pathname = `/api/study-task-items/${encodeURIComponent(itemId)}/complete`;
  const missingKey = await request({
    method: 'POST',
    pathname,
    headers: authorization(session.token),
    payload: { grade: 'good' }
  });
  const oversizedKey = await request({
    method: 'POST',
    pathname,
    headers: {
      ...authorization(session.token),
      'idempotency-key': fixedLengthKey('completion-too-long', 181)
    },
    payload: { grade: 'good' }
  });
  assert.equal(missingKey.body.error, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(oversizedKey.body.error, 'IDEMPOTENCY_KEY_INVALID');

  const idempotencyKey = uniqueKey('adaptive-route-completion');
  const headers = {
    ...authorization(session.token),
    'idempotency-key': idempotencyKey
  };
  const first = await request({
    method: 'POST',
    pathname,
    headers,
    payload: { grade: 'good', reviewedAt: '2026-07-10T08:00:00.000Z' }
  });
  const repeated = await request({
    method: 'POST',
    pathname,
    headers,
    payload: { grade: 'easy', reviewedAt: '2026-07-10T09:00:00.000Z' }
  });

  assert.equal(first.statusCode, 200);
  assert.deepEqual(repeated.body.data, first.body.data);
});
