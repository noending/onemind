import test from 'node:test';
import assert from 'node:assert/strict';

import { createAdminClient } from '../src/api/client.js';

test('admin client injects the token once and unwraps data', async () => {
  const calls = [];
  const client = createAdminClient({
    getToken: () => 'admin-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { ok: true } })
      };
    }
  });

  const result = await client.get('/api/admin/overview');

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer admin-token');
});

test('admin client clears the session exactly once on 401', async () => {
  let unauthorizedCount = 0;
  const client = createAdminClient({
    getToken: () => 'expired-token',
    onUnauthorized: () => {
      unauthorizedCount += 1;
    },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: '登录状态已失效' })
    })
  });

  await assert.rejects(() => client.get('/api/admin/session'), /登录状态已失效/);
  assert.equal(unauthorizedCount, 1);
});

test('admin client sends JSON payloads without duplicating headers', async () => {
  let captured;
  const client = createAdminClient({
    getToken: () => 'admin-token',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { id: 'content-1' } })
      };
    }
  });

  await client.put('/api/admin/contents/content-1', { title: '大悲咒' });

  assert.equal(captured.options.method, 'PUT');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.equal(captured.options.body, JSON.stringify({ title: '大悲咒' }));
});
