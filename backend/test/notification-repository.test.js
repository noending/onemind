const test = require('node:test');
const assert = require('node:assert/strict');

const memoryStore = require('../src/repositories/memoryStore');

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('memory subscription result is idempotent and only accept enables wechat channel', () => {
  const templateId = unique('tmpl');
  const rejected = memoryStore.saveNotificationSubscriptionResult({
    userId: 'demo-user',
    templateKey: 'review',
    templateId,
    status: 'reject',
    idempotencyKey: unique('reject')
  });
  assert.equal(rejected.setting.enabled, false);

  const key = unique('accept');
  const accepted = memoryStore.saveNotificationSubscriptionResult({
    userId: 'demo-user',
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: key
  });
  const replayed = memoryStore.saveNotificationSubscriptionResult({
    userId: 'demo-user',
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: key
  });

  assert.equal(accepted.setting.enabled, true);
  assert.deepEqual(replayed, { ...accepted, replayed: true });
});

test('memory success is the only path to sent and consumes one accepted subscription', () => {
  const userId = unique('memory-notification-user');
  const templateId = unique('tmpl-success');
  const accepted = memoryStore.saveNotificationSubscriptionResult({
    userId,
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: unique('accept-success')
  });
  const job = memoryStore.createNotificationJob({
    userId,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review', title: '心经' }
  });

  assert.equal(memoryStore.listDueNotificationJobs({ dueBefore: '2026-07-12T00:00:00.000Z' }).some((item) => item.id === job.id), true);
  const sent = memoryStore.recordNotificationJobSuccess({
    jobId: job.id,
    subscriptionId: accepted.subscription.id,
    providerMessageId: 'msg-1',
    providerResponse: { errcode: 0 },
    sentAt: '2026-07-12T00:00:00.000Z'
  });

  assert.equal(sent.status, 'sent');
  assert.equal(sent.attemptCount, 1);
  assert.equal(sent.providerMessageId, 'msg-1');
  assert.equal(memoryStore.findAvailableNotificationSubscription({ userId, templateId }), null);
  assert.ok(memoryStore.getNotificationSubscription({ userId, templateId }).consumedAt);
  assert.equal(memoryStore.getNotificationSettings(userId).find((item) => item.channel === 'wechat_subscribe').enabled, false);
});

test('memory failures retry twice with backoff and become failed on the third attempt', () => {
  const job = memoryStore.createNotificationJob({
    userId: 'demo-user',
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });

  const first = memoryStore.recordNotificationJobFailure({
    jobId: job.id,
    error: 'WECHAT_SYSTEM_BUSY',
    retryable: true,
    providerResponse: { errcode: -1 },
    attemptedAt: '2026-07-12T00:00:00.000Z'
  });
  const second = memoryStore.recordNotificationJobFailure({
    jobId: job.id,
    error: 'WECHAT_SYSTEM_BUSY',
    retryable: true,
    providerResponse: { errcode: -1 },
    attemptedAt: '2026-07-12T00:01:00.000Z'
  });
  const third = memoryStore.recordNotificationJobFailure({
    jobId: job.id,
    error: 'WECHAT_SYSTEM_BUSY',
    retryable: true,
    providerResponse: { errcode: -1 },
    attemptedAt: '2026-07-12T00:02:00.000Z'
  });

  assert.equal(first.status, 'pending');
  assert.ok(first.nextRetryAt);
  assert.equal(second.status, 'pending');
  assert.ok(new Date(second.nextRetryAt) > new Date(first.nextRetryAt));
  assert.equal(third.status, 'failed');
  assert.equal(third.nextRetryAt, null);
  assert.equal(third.sentAt, null);
  assert.equal(third.attemptCount, 3);
});
