const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

function resolvePsql() {
  return process.env.PSQL_BIN || '/opt/homebrew/bin/psql';
}

function postgresAvailable() {
  try {
    execFileSync(resolvePsql(), [
      '-X', '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
      '-U', process.env.PGUSER || 'magic', '-d', process.env.PGDATABASE || 'onemind', '-tAc', 'select 1'
    ], {
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'Noending5@' },
      stdio: 'pipe'
    });
    return true;
  } catch (error) {
    return false;
  }
}

const canUsePostgres = postgresAvailable();

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function runSubscriptionSave(payload) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      path.resolve(__dirname, 'fixtures/save-notification-subscription.js'),
      JSON.stringify(payload)
    ], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('close', () => resolve(JSON.parse(stdout)));
  });
}

const templateConfig = {
  templates: [{
    key: 'review',
    templateId: 'pg-dispatch-template',
    label: '复习提醒',
    page: 'pages/practice/index',
    fields: { thing1: 'payload.title' },
    aliases: ['review']
  }]
};

test('postgres notification gate matches memory sent, consumed, and retry semantics', { skip: !canUsePostgres }, () => {
  const postgresStore = require('../src/repositories/postgresStore');
  postgresStore.initializeDatabase();
  const user = postgresStore.loginByWechatCode({
    code: `notification-pg-${Date.now()}`,
    wechatOpenid: `notification_pg_openid_${Date.now()}`,
    userInfo: { nickName: 'PG 通知门禁' }
  });
  const templateId = `pg-template-${Date.now()}`;
  const acceptanceKey = `pg-accept-${Date.now()}`;
  const accepted = postgresStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: acceptanceKey
  });
  const replayed = postgresStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId,
    status: 'accept',
    idempotencyKey: acceptanceKey
  });
  assert.equal(replayed.replayed, true);
  assert.equal(accepted.setting.enabled, true);
  const remainingTemplateId = `pg-template-remaining-${Date.now()}`;
  postgresStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'recitation',
    templateId: remainingTemplateId,
    status: 'accept',
    idempotencyKey: `pg-accept-remaining-${Date.now()}`
  });
  assert.equal(postgresStore.getNotificationDeliveryTarget(user.id).openid.startsWith('notification_pg_openid_'), true);

  const successJob = postgresStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review', title: '真实 PG 门禁' }
  });
  const claimedSuccess = postgresStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:01:00.000Z'
  }).find((item) => item.id === successJob.id);
  const reserved = postgresStore.reserveNotificationSubscription({
    jobId: successJob.id,
    claimToken: claimedSuccess.claimToken,
    templateId,
    templateKey: 'review',
    leaseUntil: claimedSuccess.leaseUntil
  });
  assert.equal(reserved.id, accepted.subscription.id);
  const sent = postgresStore.recordNotificationJobSuccess({
    jobId: successJob.id,
    claimToken: claimedSuccess.claimToken,
    subscriptionId: accepted.subscription.id,
    providerMessageId: 'pg-message-id',
    providerResponse: { errcode: 0 },
    sentAt: '2026-07-12T00:00:00.000Z'
  });
  assert.equal(sent.status, 'sent');
  assert.equal(sent.attemptCount, 1);
  assert.equal(postgresStore.findAvailableNotificationSubscription({ userId: user.id, templateId }), null);
  assert.ok(postgresStore.getNotificationSubscription({ userId: user.id, templateId }).consumedAt);
  assert.equal(postgresStore.getNotificationSettings(user.id).find((item) => item.channel === 'wechat_subscribe').enabled, true);
  const rejectedRemaining = postgresStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'recitation',
    templateId: remainingTemplateId,
    status: 'reject',
    idempotencyKey: `pg-reject-remaining-${Date.now()}`
  });
  assert.equal(rejectedRemaining.setting.enabled, false);

  const failedJob = postgresStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  let failed;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const dueBefore = attempt === 0 ? '2026-07-12T00:00:00.000Z' : failed.nextRetryAt;
    const claimed = postgresStore.claimDueNotificationJobs({
      dueBefore,
      leaseUntil: new Date(Date.parse(dueBefore) + 30_000).toISOString()
    }).find((item) => item.id === failedJob.id);
    assert.ok(claimed);
    failed = postgresStore.recordNotificationJobFailure({
      jobId: failedJob.id,
      claimToken: claimed.claimToken,
      error: 'WECHAT_SYSTEM_BUSY',
      retryable: true,
      providerResponse: { errcode: -1 },
      attemptedAt: `2026-07-12T00:0${attempt}:00.000Z`
    });
  }
  assert.equal(failed.status, 'failed');
  assert.equal(failed.attemptCount, 3);
  assert.equal(failed.sentAt, null);
});

test('postgres subscription save is atomic and idempotent across concurrent connections', { skip: !canUsePostgres }, async () => {
  const postgresStore = require('../src/repositories/postgresStore');
  postgresStore.initializeDatabase();
  const user = postgresStore.loginByWechatCode({
    code: unique('pg-idempotency-user'),
    wechatOpenid: unique('pg-idempotency-openid'),
    userInfo: { nickName: 'PG 幂等并发' }
  });
  const samePayload = {
    userId: user.id,
    templateKey: 'review',
    templateId: unique('pg-idempotency-template'),
    status: 'accept',
    idempotencyKey: unique('pg-idempotency-key')
  };
  const sameResults = await Promise.all([
    runSubscriptionSave(samePayload),
    runSubscriptionSave(samePayload)
  ]);
  assert.equal(sameResults.every((item) => item.ok), true, JSON.stringify(sameResults));
  assert.equal(sameResults.filter((item) => item.result.replayed === true).length, 1);

  const conflictKey = unique('pg-conflict-key');
  const templateId = unique('pg-conflict-template');
  const [acceptResult, rejectResult] = await Promise.all([
    runSubscriptionSave({ ...samePayload, templateId, idempotencyKey: conflictKey, status: 'accept' }),
    runSubscriptionSave({ ...samePayload, templateId, idempotencyKey: conflictKey, status: 'reject' })
  ]);
  const winner = [acceptResult, rejectResult].find((item) => item.ok);
  const loser = [acceptResult, rejectResult].find((item) => !item.ok);
  assert.ok(winner);
  assert.equal(loser.code, 'IDEMPOTENCY_KEY_CONFLICT');
  const stored = postgresStore.getNotificationSubscription({ userId: user.id, templateId });
  assert.equal(stored.status, winner.result.subscription.status);
});

test('postgres claim and reservation prevent duplicate provider calls for same job and same subscription', { skip: !canUsePostgres }, async () => {
  const postgresStore = require('../src/repositories/postgresStore');
  const { createNotificationDispatcher } = require('../src/services/notificationDispatcher');
  postgresStore.initializeDatabase();
  const user = postgresStore.loginByWechatCode({
    code: unique('pg-race-user'),
    wechatOpenid: unique('pg-race-openid'),
    userInfo: { nickName: 'PG 并发派发' }
  });
  postgresStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId: 'pg-dispatch-template',
    status: 'accept',
    idempotencyKey: unique('pg-race-accept')
  });
  const sameJob = postgresStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review', title: 'PG 同任务' }
  });
  let providerCalls = 0;
  const sender = {
    async send() {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ok: true, providerMessageId: unique('pg-message'), providerResponse: { errcode: 0 } };
    }
  };
  const options = {
    repository: postgresStore,
    templateConfig,
    sender,
    now: () => new Date('2026-07-12T00:00:00.000Z')
  };
  await Promise.all([
    createNotificationDispatcher(options).dispatchDue({ limit: 10 }),
    createNotificationDispatcher(options).dispatchDue({ limit: 10 })
  ]);
  assert.equal(providerCalls, 1);
  assert.equal(postgresStore.listNotificationJobs({ userId: user.id }).find((item) => item.id === sameJob.id).status, 'sent');

  postgresStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId: 'pg-dispatch-template',
    status: 'accept',
    idempotencyKey: unique('pg-race-second-accept')
  });
  for (let index = 0; index < 2; index += 1) {
    postgresStore.createNotificationJob({
      userId: user.id,
      channel: 'wechat_subscribe',
      scheduledAt: `2020-01-02T00:00:0${index}.000Z`,
      payload: { type: 'review', title: `PG 同授权 ${index}` }
    });
  }
  providerCalls = 0;
  const result = await createNotificationDispatcher(options).dispatchDue({
    dueBefore: '2026-07-12T00:00:00.000Z',
    limit: 10
  });
  assert.equal(providerCalls, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
});

test('postgres lease recovery releases reservation and HTTP retries stop at three', { skip: !canUsePostgres }, async () => {
  const postgresStore = require('../src/repositories/postgresStore');
  const { createNotificationDispatcher } = require('../src/services/notificationDispatcher');
  postgresStore.initializeDatabase();
  const user = postgresStore.loginByWechatCode({
    code: unique('pg-lease-user'),
    wechatOpenid: unique('pg-lease-openid'),
    userInfo: { nickName: 'PG Lease' }
  });
  const accepted = postgresStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId: 'pg-dispatch-template',
    status: 'accept',
    idempotencyKey: unique('pg-lease-accept')
  });
  const leaseJob = postgresStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  const firstClaim = postgresStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:00:00.000Z',
    leaseUntil: '2026-07-12T00:00:30.000Z'
  }).find((item) => item.id === leaseJob.id);
  postgresStore.reserveNotificationSubscription({
    jobId: leaseJob.id,
    claimToken: firstClaim.claimToken,
    templateId: 'pg-dispatch-template',
    templateKey: 'review',
    leaseUntil: firstClaim.leaseUntil
  });
  assert.equal(postgresStore.getNotificationSettings(user.id).find((item) => item.channel === 'wechat_subscribe').enabled, false);
  const recovered = postgresStore.claimDueNotificationJobs({
    dueBefore: '2026-07-12T00:01:00.000Z',
    leaseUntil: '2026-07-12T00:02:00.000Z'
  }).find((item) => item.id === leaseJob.id);
  assert.ok(recovered);
  assert.notEqual(recovered.claimToken, firstClaim.claimToken);
  assert.equal(postgresStore.getNotificationSettings(user.id).find((item) => item.channel === 'wechat_subscribe').enabled, true);
  assert.equal(postgresStore.reserveNotificationSubscription({
    jobId: leaseJob.id,
    claimToken: recovered.claimToken,
    templateId: 'pg-dispatch-template',
    templateKey: 'review',
    leaseUntil: recovered.leaseUntil
  }).id, accepted.subscription.id);
  assert.equal(postgresStore.getNotificationSettings(user.id).find((item) => item.channel === 'wechat_subscribe').enabled, false);
  postgresStore.recordNotificationJobFailure({
    jobId: leaseJob.id,
    claimToken: recovered.claimToken,
    error: 'LEASE_TEST_RESET',
    retryable: false,
    attemptedAt: '2026-07-12T00:01:01.000Z'
  });

  postgresStore.saveNotificationSubscriptionResult({
    userId: user.id,
    templateKey: 'review',
    templateId: 'pg-dispatch-template',
    status: 'accept',
    idempotencyKey: unique('pg-http-accept')
  });
  const retryJob = postgresStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-03T00:00:00.000Z',
    payload: { type: 'review', title: 'PG HTTP 上限' }
  });
  let clock = Date.parse('2026-07-12T00:00:00.000Z');
  let providerCalls = 0;
  const dispatcher = createNotificationDispatcher({
    repository: postgresStore,
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
    const current = postgresStore.listNotificationJobs({ userId: user.id }).find((item) => item.id === retryJob.id);
    if (current.nextRetryAt) clock = Date.parse(current.nextRetryAt);
  }
  const stored = postgresStore.listNotificationJobs({ userId: user.id }).find((item) => item.id === retryJob.id);
  assert.equal(providerCalls, 3);
  assert.equal(stored.status, 'failed');
  assert.equal(stored.attemptCount, 3);
});
