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
        estimated_minutes numeric(6,1) not null default 0,
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
      alter table daily_study_tasks
        alter column estimated_minutes type numeric(6,1)
        using estimated_minutes::numeric(6,1)
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
      with ranked_pending_items as (
        select
          item.id,
          item.task_id,
          row_number() over (
            partition by item.plan_id, item.memory_unit_id
            order by task.task_date asc, item.created_at asc, item.id asc
          ) as pending_rank
        from daily_study_task_items item
        join daily_study_tasks task on task.id = item.task_id
        where item.plan_id is not null
          and item.status = 'pending'
      ), superseded_items as (
        update daily_study_task_items item
        set
          status = 'superseded',
          result = (
            case
              when item.result is null then '{}'::jsonb
              when jsonb_typeof(item.result) = 'object' then item.result
              else jsonb_build_object('previousResult', item.result)
            end
          ) || jsonb_build_object('migrationReason', 'superseded_duplicate_pending_unit'),
          updated_at = now()
        from ranked_pending_items ranked
        where item.id = ranked.id
          and ranked.pending_rank > 1
        returning item.id, item.task_id
      ), affected_tasks as (
        select distinct task_id from superseded_items
      ), task_counts as (
        select
          task.id,
          count(item.id) filter (
            where item.status = 'pending'
              and not exists (
                select 1
                from superseded_items superseded
                where superseded.id = item.id
              )
          )::int as pending_count
        from daily_study_tasks task
        join affected_tasks affected on affected.task_id = task.id
        left join daily_study_task_items item on item.task_id = task.id
        group by task.id
      )
      update daily_study_tasks task
      set
        status = case when task_counts.pending_count = 0 then 'completed' else 'pending' end,
        updated_at = now()
      from task_counts
      where task.id = task_counts.id
        and task.status is distinct from case
          when task_counts.pending_count = 0 then 'completed' else 'pending'
        end
    `,
    `
      create unique index if not exists daily_study_task_items_pending_unit_uidx
        on daily_study_task_items(plan_id, memory_unit_id)
        where plan_id is not null and status = 'pending'
    `,
    `
      drop index if exists daily_study_task_items_pending_new_uidx
    `
  ];

  for (const statement of statements) execute(statement);
}

module.exports = {
  ensureAdaptiveSchema
};
