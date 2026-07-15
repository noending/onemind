const test = require('node:test');
const assert = require('node:assert/strict');

const memoryStore = require('../src/repositories/memoryStore');

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('memory claim scopes pending jobs to one user without touching other queues', () => {
  const targetUserId = unique('claim-target-user');
  const otherUserId = unique('claim-other-user');
  const targetJob = memoryStore.createNotificationJob({
    userId: targetUserId,
    channel: 'wechat_subscribe',
    scheduledAt: '1900-01-01T00:00:01.000Z',
    payload: { type: 'review' }
  });
  const otherJob = memoryStore.createNotificationJob({
    userId: otherUserId,
    channel: 'wechat_subscribe',
    scheduledAt: '1900-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });

  const claimed = memoryStore.claimDueNotificationJobs({
    userId: targetUserId,
    dueBefore: '1900-01-02T00:00:00.000Z',
    claimedAt: '1900-01-02T00:00:00.000Z',
    leaseUntil: '1900-01-02T00:01:00.000Z',
    limit: 10
  });

  assert.deepEqual(claimed.map((item) => item.id), [targetJob.id]);
  assert.equal(memoryStore.listNotificationJobs({ userId: otherUserId }).find((item) => item.id === otherJob.id).status, 'pending');
});

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
  assert.equal(memoryStore.getNotificationSettings(userId, '2026-07-12T00:00:10.000Z')
    .find((item) => item.channel === 'wechat_subscribe').enabled, false);
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

test('memory lease recovery fails unknown job and consumes its reserved subscription', () => {
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
  assert.equal(memoryStore.getNotificationSettings(userId, '2026-07-12T00:00:10.000Z')
    .find((item) => item.channel === 'wechat_subscribe').enabled, false);

  const recovered = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:01:00.000Z',
    claimedAt: '2026-07-12T00:01:00.000Z',
    leaseUntil: '2026-07-12T00:02:00.000Z'
  }).find((item) => item.id === job.id);
  assert.equal(recovered, undefined);
  const storedJob = memoryStore.listNotificationJobs({ userId }).find((item) => item.id === job.id);
  assert.equal(storedJob.status, 'failed');
  assert.equal(storedJob.lastError, 'DELIVERY_OUTCOME_UNKNOWN');
  const storedSubscription = memoryStore.getNotificationSubscription({ userId, templateId });
  assert.equal(storedSubscription.consumedAt, '2026-07-12T00:01:00.000Z');
  assert.equal(storedSubscription.reservedJobId, null);
  assert.equal(memoryStore.getNotificationSettings(userId, '2026-07-12T00:01:00.000Z')
    .find((item) => item.channel === 'wechat_subscribe').enabled, false);
  assert.throws(() => memoryStore.recordNotificationJobSuccess({
    jobId: job.id,
    claimToken: firstClaim.claimToken,
    subscriptionId: firstReservation.id,
    sentAt: '2026-07-12T00:01:01.000Z'
  }), /NOTIFICATION_JOB_CLAIM_INVALID/);
});

test('memory rejects an expired success finalize without consuming its reservation, then recovery marks it unknown', () => {
  const userId = unique('memory-expired-success-user');
  const templateId = unique('memory-expired-success-template');
  const accepted = memoryStore.saveNotificationSubscriptionResult({
    userId,
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: unique('memory-expired-success-accept')
  });
  const job = memoryStore.createNotificationJob({
    userId,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  const claimed = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    claimedAt: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:00:30.000Z'
  }).find((item) => item.id === job.id);
  memoryStore.reserveNotificationSubscription({
    jobId: job.id,
    claimToken: claimed.claimToken,
    templateId,
    templateKey: 'review',
    leaseUntil: claimed.leaseUntil,
    reservedAt: '2026-07-12T00:00:00.000Z'
  });

  assert.throws(() => memoryStore.recordNotificationJobSuccess({
    jobId: job.id,
    claimToken: claimed.claimToken,
    subscriptionId: accepted.subscription.id,
    sentAt: '2026-07-12T00:00:30.000Z'
  }), /NOTIFICATION_CLAIM_STALE/);
  const processing = memoryStore.listNotificationJobs({ userId }).find((item) => item.id === job.id);
  const reserved = memoryStore.getNotificationSubscription({ userId, templateId });
  assert.equal(processing.status, 'processing');
  assert.equal(processing.claimToken, claimed.claimToken);
  assert.equal(processing.leaseUntil, '2026-07-12T00:00:30.000Z');
  assert.equal(reserved.consumedAt, null);
  assert.equal(reserved.reservedJobId, job.id);
  assert.equal(reserved.reservationToken, claimed.claimToken);

  memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:31.000Z',
    claimedAt: '2026-07-12T00:00:31.000Z'
  });
  const recovered = memoryStore.listNotificationJobs({ userId }).find((item) => item.id === job.id);
  const consumed = memoryStore.getNotificationSubscription({ userId, templateId });
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.lastError, 'DELIVERY_OUTCOME_UNKNOWN');
  assert.equal(consumed.consumedAt, '2026-07-12T00:00:31.000Z');
  assert.equal(consumed.reservedJobId, null);
});

test('memory rejects an expired failure finalize without releasing its reservation, then recovery marks it unknown', () => {
  const userId = unique('memory-expired-failure-user');
  const templateId = unique('memory-expired-failure-template');
  memoryStore.saveNotificationSubscriptionResult({
    userId,
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: unique('memory-expired-failure-accept')
  });
  const job = memoryStore.createNotificationJob({
    userId,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  const claimed = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    claimedAt: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:00:30.000Z'
  }).find((item) => item.id === job.id);
  memoryStore.reserveNotificationSubscription({
    jobId: job.id,
    claimToken: claimed.claimToken,
    templateId,
    templateKey: 'review',
    leaseUntil: claimed.leaseUntil,
    reservedAt: '2026-07-12T00:00:00.000Z'
  });

  assert.throws(() => memoryStore.recordNotificationJobFailure({
    jobId: job.id,
    claimToken: claimed.claimToken,
    error: 'WECHAT_SYSTEM_BUSY',
    retryable: true,
    attemptedAt: '2026-07-12T00:00:30.000Z'
  }), /NOTIFICATION_CLAIM_STALE/);
  const processing = memoryStore.listNotificationJobs({ userId }).find((item) => item.id === job.id);
  const reserved = memoryStore.getNotificationSubscription({ userId, templateId });
  assert.equal(processing.status, 'processing');
  assert.equal(processing.claimToken, claimed.claimToken);
  assert.equal(processing.leaseUntil, '2026-07-12T00:00:30.000Z');
  assert.equal(reserved.consumedAt, null);
  assert.equal(reserved.reservedJobId, job.id);
  assert.equal(reserved.reservationToken, claimed.claimToken);

  memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:31.000Z',
    claimedAt: '2026-07-12T00:00:31.000Z'
  });
  const recovered = memoryStore.listNotificationJobs({ userId }).find((item) => item.id === job.id);
  const consumed = memoryStore.getNotificationSubscription({ userId, templateId });
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.lastError, 'DELIVERY_OUTCOME_UNKNOWN');
  assert.equal(consumed.consumedAt, '2026-07-12T00:00:31.000Z');
  assert.equal(consumed.reservedJobId, null);
});

test('memory provider attempts are atomically counted before HTTP and stale claims cannot renew or reserve', () => {
  const userId = unique('memory-provider-attempt-user');
  const job = memoryStore.createNotificationJob({
    userId,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  const claimed = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    claimedAt: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:00:30.000Z'
  }).find((item) => item.id === job.id);

  assert.equal(memoryStore.renewNotificationJobLease({
    jobId: job.id,
    claimToken: 'stale-token',
    renewedAt: '2026-07-12T00:00:10.000Z',
    leaseUntil: '2026-07-12T00:01:10.000Z'
  }), null);
  assert.equal(memoryStore.reserveProviderAttempt({ jobId: job.id, claimToken: 'stale-token', maxAttempts: 3 }), null);
  const renewed = memoryStore.renewNotificationJobLease({
    jobId: job.id,
    claimToken: claimed.claimToken,
    renewedAt: '2026-07-12T00:00:10.000Z',
    leaseUntil: '2026-07-12T00:01:10.000Z'
  });
  assert.equal(renewed.leaseUntil, '2026-07-12T00:01:10.000Z');
  for (let expected = 1; expected <= 3; expected += 1) {
    const reserved = memoryStore.reserveProviderAttempt({
      jobId: job.id,
      claimToken: claimed.claimToken,
      maxAttempts: 3,
      attemptedAt: `2026-07-12T00:00:1${expected}.000Z`
    });
    assert.equal(reserved.providerAttemptCount, expected);
  }
  assert.equal(memoryStore.reserveProviderAttempt({
    jobId: job.id,
    claimToken: claimed.claimToken,
    maxAttempts: 3
  }), null);
  assert.equal(memoryStore.listNotificationJobs({ userId }).find((item) => item.id === job.id).providerAttemptCount, 3);
});

test('memory wechat enabled projection treats expired reservations as available without a cleanup write', () => {
  const userId = unique('memory-dynamic-enabled-user');
  const templateId = unique('memory-dynamic-enabled-template');
  memoryStore.saveNotificationSubscriptionResult({
    userId,
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: unique('memory-dynamic-enabled-accept')
  });
  const job = memoryStore.createNotificationJob({
    userId,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  const claimed = memoryStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    claimedAt: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:01:00.000Z'
  }).find((item) => item.id === job.id);
  memoryStore.reserveNotificationSubscription({
    jobId: job.id,
    claimToken: claimed.claimToken,
    templateId,
    templateKey: 'review',
    leaseUntil: claimed.leaseUntil,
    reservedAt: '2026-07-12T00:00:00.000Z'
  });

  assert.equal(memoryStore.getNotificationSettings(userId, '2026-07-12T00:00:59.000Z')
    .find((item) => item.channel === 'wechat_subscribe').enabled, false);
  assert.equal(memoryStore.getNotificationSettings(userId, '2026-07-12T00:01:00.000Z')
    .find((item) => item.channel === 'wechat_subscribe').enabled, true);
});
