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

  const claimed = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:01:00.000Z'
  }).find((item) => item.id === job.id);
  assert.ok(claimed);
  const reserved = memoryStore.reserveNotificationSubscription({
    jobId: claimed.id,
    claimToken: claimed.claimToken,
    templateId,
    templateKey: 'review',
    leaseUntil: claimed.leaseUntil
  });
  assert.equal(reserved.id, accepted.subscription.id);
  const sent = memoryStore.recordNotificationJobSuccess({
    jobId: job.id,
    claimToken: claimed.claimToken,
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

  const firstClaim = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:00:30.000Z'
  }).find((item) => item.id === job.id);
  const first = memoryStore.recordNotificationJobFailure({
    jobId: job.id,
    claimToken: firstClaim.claimToken,
    error: 'WECHAT_SYSTEM_BUSY',
    retryable: true,
    providerResponse: { errcode: -1 },
    attemptedAt: '2026-07-12T00:00:00.000Z'
  });
  const secondClaim = memoryStore.claimDueNotificationJobs({
    dueBefore: first.nextRetryAt,
    leaseUntil: '2026-07-12T00:02:00.000Z'
  }).find((item) => item.id === job.id);
  const second = memoryStore.recordNotificationJobFailure({
    jobId: job.id,
    claimToken: secondClaim.claimToken,
    error: 'WECHAT_SYSTEM_BUSY',
    retryable: true,
    providerResponse: { errcode: -1 },
    attemptedAt: '2026-07-12T00:01:00.000Z'
  });
  const thirdClaim = memoryStore.claimDueNotificationJobs({
    dueBefore: second.nextRetryAt,
    leaseUntil: '2026-07-12T00:07:00.000Z'
  }).find((item) => item.id === job.id);
  const third = memoryStore.recordNotificationJobFailure({
    jobId: job.id,
    claimToken: thirdClaim.claimToken,
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

test('memory enabled only counts accepted, unconsumed, and unreserved authorization', () => {
  const userId = unique('memory-enabled-user');
  const consumedTemplateId = unique('tmpl-consumed');
  const lastTemplateId = unique('tmpl-last');
  const consumed = memoryStore.saveNotificationSubscriptionResult({
    userId,
    templateKey: 'review',
    templateId: consumedTemplateId,
    status: 'accept',
    idempotencyKey: unique('accept-consumed')
  });
  memoryStore.saveNotificationSubscriptionResult({
    userId,
    templateKey: 'recitation',
    templateId: lastTemplateId,
    status: 'accept',
    idempotencyKey: unique('accept-last')
  });
  const job = memoryStore.createNotificationJob({
    userId,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  const claimed = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:01:00.000Z'
  }).find((item) => item.id === job.id);
  memoryStore.reserveNotificationSubscription({
    jobId: job.id,
    claimToken: claimed.claimToken,
    templateId: consumedTemplateId,
    templateKey: 'review',
    leaseUntil: claimed.leaseUntil
  });
  memoryStore.recordNotificationJobSuccess({
    jobId: job.id,
    claimToken: claimed.claimToken,
    subscriptionId: consumed.subscription.id,
    providerMessageId: 'enabled-msg',
    providerResponse: { errcode: 0 },
    sentAt: '2026-07-12T00:00:10.000Z'
  });
  assert.equal(memoryStore.getNotificationSettings(userId).find((item) => item.channel === 'wechat_subscribe').enabled, true);

  const rejected = memoryStore.saveNotificationSubscriptionResult({
    userId,
    templateKey: 'recitation',
    templateId: lastTemplateId,
    status: 'reject',
    idempotencyKey: unique('reject-last')
  });
  assert.equal(rejected.setting.enabled, false);
});

test('memory lease recovery reclaims processing job and releases its subscription reservation', () => {
  const userId = unique('memory-lease-user');
  const templateId = unique('memory-lease-template');
  memoryStore.saveNotificationSubscriptionResult({
    userId,
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: unique('memory-lease-accept')
  });
  const job = memoryStore.createNotificationJob({
    userId,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  const firstClaim = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:00:30.000Z'
  }).find((item) => item.id === job.id);
  const firstReservation = memoryStore.reserveNotificationSubscription({
    jobId: job.id,
    claimToken: firstClaim.claimToken,
    templateId,
    templateKey: 'review',
    leaseUntil: firstClaim.leaseUntil
  });
  assert.ok(firstReservation);
  assert.equal(memoryStore.getNotificationSettings(userId).find((item) => item.channel === 'wechat_subscribe').enabled, false);

  const recovered = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:01:00.000Z',
    leaseUntil: '2026-07-12T00:02:00.000Z'
  }).find((item) => item.id === job.id);
  assert.ok(recovered);
  assert.notEqual(recovered.claimToken, firstClaim.claimToken);
  assert.equal(memoryStore.getNotificationSettings(userId).find((item) => item.channel === 'wechat_subscribe').enabled, true);
  const recoveredReservation = memoryStore.reserveNotificationSubscription({
    jobId: job.id,
    claimToken: recovered.claimToken,
    templateId,
    templateKey: 'review',
    leaseUntil: recovered.leaseUntil
  });
  assert.equal(recoveredReservation.id, firstReservation.id);
  assert.equal(memoryStore.getNotificationSettings(userId).find((item) => item.channel === 'wechat_subscribe').enabled, false);
});
