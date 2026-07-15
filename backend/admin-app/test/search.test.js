import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminSearchIndex, searchAdminIndex } from '../src/app/search.js';

test('global search index covers content, users, products and orders with real routes', () => {
  const index = buildAdminSearchIndex({
    contents: [{ id: 'content-1', title: '大悲咒', type: 'sutra_segment' }],
    users: [{ id: 'user-1', nickname: '清风明月' }],
    products: [{ id: 'product-1', title: '观音法门 · 音频合辑', category: '经文音频' }],
    orders: [{ id: 'order-1', orderNo: 'OM202607150001', userNickname: '清风明月' }]
  });

  assert.deepEqual(index.map(({ route, title }) => ({ route, title })), [
    { route: 'contents', title: '大悲咒' },
    { route: 'users', title: '清风明月' },
    { route: 'products', title: '观音法门 · 音频合辑' },
    { route: 'orders', title: 'OM202607150001' }
  ]);
});

test('global search matches title and metadata case-insensitively and respects the limit', () => {
  const index = buildAdminSearchIndex({
    contents: [
      { id: 'content-1', title: '大悲咒', type: 'sutra_segment' },
      { id: 'content-2', title: '心经', type: 'sutra_segment' }
    ],
    products: [{ id: 'product-1', title: '观音音频', category: '经文音频' }],
    orders: [{ id: 'order-1', orderNo: 'OM-001', userNickname: 'Liam' }]
  });

  assert.equal(searchAdminIndex(index, '音频', 1)[0].route, 'products');
  assert.equal(searchAdminIndex(index, 'liam')[0].route, 'orders');
  assert.equal(searchAdminIndex(index, '经文', 2).length, 1);
  assert.deepEqual(searchAdminIndex(index, '   '), []);
});
