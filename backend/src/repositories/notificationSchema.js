const NOTIFICATION_SCHEMA_STATEMENTS = [
  `create table if not exists notification_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id),
    template_key varchar(80) not null,
    template_id varchar(180) not null,
    status varchar(20) not null,
    granted_at timestamptz,
    consumed_at timestamptz,
    reserved_job_id uuid,
    reservation_token varchar(180),
    reserved_at timestamptz,
    reservation_lease_until timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, template_id)
  )`,
  `create table if not exists notification_subscription_idempotency (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id),
    idempotency_key varchar(180) not null,
    request_payload jsonb not null,
    response_payload jsonb not null,
    created_at timestamptz not null default now(),
    unique (user_id, idempotency_key)
  )`,
  `alter table notification_jobs add column if not exists attempt_count int not null default 0`,
  `alter table notification_jobs add column if not exists provider_attempt_count int not null default 0`,
  `alter table notification_jobs add column if not exists next_retry_at timestamptz`,
  `alter table notification_jobs add column if not exists last_error text`,
  `alter table notification_jobs add column if not exists provider_message_id varchar(180)`,
  `alter table notification_jobs add column if not exists provider_response jsonb`,
  `alter table notification_jobs add column if not exists claim_token varchar(180)`,
  `alter table notification_jobs add column if not exists claimed_at timestamptz`,
  `alter table notification_jobs add column if not exists lease_until timestamptz`,
  `alter table notification_subscriptions add column if not exists reserved_job_id uuid`,
  `alter table notification_subscriptions add column if not exists reservation_token varchar(180)`,
  `alter table notification_subscriptions add column if not exists reserved_at timestamptz`,
  `alter table notification_subscriptions add column if not exists reservation_lease_until timestamptz`,
  `create index if not exists notification_jobs_due_idx
    on notification_jobs (status, scheduled_at, next_retry_at)`,
  `create index if not exists notification_jobs_lease_idx
    on notification_jobs (status, lease_until)`,
  `create index if not exists notification_subscriptions_reservation_idx
    on notification_subscriptions (reserved_job_id, reservation_lease_until)`
];

function ensureNotificationSchema(runSql) {
  if (typeof runSql !== 'function') throw new TypeError('runSql is required');
  NOTIFICATION_SCHEMA_STATEMENTS.forEach((statement) => runSql(statement));
}

module.exports = {
  NOTIFICATION_SCHEMA_STATEMENTS,
  ensureNotificationSchema
};
