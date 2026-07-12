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
  return {
    calls,
    listDueNotificationJobs: () => [job],
    getNotificationDeliveryTarget: () => ({ openid: 'openid-1' }),
    isNotificationChannelEnabled: () => true,
    findAvailableNotificationSubscription: () => ({ id: 'subscription-1', status: 'accept' }),
    recordNotificationJobSuccess(payload) {
      calls.success.push(payload);
      return { ...job, status: 'sent', attemptCount: 1 };
    },
    recordNotificationJobFailure(payload) {
      calls.failure.push(payload);
      return { ...job, status: payload.retryable ? 'pending' : 'failed', attemptCount: 1 };
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
      repository: { findAvailableNotificationSubscription: () => null }
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
