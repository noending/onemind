import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchAdminData,
  getRouteDataKeys,
  SEARCH_DATA_KEYS
} from '../src/app/data-loading.js';

test('route data keys keep direct pages lazy while overview gets only its dependencies', () => {
  assert.deepEqual(getRouteDataKeys('overview'), [
    'overview',
    'contents',
    'plans',
    'orders',
    'notifications'
  ]);
  assert.deepEqual(getRouteDataKeys('products'), ['products']);
  assert.deepEqual(getRouteDataKeys('settings'), ['health']);
  assert.deepEqual(SEARCH_DATA_KEYS, ['contents', 'users', 'products', 'orders']);
});

test('data fetcher de-duplicates keys and preserves endpoint-specific query options', async () => {
  const calls = [];
  const client = {
    get: async (path, options = {}) => {
      calls.push({ path, options });
      return [{ id: path }];
    }
  };

  const result = await fetchAdminData({
    client,
    keys: ['products', 'notifications', 'products']
  });

  assert.deepEqual(calls, [
    { path: '/api/admin/products', options: {} },
    { path: '/api/admin/notification-jobs', options: { query: { limit: 50 } } }
  ]);
  assert.deepEqual(result.loadedKeys, ['products', 'notifications']);
  assert.equal(result.failures.length, 0);
});
