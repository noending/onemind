function ensureAdaptiveSchema(execute) {
  const statements = [
    `
      alter table content_versions
        add column if not exists review_status varchar(32) not null default 'draft'
    `,
    `
      alter table content_versions
        add column if not exists source_note text
    `,
    `
      alter table content_versions
        add column if not exists version_note text
    `,
    `
      alter table content_versions
        add column if not exists reviewed_by uuid references admin_users(id)
    `,
    `
      alter table content_versions
        add column if not exists reviewed_at timestamptz
    `,
    `
      alter table content_versions
        add column if not exists published_at timestamptz
    `,
    `
      create table if not exists content_sections (
        id uuid primary key default gen_random_uuid(),
        content_version_id uuid not null references content_versions(id),
        title varchar(180) not null,
        subtitle varchar(220),
        source_anchor varchar(180),
        sort_order int not null,
        created_at timestamptz not null default now(),
        unique (content_version_id, sort_order)
      )
    `,
    `
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
      )
    `,
    `
      alter table memory_plans
        add column if not exists content_version_id uuid references content_versions(id)
    `,
    `
      alter table memory_plans
        add column if not exists scope_type varchar(24) not null default 'full'
    `,
    `
      alter table memory_plans
        add column if not exists scope_id uuid
    `,
    `
      alter table memory_plans
        add column if not exists target_days int
    `,
    `
      alter table memory_plans
        add column if not exists daily_minutes int
    `,
    `
      alter table memory_plans
        add column if not exists familiarity_level varchar(24)
    `,
    `
      alter table memory_plans
        add column if not exists strategy varchar(24)
    `,
    `
      alter table memory_plans
        add column if not exists expected_finish_date date
    `,
    `
      alter table memory_plans
        add column if not exists adaptive_status varchar(32)
    `,
    `
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
      )
    `,
    `
      create table if not exists daily_study_tasks (
        id uuid primary key default gen_random_uuid(),
        plan_id uuid not null references memory_plans(id) on delete cascade,
        task_date date not null,
        status varchar(24) not null default 'pending',
        estimated_minutes int not null default 0,
        new_unit_count int not null default 0,
        review_unit_count int not null default 0,
        weak_unit_count int not null default 0,
        sequence_range_label varchar(180),
        generated_at timestamptz not null default now(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (plan_id, task_date)
      )
    `,
    `
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
      )
    `,
    `
      alter table daily_study_task_items
        add column if not exists plan_id uuid references memory_plans(id)
    `,
    `
      update daily_study_task_items item
      set plan_id = task.plan_id
      from daily_study_tasks task
      where item.task_id = task.id
        and item.plan_id is null
    `,
    `
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
      )
    `,
    `
      update idempotency_records
      set operation_type = 'adaptive_plan_create'
      where operation_type = 'adaptive_plan_creation'
    `,
    `
      update idempotency_records
      set operation_type = 'study_task_item_complete'
      where operation_type = 'adaptive_task_item_completion'
    `,
    `
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
      )
    `,
    `
      create unique index if not exists memory_assessments_completion_key_uidx
        on memory_assessments(user_id, completion_idempotency_key)
        where completion_idempotency_key is not null
    `,
    `
      create index if not exists idx_memory_item_states_plan_due
        on memory_item_states(plan_id, due_at)
    `,
    `
      create index if not exists idx_daily_study_tasks_plan_date
        on daily_study_tasks(plan_id, task_date)
    `,
    `
      create index if not exists idx_daily_study_task_items_task_sort
        on daily_study_task_items(task_id, sort_order)
    `,
    `
      create unique index if not exists daily_study_task_items_pending_new_uidx
        on daily_study_task_items(plan_id, memory_unit_id)
        where plan_id is not null and task_type = 'new' and status = 'pending'
    `
  ];

  for (const statement of statements) execute(statement);
}

module.exports = {
  ensureAdaptiveSchema
};
