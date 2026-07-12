const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureAdaptiveSchema } = require('../src/repositories/adaptiveSchema');

function collectStatements() {
  const statements = [];
  ensureAdaptiveSchema((sql) => statements.push(sql));
  return statements;
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

test('adaptive schema creates every required table and plan column', () => {
  const statements = [];
  ensureAdaptiveSchema((sql) => statements.push(sql));
  const joined = statements.join('\n');

  for (const table of [
    'content_sections',
    'memory_units',
    'memory_item_states',
    'daily_study_tasks',
    'daily_study_task_items',
    'idempotency_records',
    'memory_assessments'
  ]) {
    assert.match(joined, new RegExp(`create table if not exists ${table}`));
  }

  for (const column of [
    'content_version_id',
    'scope_type',
    'scope_id',
    'target_days',
    'daily_minutes',
    'familiarity_level',
    'strategy',
    'expected_finish_date'
  ]) {
    assert.match(joined, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(joined, /alter column estimated_minutes type numeric\(6,1\)/);
});

test('adaptive schema includes the controller-supplemented state, task, and idempotency contract', () => {
  const statements = [];
  ensureAdaptiveSchema((sql) => statements.push(sql));
  const joined = statements.join('\n');

  for (const field of [
    'difficulty numeric(10,4) not null default 0',
    'stability numeric(10,4) not null default 0',
    'retrievability numeric(10,4) not null default 0',
    'cross_day_success_count int not null default 0',
    'sequence_range_label varchar(180)',
    'plan_id uuid references memory_plans(id)',
    'result jsonb',
    'idempotency_key varchar(180) not null',
    'response_payload jsonb not null'
  ]) {
    assert.match(joined, new RegExp(field.replace(/[()]/g, '\\$&')));
  }

  for (const contract of [
    'unique (plan_id, memory_unit_id)',
    'unique (plan_id, task_date)',
    'unique (task_id, sort_order)',
    'unique (user_id, idempotency_key)',
    'on memory_item_states(plan_id, due_at)',
    'on daily_study_tasks(plan_id, task_date)',
    'on daily_study_task_items(task_id, sort_order)',
    'on daily_study_task_items(plan_id, memory_unit_id)',
    "where plan_id is not null and task_type = 'new' and status = 'pending'",
    'unique (user_id, start_idempotency_key)',
    'on memory_assessments(user_id, completion_idempotency_key)',
    'where completion_idempotency_key is not null'
  ]) {
    assert.match(joined, new RegExp(contract.replace(/[()]/g, '\\$&')));
  }
});

test('adaptive runtime migrations are mirrored in the declarative schema', () => {
  const schemaSql = normalizeSql(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));

  for (const statement of collectStatements()) {
    assert.ok(
      schemaSql.includes(normalizeSql(statement)),
      `schema.sql is missing runtime migration: ${normalizeSql(statement)}`
    );
  }
});

test('postgres store imports and runs the adaptive schema during feature initialization', () => {
  const postgresStore = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'repositories', 'postgresStore.js'),
    'utf8'
  );
  const featureSchemaStart = postgresStore.indexOf('function ensureFeatureSchema()');
  const featureSchemaEnd = postgresStore.indexOf('\n}\n\nfunction todayDate', featureSchemaStart);

  assert.match(
    postgresStore,
    /const \{ ensureAdaptiveSchema \} = require\('\.\/adaptiveSchema'\);/
  );
  assert.ok(featureSchemaStart >= 0, 'ensureFeatureSchema must exist');
  assert.ok(featureSchemaEnd > featureSchemaStart, 'ensureFeatureSchema must have a bounded body');
  assert.match(
    postgresStore.slice(featureSchemaStart, featureSchemaEnd),
    /ensureAdaptiveSchema\(queryScalar\);/
  );
});

test('adaptive migrations are repeatable idempotent statements', () => {
  const firstRun = collectStatements();
  const secondRun = collectStatements();

  assert.deepEqual(secondRun, firstRun);
  for (const statement of firstRun) {
    const normalized = normalizeSql(statement);
    assert.match(normalized, /^(?:alter table|create table|create(?: unique)? index|update)\b/);
    const repeatableTypeMigration = normalized.includes('alter column estimated_minutes type numeric(6,1)');
    if (!normalized.startsWith('update ') && !repeatableTypeMigration) {
      assert.match(normalized, /\bif not exists\b/);
    }
  }
});
