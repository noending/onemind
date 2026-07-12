const test = require('node:test');
const assert = require('node:assert/strict');

const storage = new Map();
const requests = [];
global.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  request(options) {
    requests.push(options);
    options.success({ statusCode: 200, data: { data: {} } });
  }
};

const api = require('../../common/api');

test('notification client gets capabilities and saves each template result with auth and idempotency headers', async () => {
  api.setBaseUrl('https://api.example.test');
  storage.set('oneMind.auth.token', 'notification-user-token');

  await api.getNotificationCapabilitiesApi();
  await api.saveWechatSubscriptionResultApi({
    templateId: 'tmpl-review',
    status: 'accept',
    idempotencyKey: 'notification-result-key'
  });

  assert.equal(requests[0].url, 'https://api.example.test/api/notification-capabilities');
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[1].url, 'https://api.example.test/api/notification-subscriptions/wechat');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].header.Authorization, 'Bearer notification-user-token');
  assert.equal(requests[1].header['Idempotency-Key'], 'notification-result-key');
  assert.deepEqual(requests[1].data, { templateId: 'tmpl-review', status: 'accept' });
});
