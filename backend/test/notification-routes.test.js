const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.WECHAT_SUBSCRIBE_TEMPLATES_JSON = JSON.stringify({
  review: {
    templateId: 'route-tmpl-review',
    label: '复习提醒',
    page: 'pages/practice/index',
    fields: { thing1: 'payload.title' },
    aliases: ['review']
  }
});
process.env.WECHAT_APP_ID = 'route-test-app-id';
process.env.WECHAT_APP_SECRET = 'route-test-app-secret';
process.env.WECHAT_LOGIN_MODE = 'real';
const wechatRequests = [];
global.fetch = async (url, options = {}) => {
  wechatRequests.push({ url, options });
  const body = String(url).includes('/cgi-bin/token')
    ? { access_token: 'route-access-token', expires_in: 7200 }
    : { errcode: 0, errmsg: 'ok', msgid: 'route-provider-message' };
  return { ok: true, status: 200, json: async () => body };
};

const memoryStore = require('../src/repositories/memoryStore');
const storeModulePath = require.resolve('../src/repositories/store');
require.cache[storeModulePath] = {
  id: storeModulePath,
  filename: storeModulePath,
  loaded: true,
  exports: { ...memoryStore, getStoreMode: () => 'memory' }
};
const { handleRequest } = require('../src/routes');

function request({ method = 'GET', pathname, headers = {}, payload }) {
  return new Promise((resolve) => {
    const response = {
      writeHead(statusCode, responseHeaders) {
        this.statusCode = statusCode;
        this.headers = responseHeaders;
      },
      end(body) {
        resolve({ statusCode: this.statusCode, headers: this.headers, body: body ? JSON.parse(body) : null });
      }
    };
    handleRequest({ method, url: pathname, headers }, response, payload === undefined ? '' : JSON.stringify(payload))
      .catch((error) => resolve({ statusCode: error.statusCode || 500, body: { error: error.message } }));
  });
}

async function login(overrides = {}) {
  const user = memoryStore.loginByWechatCode({
    code: `notification-${Date.now()}-${Math.random()}`,
    wechatOpenid: overrides.wechatOpenid || `real-route-openid-${Date.now()}-${Math.random()}`,
    userInfo: { nickName: '通知测试用户' }
  });
  return {
    token: createTestToken('usr', { sub: user.id, platform: 'wechat' }, 'oneMind-local-user'),
    user
  };
}

function createTestToken(prefix, payload, secret) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 }))
    .toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${prefix}.${body}`).digest('base64url');
  return `${prefix}.${body}.${signature}`;
}

test('capabilities are public and expose only template identity fields', async () => {
  const response = await request({ pathname: '/api/notification-capabilities' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data, {
    provider: 'wechat_subscribe',
    available: true,
    templates: [{ key: 'review', templateId: 'route-tmpl-review', label: '复习提醒' }]
  });
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
  assert.equal(JSON.stringify(response.body).includes('fields'), false);
});

test('subscription result requires auth and idempotency, replays safely, and enables only accepted channel', async () => {
  const unauthenticated = await request({
    method: 'POST',
    pathname: '/api/notification-subscriptions/wechat',
    headers: { 'idempotency-key': 'route-unauthenticated' },
    payload: { templateId: 'route-tmpl-review', status: 'accept' }
  });
  assert.equal(unauthenticated.statusCode, 401);

  const session = await login();
  const authorization = { authorization: `Bearer ${session.token}` };
  const missingKey = await request({
    method: 'POST',
    pathname: '/api/notification-subscriptions/wechat',
    headers: authorization,
    payload: { templateId: 'route-tmpl-review', status: 'accept' }
  });
  assert.equal(missingKey.statusCode, 400);
  assert.equal(missingKey.body.error, 'IDEMPOTENCY_KEY_REQUIRED');

  const headers = { ...authorization, 'idempotency-key': `route-accept-${Date.now()}` };
  const accepted = await request({
    method: 'POST',
    pathname: '/api/notification-subscriptions/wechat',
    headers,
    payload: { templateId: 'route-tmpl-review', status: 'accept' }
  });
  const replayed = await request({
    method: 'POST',
    pathname: '/api/notification-subscriptions/wechat',
    headers,
    payload: { templateId: 'route-tmpl-review', status: 'accept' }
  });

  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.data.setting.enabled, true);
  assert.equal(replayed.body.data.replayed, true);

  const bypass = await request({
    method: 'PUT',
    pathname: '/api/notification-settings',
    headers: authorization,
    payload: { channel: 'wechat_subscribe', enabled: true }
  });
  assert.equal(bypass.statusCode, 409);
  assert.equal(bypass.body.error, 'WECHAT_SUBSCRIPTION_ACCEPT_REQUIRED');
});

test('subscription result rejects a user without a real server-side openid', async () => {
  const user = memoryStore.loginByWechatCode({
    code: `notification-mock-${Date.now()}`,
    wechatOpenid: `mock_notification_${Date.now()}`,
    userInfo: { nickName: '非真实登录用户' }
  });
  const response = await request({
    method: 'POST',
    pathname: '/api/notification-subscriptions/wechat',
    headers: {
      authorization: `Bearer ${createTestToken('usr', { sub: user.id, platform: 'wechat' }, 'oneMind-local-user')}`,
      'idempotency-key': `mock-openid-${Date.now()}`
    },
    payload: { templateId: 'route-tmpl-review', status: 'accept' }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error, 'WECHAT_REAL_LOGIN_REQUIRED');
});

test('notification dispatch permission rejects readonly member and allows platform operations role', async () => {
  const readonlyToken = createTestToken('adm', {
    sub: 'missing-readonly-admin',
    username: 'readonly',
    role: 'readonly_member'
  }, 'oneMind-local-admin');
  const readonlyResponse = await request({
    method: 'POST',
    pathname: '/api/admin/notification-jobs/dispatch?dueBefore=2010-01-01T00:00:00.000Z',
    headers: { authorization: `Bearer ${readonlyToken}` }
  });
  assert.equal(readonlyResponse.statusCode, 403);
  assert.equal(readonlyResponse.body.error, 'FORBIDDEN');

  const operationsToken = createTestToken('adm', {
    sub: 'missing-platform-ops-admin',
    username: 'ops',
    role: 'platform_ops'
  }, 'oneMind-local-admin');
  const allowedResponse = await request({
    method: 'POST',
    pathname: '/api/admin/notification-jobs/dispatch?dueBefore=2010-01-01T00:00:00.000Z',
    headers: { authorization: `Bearer ${operationsToken}` }
  });
  assert.equal(allowedResponse.statusCode, 200);
});

test('admin dispatch awaits mocked provider and reports sent/provider statistics', async () => {
  const session = await login({ wechatOpenid: `real-route-openid-${Date.now()}` });
  const userHeaders = { authorization: `Bearer ${session.token}` };
  const accepted = await request({
    method: 'POST',
    pathname: '/api/notification-subscriptions/wechat',
    headers: { ...userHeaders, 'idempotency-key': `route-dispatch-accept-${Date.now()}` },
    payload: { templateId: 'route-tmpl-review', status: 'accept' }
  });
  assert.equal(accepted.statusCode, 200);
  const created = await request({
    method: 'POST',
    pathname: '/api/notification-jobs',
    headers: userHeaders,
    payload: {
      channel: 'wechat_subscribe',
      scheduledAt: '2020-01-01T00:00:00.000Z',
      payload: { type: 'review', title: '路由派发测试' }
    }
  });
  assert.equal(created.statusCode, 201);

  const adminLogin = await request({
    method: 'POST',
    pathname: '/api/admin/login',
    payload: { username: 'magic', password: 'Noending5@' }
  });
  const dispatched = await request({
    method: 'POST',
    pathname: '/api/admin/notification-jobs/dispatch?dueBefore=2026-07-12T00:00:00.000Z',
    headers: { authorization: `Bearer ${adminLogin.body.data.token}` }
  });

  assert.equal(dispatched.statusCode, 200);
  assert.equal(dispatched.body.data.sent, 1);
  assert.equal(dispatched.body.data.failed, 0);
  assert.deepEqual(dispatched.body.data.providers.wechat_subscribe, { sent: 1, failed: 0, retrying: 0 });
  assert.equal(wechatRequests.some((item) => String(item.url).includes('/message/subscribe/send')), true);
  const job = memoryStore.listNotificationJobs({ userId: session.user.id }).find((item) => item.id === created.body.data.id);
  assert.equal(job.status, 'sent');
  assert.equal(job.providerMessageId, 'route-provider-message');
});
