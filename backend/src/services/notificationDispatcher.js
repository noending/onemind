const { isWechatServerOpenid, resolveTemplateForJobType } = require('./wechatSubscribeConfig');

function createStats() {
  return {
    processed: 0,
    sent: 0,
    failed: 0,
    retrying: 0,
    providers: {},
    results: []
  };
}

function providerStats(stats, provider) {
  if (!stats.providers[provider]) stats.providers[provider] = { sent: 0, failed: 0, retrying: 0 };
  return stats.providers[provider];
}

function createNotificationDispatcher({ repository, templateConfig, sender, providerReady = true, now = () => new Date(), leaseMs = 5 * 60_000 } = {}) {
  const requiredMethods = [
    'claimDueNotificationJobs',
    'getNotificationDeliveryTarget',
    'reserveNotificationSubscription',
    'isNotificationChannelEnabled',
    'recordNotificationJobSuccess',
    'recordNotificationJobFailure'
  ];
  requiredMethods.forEach((method) => {
    if (!repository || typeof repository[method] !== 'function') throw new TypeError(`repository.${method} is required`);
  });
  if (!sender || typeof sender.send !== 'function') throw new TypeError('sender.send is required');

  async function recordFailure(stats, job, { error, retryable, deliveryOutcome, providerResponse = null }) {
    const attemptedAt = now().toISOString();
    const updated = repository.recordNotificationJobFailure({
      jobId: job.id,
      claimToken: job.claimToken,
      error,
      retryable: deliveryOutcome === 'unknown' ? false : Boolean(retryable),
      deliveryOutcome: deliveryOutcome || 'known',
      providerResponse,
      attemptedAt
    });
    const provider = providerStats(stats, job.channel || 'unknown');
    const isRetrying = updated && updated.status === 'pending';
    if (isRetrying) {
      stats.retrying += 1;
      provider.retrying += 1;
    } else {
      stats.failed += 1;
      provider.failed += 1;
    }
    stats.results.push(updated);
  }

  async function dispatchJob(stats, job) {
    stats.processed += 1;
    if (job.channel !== 'wechat_subscribe') {
      return recordFailure(stats, job, { error: 'NOTIFICATION_PROVIDER_UNSUPPORTED', retryable: false });
    }
    if (!providerReady) {
      return recordFailure(stats, job, { error: 'WECHAT_SUBSCRIBE_PROVIDER_NOT_READY', retryable: false });
    }
    if (!repository.isNotificationChannelEnabled(job.userId, job.channel)) {
      return recordFailure(stats, job, { error: 'NOTIFICATION_CHANNEL_DISABLED', retryable: false });
    }
    const template = resolveTemplateForJobType(templateConfig, job.payload && job.payload.type);
    if (!template) {
      return recordFailure(stats, job, { error: 'WECHAT_TEMPLATE_NOT_CONFIGURED', retryable: false });
    }
    const target = repository.getNotificationDeliveryTarget(job.userId);
    if (!target || !isWechatServerOpenid(target.openid)) {
      return recordFailure(stats, job, { error: 'WECHAT_OPENID_REQUIRED', retryable: false });
    }
    const subscription = repository.reserveNotificationSubscription({
      jobId: job.id,
      claimToken: job.claimToken,
      templateId: template.templateId,
      templateKey: template.key,
      leaseUntil: job.leaseUntil,
      reservedAt: now().toISOString()
    });
    if (!subscription) {
      return recordFailure(stats, job, { error: 'WECHAT_SUBSCRIPTION_REQUIRED', retryable: false });
    }

    let outcome;
    try {
      outcome = await sender.send({ openid: target.openid, job, template });
    } catch (error) {
      outcome = {
        ok: false,
        retryable: error.retryable !== false,
        error: error.code || error.message || 'WECHAT_SEND_FAILED',
        providerResponse: error.providerResponse || null
      };
    }
    if (!outcome || outcome.ok !== true) {
      return recordFailure(stats, job, {
        error: outcome && outcome.error ? outcome.error : 'WECHAT_SEND_FAILED',
        retryable: Boolean(outcome && outcome.retryable),
        deliveryOutcome: outcome && outcome.deliveryOutcome,
        providerResponse: outcome ? outcome.providerResponse : null
      });
    }

    const updated = repository.recordNotificationJobSuccess({
      jobId: job.id,
      claimToken: job.claimToken,
      subscriptionId: subscription.id,
      providerMessageId: outcome.providerMessageId || '',
      providerResponse: outcome.providerResponse,
      sentAt: now().toISOString()
    });
    stats.sent += 1;
    providerStats(stats, job.channel).sent += 1;
    stats.results.push(updated);
  }

  async function dispatchDue({ dueBefore = now().toISOString(), limit = 20, userId } = {}) {
    const stats = createStats();
    const normalizedLimit = Math.max(0, Math.min(200, Number(limit || 20)));
    while (stats.processed < normalizedLimit) {
      const claimedAt = now();
      const [job] = repository.claimDueNotificationJobs({
        userId,
        dueBefore,
        claimedAt: claimedAt.toISOString(),
        leaseUntil: new Date(claimedAt.getTime() + leaseMs).toISOString(),
        limit: 1
      });
      if (!job) break;
      await dispatchJob(stats, job);
    }
    return stats;
  }

  return { dispatchDue };
}

module.exports = {
  createNotificationDispatcher
};
