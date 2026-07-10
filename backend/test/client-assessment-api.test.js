const test = require('node:test');
const assert = require('node:assert/strict');

const storage = new Map();
const requests = [];

global.wx = {
  getStorageSync(key) {
    return storage.get(key);
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  },
  request(options) {
    requests.push(options);
    options.success({
      statusCode: 200,
      data: { data: { requestIndex: requests.length } }
    });
  }
};

const api = require('../../common/api');

test('assessment client APIs forward authentication and idempotency headers without duplicating keys in JSON', async () => {
  api.setBaseUrl('https://api.example.test');
  storage.set('oneMind.auth.token', 'signed-user-token');

  await api.createMemoryAssessmentApi({
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    idempotencyKey: 'start-key'
  });
  await api.recommendMemoryPlanApi({
    assessmentId: 'assessment-1',
    answers: [{ memoryUnitId: 'unit-1', result: 'partial' }],
    dailyMinutes: 15,
    idempotencyKey: 'completion-key'
  });

  assert.deepEqual(requests[0], {
    url: 'https://api.example.test/api/memory-assessments',
    method: 'POST',
    timeout: 4500,
    data: {
      contentId: 'great-compassion-opening',
      contentVersionId: 'great-compassion-v1',
      scopeType: 'full'
    },
    header: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer signed-user-token',
      'Idempotency-Key': 'start-key'
    },
    success: requests[0].success,
    fail: requests[0].fail
  });
  assert.equal(Object.hasOwn(requests[0].data, 'idempotencyKey'), false);
  assert.equal(requests[1].url, 'https://api.example.test/api/memory-plans/recommendation');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].header.Authorization, 'Bearer signed-user-token');
  assert.equal(requests[1].header['Idempotency-Key'], 'completion-key');
  assert.equal(Object.hasOwn(requests[1].data, 'idempotencyKey'), false);
});

test('content structure client API percent-encodes content and version path segments', async () => {
  api.setBaseUrl('https://api.example.test');
  storage.set('oneMind.auth.token', 'signed-user-token');

  await api.getContentStructureApi('content /?#', 'version /?#');

  const request = requests.at(-1);
  assert.equal(
    request.url,
    'https://api.example.test/api/contents/content%20%2F%3F%23/versions/version%20%2F%3F%23/structure'
  );
  assert.equal(request.method, 'GET');
  assert.equal(request.header.Authorization, 'Bearer signed-user-token');
});
