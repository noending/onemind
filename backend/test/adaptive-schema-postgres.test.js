const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const { ensureAdaptiveSchema } = require('../src/repositories/adaptiveSchema');

const POSTGRES_CONTENT_ID = '33333333-3333-4333-8333-000000000005';
const PENDING_INDEX = 'daily_study_task_items_pending_unit_uidx';
const MIGRATION_REASON = 'superseded_duplicate_pending_unit';

function resolvePsqlBinary() {
  return [
    process.env.PSQL_BIN,
    '/opt/homebrew/bin/psql',
    '/usr/local/bin/psql',
    '/usr/bin/psql',
    'psql'
  ].filter(Boolean).find((candidate) => !candidate.includes('/') || fs.existsSync(candidate));
}

function runPostgresSql(sql) {
  return execFileSync(resolvePsqlBinary(), [
    '-X',
    '-h', process.env.PGHOST || '127.0.0.1',
    '-p', process.env.PGPORT || '5432',
    '-U', process.env.PGUSER || 'magic',
    '-d', process.env.PGDATABASE || 'onemind',
    '-v', 'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-c', sql
  ], {
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'Noending5@' },
    encoding: 'utf8'
  }).trim();
}

function queryRows(sql) {
  const output = runPostgresSql(`
    select coalesce(json_agg(row_to_json(result_row)), '[]'::json)
    from (${sql}) result_row
  `);
  return JSON.parse(output || '[]');
}

function sqlValue(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function ensureDatabaseReady() {
  const postgresStore = require('../src/repositories/postgresStore');
  postgresStore.initializeDatabase();
}

function cleanup(userId) {
  runPostgresSql(`
    delete from daily_study_task_items
    where plan_id in (select id from memory_plans where user_id = ${sqlValue(userId)});
    delete from daily_study_tasks
    where plan_id in (select id from memory_plans where user_id = ${sqlValue(userId)});
    delete from memory_plans where user_id = ${sqlValue(userId)};
    delete from users where id = ${sqlValue(userId)};
  `);
}

test('postgres adaptive migration consolidates duplicate pending units before creating the unique index', {
  skip: process.env.RUN_POSTGRES_ADAPTIVE_SCHEMA_MIGRATION_TEST !== '1',
  concurrency: false
}, () => {
  ensureDatabaseReady();
  const userId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const oldestTaskId = crypto.randomUUID();
  const newerTaskId = crypto.randomUUID();
  const oldestItemId = crypto.randomUUID();
  const newerItemId = crypto.randomUUID();

  try {
    const memoryUnitId = runPostgresSql('select id::text from memory_units order by created_at asc, id asc limit 1');
    assert.ok(memoryUnitId, 'seeded memory unit must exist for the migration gate');

    runPostgresSql(`drop index if exists ${PENDING_INDEX}`);
    runPostgresSql(`
      insert into users (id, nickname) values (${sqlValue(userId)}, 'Adaptive schema migration gate');
      insert into memory_plans (
        id, user_id, content_id, mode, title, start_date, total_days, current_day, state, daily_minutes
      ) values (
        ${sqlValue(planId)}, ${sqlValue(userId)}, ${sqlValue(POSTGRES_CONTENT_ID)},
        'scientific', 'Migration gate plan', '2026-07-10'::date, 14, 1, 'reviewing', 15
      );
      insert into daily_study_tasks (id, plan_id, task_date, status, created_at, updated_at) values
        (${sqlValue(oldestTaskId)}, ${sqlValue(planId)}, '2026-07-10'::date, 'pending', '2026-07-10T09:00:00.000Z', '2026-07-10T09:00:00.000Z'),
        (${sqlValue(newerTaskId)}, ${sqlValue(planId)}, '2026-07-11'::date, 'pending', '2026-07-11T08:00:00.000Z', '2026-07-11T08:00:00.000Z');
      insert into daily_study_task_items (
        id, task_id, plan_id, memory_unit_id, task_type, sort_order, status, result, created_at, updated_at
      ) values
        (${sqlValue(oldestItemId)}, ${sqlValue(oldestTaskId)}, ${sqlValue(planId)}, ${sqlValue(memoryUnitId)},
          'weak_review', 1, 'pending', '{"source":"weak"}'::jsonb, '2026-07-10T10:00:00.000Z', '2026-07-10T10:00:00.000Z'),
        (${sqlValue(newerItemId)}, ${sqlValue(newerTaskId)}, ${sqlValue(planId)}, ${sqlValue(memoryUnitId)},
          'due_review', 1, 'pending', '{"source":"due"}'::jsonb, '2026-07-09T08:00:00.000Z', '2026-07-09T08:00:00.000Z');
    `);

    ensureAdaptiveSchema(runPostgresSql);

    const itemsAfterFirstRun = queryRows(`
      select id::text as "id", task_type as "taskType", status, result
      from daily_study_task_items
      where id in (${sqlValue(oldestItemId)}, ${sqlValue(newerItemId)})
      order by id
    `);
    const tasksAfterFirstRun = queryRows(`
      select id::text as "id", status
      from daily_study_tasks
      where id in (${sqlValue(oldestTaskId)}, ${sqlValue(newerTaskId)})
      order by id
    `);

    assert.deepEqual(itemsAfterFirstRun, [
      { id: oldestItemId, taskType: 'weak_review', status: 'pending', result: { source: 'weak' } },
      {
        id: newerItemId,
        taskType: 'due_review',
        status: 'superseded',
        result: { source: 'due', migrationReason: MIGRATION_REASON }
      }
    ].sort((left, right) => left.id.localeCompare(right.id)));
    assert.deepEqual(tasksAfterFirstRun, [
      { id: oldestTaskId, status: 'pending' },
      { id: newerTaskId, status: 'completed' }
    ].sort((left, right) => left.id.localeCompare(right.id)));

    ensureAdaptiveSchema(runPostgresSql);
    assert.deepEqual(queryRows(`
      select id::text as "id", status, result
      from daily_study_task_items
      where id in (${sqlValue(oldestItemId)}, ${sqlValue(newerItemId)})
      order by id
    `), itemsAfterFirstRun.map(({ id, status, result }) => ({ id, status, result })));
    assert.equal(runPostgresSql(`select to_regclass('public.${PENDING_INDEX}')`), PENDING_INDEX);
    assert.throws(() => runPostgresSql(`
      insert into daily_study_task_items (
        task_id, plan_id, memory_unit_id, task_type, sort_order, status
      ) values (
        ${sqlValue(newerTaskId)}, ${sqlValue(planId)}, ${sqlValue(memoryUnitId)}, 'due_review', 2, 'pending'
      )
    `), (error) => String(error.stderr).includes(PENDING_INDEX));
  } finally {
    cleanup(userId);
    ensureAdaptiveSchema(runPostgresSql);
  }
});
