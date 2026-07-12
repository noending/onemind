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

function createAttemptRepository({ max = 3 } = {}) {
  let count = 0;
  const calls = [];
  return {
    calls,
    renewNotificationJobLease(payload) {
      calls.push({ type: 'renew', payload });
      return { id: payload.jobId, claimToken: payload.claimToken, leaseUntil: payload.leaseUntil };
    },
    reserveProviderAttempt(payload) {
      calls.push({ type: 'reserve', payload });
      if (count >= max) return null;
      count += 1;
      return { id: payload.jobId, providerAttemptCount: count };
    }
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

test('access token fetch aborts on timeout', async () => {
  const services = loadServices();
  let observedSignal = null;
  const provider = services.token.createWechatAccessTokenProvider({
    appId: 'app-id',
    appSecret: 'app-secret',
    requestTimeoutMs: 5,
    fetch: async (url, options) => new Promise((resolve, reject) => {
      observedSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    })
  });

  await assert.rejects(provider.getToken(), (error) => error.code === 'WECHAT_TOKEN_TIMEOUT');
  assert.equal(observedSignal.aborted, true);
});

test('access token timeout also covers a stalled response body', async () => {
  const services = loadServices();
  const provider = services.token.createWechatAccessTokenProvider({
    appId: 'app-id',
    appSecret: 'app-secret',
    requestTimeoutMs: 5,
    fetch: async (url, options) => ({
      ok: true,
      status: 200,
      json: async () => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason));
        setTimeout(() => reject(new Error('body stalled')), 30);
      })
    })
  });

  await assert.rejects(provider.getToken(), (error) => error.code === 'WECHAT_TOKEN_TIMEOUT');
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
    repository: createAttemptRepository(),
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
      id: 'job-1',
      claimToken: 'claim-1',
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
    repository: createAttemptRepository(),
    fetch: async () => jsonResponse({ errcode: 43101, errmsg: 'user refuse to accept' })
  });

  const result = await sender.send({
    openid: 'openid-1',
    job: { id: 'job-refused', claimToken: 'claim-refused', payload: { title: '提醒' } },
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
    repository: createAttemptRepository(),
    fetch: async () => {
      sends += 1;
      return jsonResponse({ errcode: 40001, errmsg: 'invalid credential' });
    }
  });

  const result = await sender.send({
    openid: 'openid-1',
    job: { id: 'job-invalid-token', claimToken: 'claim-invalid-token', payload: { title: '提醒' } },
    template: { templateId: 'tmpl', page: 'pages/profile/index', fields: { thing1: 'title' } }
  });

  assert.equal(result.ok, false);
  assert.equal(sends, 2);
  assert.deepEqual(tokenOptions, [{}, { forceRefresh: true }]);
});

test('sender renews the claim and reserves a durable provider attempt before every POST', async () => {
  const services = loadServices();
  const repository = createAttemptRepository();
  const events = [];
  const originalRenew = repository.renewNotificationJobLease;
  const originalReserve = repository.reserveProviderAttempt;
  repository.renewNotificationJobLease = (payload) => {
    events.push('renew');
    return originalRenew.call(repository, payload);
  };
  repository.reserveProviderAttempt = (payload) => {
    events.push('reserve');
    return originalReserve.call(repository, payload);
  };
  const sender = services.sender.createWechatSubscribeSender({
    accessTokenProvider: { getToken: async ({ forceRefresh } = {}) => forceRefresh ? 'fresh' : 'stale' },
    repository,
    now: () => new Date('2026-07-12T00:00:00.000Z'),
    leaseMs: 60_000,
    fetch: async () => {
      events.push('fetch');
      return jsonResponse(events.filter((item) => item === 'fetch').length === 1
        ? { errcode: 40001, errmsg: 'invalid credential' }
        : { errcode: 0, errmsg: 'ok' });
    }
  });

  const result = await sender.send({
    openid: 'openid-1',
    job: { id: 'job-counted', claimToken: 'claim-counted', payload: { title: '提醒' } },
    template: { templateId: 'tmpl', page: '', fields: { thing1: 'title' } }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(events, ['renew', 'reserve', 'fetch', 'renew', 'reserve', 'fetch']);
  assert.equal(repository.calls.filter((item) => item.type === 'reserve').length, 2);
});

test('sender never POSTs when claim renewal is stale or provider attempt limit is exhausted', async () => {
  const services = loadServices();
  for (const repository of [
    {
      renewNotificationJobLease: () => null,
      reserveProviderAttempt: () => assert.fail('reserve must not run for stale claim')
    },
    {
      renewNotificationJobLease: () => ({ id: 'job-limited' }),
      reserveProviderAttempt: () => null
    }
  ]) {
    let fetchCalls = 0;
    const sender = services.sender.createWechatSubscribeSender({
      accessTokenProvider: { getToken: async () => 'token' },
      repository,
      fetch: async () => {
        fetchCalls += 1;
        return jsonResponse({ errcode: 0 });
      }
    });
    const result = await sender.send({
      openid: 'openid-1',
      job: { id: 'job-limited', claimToken: 'stale-claim', payload: {} },
      template: { templateId: 'tmpl', page: '', fields: {} }
    });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, false);
    assert.equal(fetchCalls, 0);
  }
});

test('sender classifies provider timeout and network error as unknown delivery outcome', async () => {
  const services = loadServices();
  const cases = [
    async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    }),
    async () => { throw new Error('socket reset'); },
    async (url, options) => ({
      ok: true,
      status: 200,
      json: async () => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason));
        setTimeout(() => reject(new Error('body stalled')), 30);
      })
    })
  ];
  for (const fetch of cases) {
    const sender = services.sender.createWechatSubscribeSender({
      accessTokenProvider: { getToken: async () => 'token' },
      repository: createAttemptRepository(),
      requestTimeoutMs: 5,
      fetch
    });
    const result = await sender.send({
      openid: 'openid-1',
      job: { id: `job-unknown-${Math.random()}`, claimToken: 'claim-unknown', payload: {} },
      template: { templateId: 'tmpl', page: '', fields: {} }
    });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, false);
    assert.equal(result.deliveryOutcome, 'unknown');
    assert.equal(result.error, 'DELIVERY_OUTCOME_UNKNOWN');
    if (fetch === cases[2]) assert.equal(result.providerResponse.cause, 'timeout');
  }
});

test('sender retries only explicit WeChat errors that prove the message was not accepted', async () => {
  const services = loadServices();
  for (const [body, status, expected] of [
    [{ errcode: -1, errmsg: 'system busy' }, 200, true],
    [{ errmsg: 'gateway failure' }, 500, false],
    [{ errcode: 45009, errmsg: 'api freq out of limit' }, 200, true]
  ]) {
    const sender = services.sender.createWechatSubscribeSender({
      accessTokenProvider: { getToken: async () => 'token' },
      repository: createAttemptRepository(),
      fetch: async () => jsonResponse(body, status)
    });
    const result = await sender.send({
      openid: 'openid-1',
      job: { id: `job-retry-${status}-${body.errcode}`, claimToken: 'claim-retry', payload: {} },
      template: { templateId: 'tmpl', page: '', fields: {} }
    });
    assert.equal(result.retryable, expected);
  }
});
