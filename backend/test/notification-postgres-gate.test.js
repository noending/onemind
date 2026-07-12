const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

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
  assert.equal(postgresStore.getNotificationDeliveryTarget(user.id).openid.startsWith('notification_pg_openid_'), true);

  const successJob = postgresStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review', title: '真实 PG 门禁' }
  });
  const sent = postgresStore.recordNotificationJobSuccess({
    jobId: successJob.id,
    subscriptionId: accepted.subscription.id,
    providerMessageId: 'pg-message-id',
    providerResponse: { errcode: 0 },
    sentAt: '2026-07-12T00:00:00.000Z'
  });
  assert.equal(sent.status, 'sent');
  assert.equal(sent.attemptCount, 1);
  assert.equal(postgresStore.findAvailableNotificationSubscription({ userId: user.id, templateId }), null);
  assert.ok(postgresStore.getNotificationSubscription({ userId: user.id, templateId }).consumedAt);
  assert.equal(postgresStore.getNotificationSettings(user.id).find((item) => item.channel === 'wechat_subscribe').enabled, false);

  const failedJob = postgresStore.createNotificationJob({
    userId: user.id,
    channel: 'wechat_subscribe',
    scheduledAt: '2020-01-01T00:00:00.000Z',
    payload: { type: 'review' }
  });
  let failed;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    failed = postgresStore.recordNotificationJobFailure({
      jobId: failedJob.id,
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
