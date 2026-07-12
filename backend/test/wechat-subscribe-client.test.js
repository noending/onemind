const test = require('node:test');
const assert = require('node:assert/strict');

function loadServices() {
  try {
    return {
      token: require('../src/services/wechatAccessToken'),
      sender: require('../src/services/wechatSubscribeSender')
    };
  } catch (error) {
    return null;
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

test('access token cache reuses concurrent work and refreshes before expiry', async () => {
  const services = loadServices();
  assert.ok(services, 'wechat access token and sender services must exist');
  let now = 1_000_000;
  let calls = 0;
  const provider = services.token.createWechatAccessTokenProvider({
    appId: 'app-id',
    appSecret: 'app-secret',
    now: () => now,
    expirySkewMs: 10_000,
    fetch: async () => {
      calls += 1;
      await Promise.resolve();
      return jsonResponse({ access_token: `token-${calls}`, expires_in: 60 });
    }
  });

  const concurrent = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);
  assert.deepEqual(concurrent, ['token-1', 'token-1', 'token-1']);
  assert.equal(calls, 1);

  now += 49_000;
  assert.equal(await provider.getToken(), 'token-1');
  now += 2_000;
  assert.equal(await provider.getToken(), 'token-2');
  assert.equal(calls, 2);
});

test('sender maps configured fields and refreshes an invalid token only once', async () => {
  const services = loadServices();
  assert.ok(services, 'wechat access token and sender services must exist');
  const tokenRequests = [];
  const sendRequests = [];
  const provider = {
    async getToken(options = {}) {
      tokenRequests.push(options);
      return options.forceRefresh ? 'fresh-token' : 'stale-token';
    }
  };
  const sender = services.sender.createWechatSubscribeSender({
    accessTokenProvider: provider,
    fetch: async (url, options) => {
      sendRequests.push({ url, options });
      return jsonResponse(sendRequests.length === 1
        ? { errcode: 40001, errmsg: 'invalid credential' }
        : { errcode: 0, errmsg: 'ok', msgid: 'wx-message-1' });
    }
  });

  const result = await sender.send({
    openid: 'openid-1',
    job: {
      scheduledAt: '2026-07-12T08:00:00.000Z',
      payload: { title: '心经复习', message: '请开始今天的复习' }
    },
    template: {
      templateId: 'tmpl-review',
      page: 'pages/practice/index',
      fields: {
        thing1: 'title',
        time2: 'scheduledAt',
        thing3: 'message'
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.providerMessageId, 'wx-message-1');
  assert.deepEqual(tokenRequests, [{}, { forceRefresh: true }]);
  assert.equal(sendRequests.length, 2);
  assert.match(sendRequests[0].url, /access_token=stale-token/);
  assert.match(sendRequests[1].url, /access_token=fresh-token/);
  assert.deepEqual(JSON.parse(sendRequests[1].options.body), {
    touser: 'openid-1',
    template_id: 'tmpl-review',
    page: 'pages/practice/index',
    data: {
      thing1: { value: '心经复习' },
      time2: { value: '2026-07-12T08:00:00.000Z' },
      thing3: { value: '请开始今天的复习' }
    }
  });
});

test('sender returns provider error details without claiming success', async () => {
  const services = loadServices();
  assert.ok(services, 'wechat access token and sender services must exist');
  const sender = services.sender.createWechatSubscribeSender({
    accessTokenProvider: { getToken: async () => 'token' },
    fetch: async () => jsonResponse({ errcode: 43101, errmsg: 'user refuse to accept' })
  });

  const result = await sender.send({
    openid: 'openid-1',
    job: { payload: { title: '提醒' } },
    template: { templateId: 'tmpl', page: '', fields: { thing1: 'payload.title' } }
  });

  assert.equal(result.ok, false);
  assert.equal(result.retryable, false);
  assert.equal(result.errorCode, 43101);
  assert.deepEqual(result.providerResponse, { errcode: 43101, errmsg: 'user refuse to accept' });
});

test('sender retries repeated invalid-token responses exactly once', async () => {
  const services = loadServices();
  assert.ok(services, 'wechat access token and sender services must exist');
  let sends = 0;
  const tokenOptions = [];
  const sender = services.sender.createWechatSubscribeSender({
    accessTokenProvider: {
      getToken: async (options = {}) => {
        tokenOptions.push(options);
        return `token-${tokenOptions.length}`;
      }
    },
    fetch: async () => {
      sends += 1;
      return jsonResponse({ errcode: 40001, errmsg: 'invalid credential' });
    }
  });

  const result = await sender.send({
    openid: 'openid-1',
    job: { payload: { title: '提醒' } },
    template: { templateId: 'tmpl', page: 'pages/profile/index', fields: { thing1: 'title' } }
  });

  assert.equal(result.ok, false);
  assert.equal(sends, 2);
  assert.deepEqual(tokenOptions, [{}, { forceRefresh: true }]);
});
