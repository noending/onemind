const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function normalizeSql(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

test('notification runtime migration is present in schema.sql and wired into postgres initialization', () => {
  let schemaModule = null;
  try {
    schemaModule = require('../src/repositories/notificationSchema');
  } catch (error) {
    schemaModule = null;
  }
  assert.ok(schemaModule, 'notificationSchema runtime migration must exist');

  const schemaSql = normalizeSql(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
  for (const statement of schemaModule.NOTIFICATION_SCHEMA_STATEMENTS) {
    assert.ok(
      schemaSql.includes(normalizeSql(statement)),
      `schema.sql is missing runtime migration: ${normalizeSql(statement)}`
    );
  }

  const postgresSource = fs.readFileSync(path.join(__dirname, '..', 'src/repositories/postgresStore.js'), 'utf8');
  assert.match(postgresSource, /ensureNotificationSchema\(queryScalar\)/);
  assert.match(schemaSql, /provider_attempt_count int not null default 0/);
});
