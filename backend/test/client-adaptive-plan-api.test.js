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

test('adaptive plan client moves the idempotency key to the request header', async () => {
  api.setBaseUrl('https://api.example.test');
  storage.set('oneMind.auth.token', 'signed-user-token');

  await api.createMemoryPlanApi({
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    targetDays: 14,
    idempotencyKey: 'adaptive-create-key'
  });

  const request = requests.at(-1);
  assert.equal(request.url, 'https://api.example.test/api/memory-plans');
  assert.equal(request.header.Authorization, 'Bearer signed-user-token');
  assert.equal(request.header['Idempotency-Key'], 'adaptive-create-key');
  assert.equal(Object.hasOwn(request.data, 'idempotencyKey'), false);
});

test('today-task client encodes plan and date query values', async () => {
  api.setBaseUrl('https://api.example.test');
  storage.set('oneMind.auth.token', 'signed-user-token');

  await api.getTodayStudyTaskApi('plan /?#', '2026-07-10 /?#');

  const request = requests.at(-1);
  assert.equal(
    request.url,
    'https://api.example.test/api/study-tasks/today?planId=plan%20%2F%3F%23&date=2026-07-10%20%2F%3F%23'
  );
  assert.equal(request.method, 'GET');
  assert.equal(request.header.Authorization, 'Bearer signed-user-token');
});

test('item-completion client encodes the item path and forwards its key only in headers', async () => {
  api.setBaseUrl('https://api.example.test');
  storage.set('oneMind.auth.token', 'signed-user-token');

  await api.completeStudyTaskItemApi('item /?#', {
    grade: 'good',
    reviewedAt: '2026-07-10T08:00:00.000Z',
    idempotencyKey: 'adaptive-completion-key'
  });

  const request = requests.at(-1);
  assert.equal(
    request.url,
    'https://api.example.test/api/study-task-items/item%20%2F%3F%23/complete'
  );
  assert.equal(request.method, 'POST');
  assert.equal(request.header['Idempotency-Key'], 'adaptive-completion-key');
  assert.deepEqual(request.data, {
    grade: 'good',
    reviewedAt: '2026-07-10T08:00:00.000Z'
  });
});
