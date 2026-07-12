const store = require('../../src/repositories/postgresStore');

const payload = JSON.parse(process.argv[2] || '{}');

try {
  store.initializeDatabase();
  const result = store.saveNotificationSubscriptionResult(payload);
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: error.code || error.message,
    statusCode: error.statusCode || 500
  }));
  process.exitCode = 2;
}
