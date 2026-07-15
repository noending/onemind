const test = require('node:test');
const assert = require('node:assert/strict');

function loadDispatcher() {
  try {
    return require('../src/services/notificationDispatcher');
  } catch (error) {
    return null;
  }
}

function createRepository(job, overrides = {}) {
  const calls = { success: [], failure: [] };
  const claimedJob = { ...job, status: 'processing', claimToken: 'claim-1', leaseUntil: '2026-07-12T00:01:00.000Z' };
  let claimed = false;
  return {
    calls,
    claimDueNotificationJobs: () => {
      if (claimed) return [];
      claimed = true;
      return [claimedJob];
    },
    getNotificationDeliveryTarget: () => ({ openid: 'openid-1' }),
    isNotificationChannelEnabled: () => true,
    reserveNotificationSubscription: () => ({ id: 'subscription-1', status: 'accept' }),
    recordNotificationJobSuccess(payload) {
      calls.success.push(payload);
      return { ...claimedJob, status: 'sent', attemptCount: 1 };
    },
    recordNotificationJobFailure(payload) {
      calls.failure.push(payload);
      return { ...claimedJob, status: payload.retryable ? 'pending' : 'failed', attemptCount: 1 };
    },
    ...overrides
  };
}

const templateConfig = {
  templates: [{
    key: 'review',
    templateId: 'tmpl-review',
    label: '复习提醒',
    page: 'pages/practice/index',
    fields: { thing1: 'payload.title' },
    aliases: ['review']
  }]
};

test('dispatcher forwards an optional user scope to every claim', async () => {
  let claimOptions;
  const job = { id: 'job-scope', userId: 'user-scope', channel: 'wechat_subscribe', payload: { type: 'review' } };
  const repository = createRepository(job, {
    claimDueNotificationJobs(options) {
      claimOptions = options;
      return [];
    }
  });
  const dispatcher = loadDispatcher().createNotificationDispatcher({
    repository,
    templateConfig,
    sender: { send: async () => ({ ok: true }) },
    now: () => new Date('2026-07-12T00:00:00.000Z')
  });

  await dispatcher.dispatchDue({ userId: 'user-scope', limit: 1 });

  assert.equal(claimOptions.userId, 'user-scope');
});

test('dispatcher marks sent and consumes authorization only after provider success', async () => {
  const dispatcherModule = loadDispatcher();
  assert.ok(dispatcherModule, 'notificationDispatcher service must exist');
  const job = { id: 'job-1', userId: 'user-1', channel: 'wechat_subscribe', payload: { type: 'review', title: '心经' } };
  const repository = createRepository(job);
  const dispatcher = dispatcherModule.createNotificationDispatcher({
    repository,
    templateConfig,
    sender: { send: async () => ({ ok: true, providerMessageId: 'msg-1', providerResponse: { errcode: 0 } }) },
    now: () => new Date('2026-07-12T00:00:00.000Z')
  });

  const result = await dispatcher.dispatchDue({ dueBefore: '2026-07-12T01:00:00.000Z', limit: 10 });

  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.equal(repository.calls.success.length, 1);
  assert.equal(repository.calls.success[0].subscriptionId, 'subscription-1');
  assert.deepEqual(repository.calls.success[0].providerResponse, { errcode: 0 });
  assert.equal(repository.calls.failure.length, 0);
});

test('dispatcher permanently fails missing openid, config, or authorization without calling provider', async () => {
  const dispatcherModule = loadDispatcher();
  assert.ok(dispatcherModule, 'notificationDispatcher service must exist');
  let senderCalls = 0;
  const cases = [
    {
      expected: 'WECHAT_TEMPLATE_NOT_CONFIGURED',
      config: { templates: [] },
      repository: {}
    },
    {
      expected: 'WECHAT_OPENID_REQUIRED',
      config: templateConfig,
      repository: { getNotificationDeliveryTarget: () => ({ openid: '' }) }
    },
    {
      expected: 'WECHAT_OPENID_REQUIRED',
      config: templateConfig,
      repository: { getNotificationDeliveryTarget: () => ({ openid: 'mock_not_deliverable' }) }
    },
    {
      expected: 'WECHAT_SUBSCRIPTION_REQUIRED',
      config: templateConfig,
      repository: { reserveNotificationSubscription: () => null }
    },
    {
      expected: 'NOTIFICATION_CHANNEL_DISABLED',
      config: templateConfig,
      repository: { isNotificationChannelEnabled: () => false }
    }
  ];

  for (const item of cases) {
    const job = { id: `job-${item.expected}`, userId: 'user-1', channel: 'wechat_subscribe', payload: { type: 'review' } };
    const repository = createRepository(job, item.repository);
    const dispatcher = dispatcherModule.createNotificationDispatcher({
      repository,
      templateConfig: item.config,
      sender: { send: async () => { senderCalls += 1; return { ok: true }; } }
    });
    const result = await dispatcher.dispatchDue({});
    assert.equal(result.failed, 1);
    assert.equal(repository.calls.failure[0].retryable, false);
    assert.equal(repository.calls.failure[0].error, item.expected);
  }

  assert.equal(senderCalls, 0);
});

test('two memory dispatchers claim the same due job only once and loser never calls provider', async () => {
  const memoryStore = require('../src/repositories/memoryStore');
  const user = memoryStore.loginByWechatCode({
    code: `dispatcher-race-${Date.now()}`,
    wechatOpenid: `real_dispatcher_race_${Date.now()}`,
    userInfo: { nickName: '并发派发' }
  });
  memoryStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId: 'tmpl-review',
    status: 'accept',
    idempotencyKey: `dispatcher-race-accept-${Date.now()}`
  });
  const job = memoryStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review', title: '并发任务' }
  });
  let providerCalls = 0;
  const sender = {
    async send() {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ok: true, providerMessageId: 'race-message', providerResponse: { errcode: 0 } };
    }
  };
  const options = {
    repository: memoryStore,
    templateConfig,
    sender,
    now: () => new Date('2026-07-12T00:00:00.000Z')
  };

  const results = await Promise.all([
    loadDispatcher().createNotificationDispatcher(options).dispatchDue({ limit: 10 }),
    loadDispatcher().createNotificationDispatcher(options).dispatchDue({ limit: 10 })
  ]);

  assert.equal(providerCalls, 1);
  assert.equal(results.reduce((total, item) => total + item.sent, 0), 1);
  assert.equal(memoryStore.listNotificationJobs({ userId: user.id }).find((item) => item.id === job.id).status, 'sent');
});

test('two memory jobs competing for one subscription reserve it for only one provider call', async () => {
  const memoryStore = require('../src/repositories/memoryStore');
  const user = memoryStore.loginByWechatCode({
    code: `subscription-race-${Date.now()}`,
    wechatOpenid: `real_subscription_race_${Date.now()}`,
    userInfo: { nickName: '授权竞争' }
  });
  memoryStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId: 'tmpl-review',
    status: 'accept',
    idempotencyKey: `subscription-race-accept-${Date.now()}`
  });
  for (let index = 0; index < 2; index += 1) {
    memoryStore.createNotificationJob({
      userId: user.id,
      channel: 'wechat_subscribe',
      scheduledAt: `2020-01-01T00:00:0${index}.000Z`,
      payload: { type: 'review', title: `授权竞争 ${index}` }
    });
  }
  let providerCalls = 0;
  const dispatcher = loadDispatcher().createNotificationDispatcher({
    repository: memoryStore,
    templateConfig,
    sender: {
      async send() {
        providerCalls += 1;
        return { ok: true, providerMessageId: 'single-subscription', providerResponse: { errcode: 0 } };
      }
    },
    now: () => new Date('2026-07-12T00:00:00.000Z')
  });

  const result = await dispatcher.dispatchDue({ limit: 10 });

  assert.equal(providerCalls, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
});

test('memory dispatcher stops provider HTTP attempts after the third retryable failure', async () => {
  const memoryStore = require('../src/repositories/memoryStore');
  const user = memoryStore.loginByWechatCode({
    code: `http-limit-${Date.now()}`,
    wechatOpenid: `real_http_limit_${Date.now()}`,
    userInfo: { nickName: 'HTTP 上限' }
  });
  memoryStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId: 'tmpl-review',
    status: 'accept',
    idempotencyKey: `http-limit-accept-${Date.now()}`
  });
  const job = memoryStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review', title: 'HTTP 上限' }
  });
  let clock = Date.parse('2026-07-12T00:00:00.000Z');
  let providerCalls = 0;
  const dispatcher = loadDispatcher().createNotificationDispatcher({
    repository: memoryStore,
    templateConfig,
    sender: {
      async send() {
        providerCalls += 1;
        return { ok: false, retryable: true, error: 'WECHAT_SYSTEM_BUSY', providerResponse: { errcode: -1 } };
      }
    },
    now: () => new Date(clock)
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await dispatcher.dispatchDue({ limit: 10 });
    const current = memoryStore.listNotificationJobs({ userId: user.id }).find((item) => item.id === job.id);
    if (current.nextRetryAt) clock = Date.parse(current.nextRetryAt);
  }

  const stored = memoryStore.listNotificationJobs({ userId: user.id }).find((item) => item.id === job.id);
  assert.equal(providerCalls, 3);
  assert.equal(stored.status, 'failed');
  assert.equal(stored.attemptCount, 3);
});

test('dispatcher reports retry separately and never records provider failure as sent', async () => {
  const dispatcherModule = loadDispatcher();
  assert.ok(dispatcherModule, 'notificationDispatcher service must exist');
  const job = { id: 'job-retry', userId: 'user-1', channel: 'wechat_subscribe', payload: { type: 'review' } };
  const repository = createRepository(job, {
    recordNotificationJobFailure(payload) {
      this.calls.failure.push(payload);
      return { ...job, status: 'pending', attemptCount: 2, nextRetryAt: '2026-07-12T00:05:00.000Z' };
    }
  });
  const dispatcher = dispatcherModule.createNotificationDispatcher({
    repository,
    templateConfig,
    sender: { send: async () => ({
      ok: false,
      retryable: true,
      error: 'WECHAT_SYSTEM_BUSY',
      providerResponse: { errcode: -1, errmsg: 'system error' }
    }) }
  });

  const result = await dispatcher.dispatchDue({});

  assert.equal(result.sent, 0);
  assert.equal(result.retrying, 1);
  assert.equal(repository.calls.success.length, 0);
  assert.deepEqual(result.providers.wechat_subscribe, { sent: 0, failed: 0, retrying: 1 });
});

test('dispatcher permanently fails unknown delivery outcomes for manual review', async () => {
  const dispatcherModule = loadDispatcher();
  const job = { id: 'job-unknown', userId: 'user-1', channel: 'wechat_subscribe', payload: { type: 'review' } };
  const repository = createRepository(job);
  const dispatcher = dispatcherModule.createNotificationDispatcher({
    repository,
    templateConfig,
    sender: { send: async () => ({
      ok: false,
      retryable: true,
      deliveryOutcome: 'unknown',
      error: 'DELIVERY_OUTCOME_UNKNOWN',
      providerResponse: { cause: 'timeout' }
    }) }
  });

  const result = await dispatcher.dispatchDue({});

  assert.equal(result.failed, 1);
  assert.equal(result.retrying, 0);
  assert.equal(repository.calls.failure[0].retryable, false);
  assert.equal(repository.calls.failure[0].deliveryOutcome, 'unknown');
  assert.equal(repository.calls.success.length, 0);
});

test('dispatcher does not count a stale-token success as sent when repository rejects finalize', async () => {
  const dispatcherModule = loadDispatcher();
  const job = { id: 'job-stale-finalize', userId: 'user-1', channel: 'wechat_subscribe', payload: { type: 'review' } };
  const repository = createRepository(job, {
    recordNotificationJobSuccess() {
      const error = new Error('NOTIFICATION_JOB_CLAIM_INVALID');
      error.code = 'NOTIFICATION_JOB_CLAIM_INVALID';
      throw error;
    }
  });
  const dispatcher = dispatcherModule.createNotificationDispatcher({
    repository,
    templateConfig,
    sender: { send: async () => ({ ok: true, providerResponse: { errcode: 0 } }) }
  });

  await assert.rejects(dispatcher.dispatchDue({}), /NOTIFICATION_JOB_CLAIM_INVALID/);
});

test('memory dispatcher recovers a crashed worker as unknown without calling provider again', async () => {
  const memoryStore = require('../src/repositories/memoryStore');
  const user = memoryStore.loginByWechatCode({
    code: `crash-recovery-${Date.now()}`,
    wechatOpenid: `real_crash_recovery_${Date.now()}`,
    userInfo: { nickName: '崩溃恢复' }
  });
  memoryStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId: 'tmpl-review',
    status: 'accept',
    idempotencyKey: `crash-recovery-accept-${Date.now()}`
  });
  const job = memoryStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  const claim = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    claimedAt: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:00:30.000Z'
  }).find((item) => item.id === job.id);
  memoryStore.reserveNotificationSubscription({
    jobId: job.id,
    claimToken: claim.claimToken,
    templateId: 'tmpl-review',
    templateKey: 'review',
    leaseUntil: claim.leaseUntil,
    reservedAt: '2026-07-12T00:00:00.000Z'
  });
  memoryStore.reserveProviderAttempt({
    jobId: job.id,
    claimToken: claim.claimToken,
    maxAttempts: 3,
    attemptedAt: '2026-07-12T00:00:01.000Z'
  });
  let providerCalls = 0;
  const dispatcher = loadDispatcher().createNotificationDispatcher({
    repository: memoryStore,
    templateConfig,
    sender: { send: async () => { providerCalls += 1; return { ok: true }; } },
    now: () => new Date('2026-07-12T00:01:00.000Z')
  });

  const result = await dispatcher.dispatchDue({ dueBefore: '2026-07-12T00:01:00.000Z', limit: 1 });

  assert.equal(providerCalls, 0);
  assert.equal(result.processed, 0);
  assert.equal(memoryStore.listNotificationJobs({ userId: user.id }).find((item) => item.id === job.id).status, 'failed');
});
