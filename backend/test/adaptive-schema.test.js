const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureAdaptiveSchema } = require('../src/repositories/adaptiveSchema');

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
    'idempotency_records'
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
    'on daily_study_task_items(task_id, sort_order)'
  ]) {
    assert.match(joined, new RegExp(contract.replace(/[()]/g, '\\$&')));
  }
});
