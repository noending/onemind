-- oneMind Phase 3 database baseline.
-- Target database: PostgreSQL 14+.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  nickname varchar(120),
  avatar_url text,
  phone varchar(32),
  wechat_openid varchar(128),
  unionid varchar(128),
  platform varchar(40) not null default 'wechat',
  status varchar(32) not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists users_wechat_openid_uidx on users (wechat_openid) where wechat_openid is not null;
create index if not exists users_unionid_idx on users (unionid);
create index if not exists users_phone_idx on users (phone);

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  email varchar(180),
  phone varchar(32),
  password_hash varchar(255) not null,
  status varchar(32) not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists admin_users_email_uidx on admin_users (email) where email is not null;
create unique index if not exists admin_users_phone_uidx on admin_users (phone) where phone is not null;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar(160) not null,
  type varchar(40) not null default 'dharma_group',
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid references users(id),
  admin_user_id uuid references admin_users(id),
  role varchar(60) not null,
  status varchar(32) not null default 'active',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists organization_members_org_idx on organization_members (organization_id);
create index if not exists organization_members_user_idx on organization_members (user_id);

create table if not exists contents (
  id uuid primary key default gen_random_uuid(),
  title varchar(180) not null,
  subtitle varchar(220),
  type varchar(40) not null,
  body text not null,
  preview text,
  length_tier varchar(24) not null default 'short',
  plan_days int not null default 1,
  scene varchar(180),
  source_note text,
  version_note text,
  access_level varchar(32) not null default 'public',
  publish_status varchar(32) not null default 'draft',
  review_status varchar(32) not null default 'draft',
  source_content_id uuid references contents(id),
  source_version_no int,
  organization_id uuid references organizations(id),
  created_by uuid references admin_users(id),
  reviewed_by uuid references admin_users(id),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists contents_type_status_idx on contents (type, publish_status);
create index if not exists contents_access_idx on contents (access_level);
create index if not exists contents_organization_idx on contents (organization_id);

create table if not exists content_segments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id),
  sort_order int not null,
  text text not null,
  phonetic_text text,
  hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists content_segments_order_uidx on content_segments (content_id, sort_order);

create table if not exists content_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id),
  version_no int not null,
  snapshot_json jsonb not null,
  change_note text,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists content_versions_no_uidx on content_versions (content_id, version_no);

alter table content_versions add column if not exists review_status varchar(32) not null default 'draft';
alter table content_versions add column if not exists source_note text;
alter table content_versions add column if not exists version_note text;
alter table content_versions add column if not exists reviewed_by uuid references admin_users(id);
alter table content_versions add column if not exists reviewed_at timestamptz;
alter table content_versions add column if not exists published_at timestamptz;

create table if not exists content_sections (
  id uuid primary key default gen_random_uuid(),
  content_version_id uuid not null references content_versions(id),
  title varchar(180) not null,
  subtitle varchar(220),
  source_anchor varchar(180),
  sort_order int not null,
  created_at timestamptz not null default now(),
  unique (content_version_id, sort_order)
);

create table if not exists memory_units (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references content_sections(id),
  text text not null,
  phonetic_text text,
  first_character_cue text,
  estimated_seconds int not null default 30,
  sort_order int not null,
  created_at timestamptz not null default now(),
  unique (section_id, sort_order)
);

create table if not exists content_mode_configs (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id),
  default_mode varchar(32) not null default 'scientific',
  supported_modes jsonb not null default '["scientific"]'::jsonb,
  supports_recitation boolean not null default false,
  recommended_recitation_time varchar(32),
  recitation_theme varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists content_mode_configs_content_uidx on content_mode_configs (content_id);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  title varchar(180) not null,
  type varchar(40) not null,
  url text not null,
  thumbnail_url text,
  mime_type varchar(120),
  file_size bigint,
  duration_seconds int,
  copyright_status varchar(60),
  license_scope text,
  access_level varchar(32) not null default 'public',
  publish_status varchar(32) not null default 'draft',
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists assets_type_status_idx on assets (type, publish_status);
create index if not exists assets_access_idx on assets (access_level);
create index if not exists assets_organization_idx on assets (organization_id);

create table if not exists content_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id),
  asset_id uuid not null references assets(id),
  relation_type varchar(40) not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists content_assets_content_idx on content_assets (content_id);
create index if not exists content_assets_asset_idx on content_assets (asset_id);

create table if not exists festivals (
  id uuid primary key default gen_random_uuid(),
  name varchar(160) not null,
  lunar_date varchar(40),
  solar_date date,
  related_figure varchar(160),
  description text,
  publish_status varchar(32) not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists festival_contents (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id),
  content_id uuid references contents(id),
  asset_id uuid references assets(id),
  relation_type varchar(40) not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists festival_contents_festival_idx on festival_contents (festival_id);

create table if not exists memory_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  content_id uuid not null references contents(id),
  mode varchar(32) not null default 'scientific',
  title varchar(180) not null,
  start_date date not null,
  total_days int not null,
  current_day int not null default 1,
  state varchar(32) not null default 'reviewing',
  mastery_score int not null default 0,
  streak_hits int not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists memory_plans_user_state_idx on memory_plans (user_id, state);
create index if not exists memory_plans_content_idx on memory_plans (content_id);
create index if not exists memory_plans_user_mode_idx on memory_plans (user_id, mode, state);

alter table memory_plans add column if not exists content_version_id uuid references content_versions(id);
alter table memory_plans add column if not exists scope_type varchar(24) not null default 'full';
alter table memory_plans add column if not exists scope_id uuid;
alter table memory_plans add column if not exists target_days int;
alter table memory_plans add column if not exists daily_minutes int;
alter table memory_plans add column if not exists familiarity_level varchar(24);
alter table memory_plans add column if not exists strategy varchar(24);
alter table memory_plans add column if not exists expected_finish_date date;
alter table memory_plans add column if not exists adaptive_status varchar(32);

create table if not exists memory_item_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  plan_id uuid not null references memory_plans(id) on delete cascade,
  memory_unit_id uuid not null references memory_units(id),
  phase varchar(24) not null default 'new',
  difficulty numeric(10,4) not null default 0,
  stability numeric(10,4) not null default 0,
  retrievability numeric(10,4) not null default 0,
  last_grade varchar(16),
  last_reviewed_at timestamptz,
  due_at date,
  successful_recall_count int not null default 0,
  cross_day_success_count int not null default 0,
  lapse_count int not null default 0,
  mistake_count int not null default 0,
  hint_count int not null default 0,
  last_latency_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, memory_unit_id)
);

create table if not exists daily_study_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references memory_plans(id) on delete cascade,
  task_date date not null,
  status varchar(24) not null default 'pending',
  estimated_minutes numeric(6,1) not null default 0,
  new_unit_count int not null default 0,
  review_unit_count int not null default 0,
  weak_unit_count int not null default 0,
  sequence_range_label varchar(180),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, task_date)
);

alter table daily_study_tasks
  alter column estimated_minutes type numeric(6,1)
  using estimated_minutes::numeric(6,1);

create table if not exists daily_study_task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references daily_study_tasks(id) on delete cascade,
  plan_id uuid references memory_plans(id),
  memory_unit_id uuid not null references memory_units(id),
  task_type varchar(24) not null,
  sort_order int not null,
  status varchar(24) not null default 'pending',
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, sort_order)
);

alter table daily_study_task_items
  add column if not exists plan_id uuid references memory_plans(id);

update daily_study_task_items item
set plan_id = task.plan_id
from daily_study_tasks task
where item.task_id = task.id
  and item.plan_id is null;

create table if not exists idempotency_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  idempotency_key varchar(180) not null,
  operation_type varchar(80) not null,
  entity_id varchar(180),
  request_payload jsonb,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

update idempotency_records
set operation_type = 'adaptive_plan_create'
where operation_type = 'adaptive_plan_creation';

update idempotency_records
set operation_type = 'study_task_item_complete'
where operation_type = 'adaptive_task_item_completion';

create table if not exists memory_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  content_id uuid not null references contents(id),
  content_version_id uuid not null references content_versions(id),
  scope_type varchar(24) not null default 'full',
  scope_id varchar(180),
  sampled_items jsonb not null default '[]'::jsonb,
  answers jsonb,
  familiarity_level varchar(24),
  status varchar(24) not null default 'started',
  start_idempotency_key varchar(180) not null,
  completion_idempotency_key varchar(180),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, start_idempotency_key)
);

create unique index if not exists memory_assessments_completion_key_uidx
  on memory_assessments(user_id, completion_idempotency_key)
  where completion_idempotency_key is not null;

create index if not exists idx_memory_item_states_plan_due on memory_item_states(plan_id, due_at);
create index if not exists idx_daily_study_tasks_plan_date on daily_study_tasks(plan_id, task_date);
create index if not exists idx_daily_study_task_items_task_sort on daily_study_task_items(task_id, sort_order);
create unique index if not exists daily_study_task_items_pending_unit_uidx
  on daily_study_task_items(plan_id, memory_unit_id)
  where plan_id is not null and status = 'pending';

drop index if exists daily_study_task_items_pending_new_uidx;

create table if not exists review_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references memory_plans(id),
  user_id uuid not null references users(id),
  due_date date not null,
  method varchar(60) not null,
  day_index int not null,
  status varchar(32) not null default 'pending',
  result varchar(32),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_tasks_user_due_idx on review_tasks (user_id, due_date, status);
create index if not exists review_tasks_plan_idx on review_tasks (plan_id);

create table if not exists notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  channel varchar(40) not null,
  enabled boolean not null default true,
  quiet_hours jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_settings_user_channel_uidx on notification_settings (user_id, channel);

create table if not exists notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  task_id uuid references review_tasks(id),
  channel varchar(40) not null,
  scheduled_at timestamptz not null,
  status varchar(32) not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_jobs_schedule_idx on notification_jobs (scheduled_at, status);

create table if not exists review_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  plan_id uuid not null references memory_plans(id),
  task_id uuid references review_tasks(id),
  result varchar(32) not null,
  mastery_delta int not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists review_records_plan_idx on review_records (plan_id, created_at);

create table if not exists practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  plan_id uuid not null references memory_plans(id),
  task_id uuid references review_tasks(id),
  content_id uuid not null references contents(id),
  mode varchar(32) not null,
  self_rating varchar(32),
  result_level varchar(32) not null,
  latency_band varchar(32),
  mistake_count int not null default 0,
  growth_stage varchar(32),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists practice_sessions_user_created_idx on practice_sessions (user_id, created_at desc);
create index if not exists practice_sessions_plan_created_idx on practice_sessions (plan_id, created_at desc);

create table if not exists recitation_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  content_id uuid not null references contents(id),
  goal_type varchar(32) not null default 'daily',
  preferred_period varchar(32) not null default 'morning',
  daily_target_count int not null default 1,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recitation_goals_user_content_uidx on recitation_goals (user_id, content_id, goal_type);

create table if not exists recitation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  content_id uuid not null references contents(id),
  goal_id uuid references recitation_goals(id),
  session_type varchar(32) not null default 'free',
  period varchar(32),
  round_count int not null default 1,
  duration_seconds int not null default 0,
  completed boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists recitation_sessions_user_created_idx on recitation_sessions (user_id, created_at desc);
create index if not exists recitation_sessions_content_created_idx on recitation_sessions (content_id, created_at desc);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type varchar(40) not null,
  actor_id uuid,
  organization_id uuid references organizations(id),
  action varchar(120) not null,
  target_type varchar(80) not null,
  target_id uuid,
  ip_address inet,
  user_agent text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_idx on audit_logs (actor_type, actor_id, created_at);
create index if not exists audit_logs_target_idx on audit_logs (target_type, target_id, created_at);
create index if not exists audit_logs_organization_idx on audit_logs (organization_id, created_at);
