const test = require('node:test');
const assert = require('node:assert/strict');

const memoryStore = require('../src/repositories/memoryStore');
const storeModulePath = require.resolve('../src/repositories/store');
require.cache[storeModulePath] = {
  id: storeModulePath,
  filename: storeModulePath,
  loaded: true,
  exports: { ...memoryStore, getStoreMode: () => 'memory' }
};
delete require.cache[require.resolve('../src/routes')];
const { handleRequest } = require('../src/routes');

function request({ method = 'GET', pathname, headers = {}, payload }) {
  return new Promise((resolve) => {
    const response = {
      writeHead(statusCode, responseHeaders) {
        this.statusCode = statusCode;
        this.headers = responseHeaders;
      },
      end(body) {
        resolve({ statusCode: this.statusCode, headers: this.headers, body: body ? JSON.parse(body) : null });
      }
    };
    handleRequest({ method, url: pathname, headers }, response, payload === undefined ? '' : JSON.stringify(payload))
      .catch((error) => resolve({ statusCode: error.statusCode || 500, body: { error: error.message } }));
  });
}

async function adminHeaders() {
  const response = await request({
    method: 'POST',
    pathname: '/api/admin/login',
    payload: { username: 'magic', password: 'Noending5@' }
  });
  assert.equal(response.statusCode, 200);
  return { authorization: `Bearer ${response.body.data.token}` };
}

test('admin learning pages expose user, plan, practice and recitation read models', async () => {
  const headers = await adminHeaders();
  const paths = [
    '/api/admin/users',
    '/api/admin/plans',
    '/api/admin/practice-sessions',
    '/api/admin/recitation-sessions'
  ];

  for (const pathname of paths) {
    const response = await request({ pathname, headers });
    assert.equal(response.statusCode, 200, pathname);
    assert.ok(Array.isArray(response.body.data), pathname);
  }

  const users = await request({ pathname: '/api/admin/users', headers });
  assert.ok(users.body.data.some((item) => item.id && item.nickname));
});

test('public products and authenticated commerce modules share one catalog', async () => {
  const publicCatalog = await request({ pathname: '/api/products?category=经文音频' });
  assert.equal(publicCatalog.statusCode, 200);
  assert.ok(publicCatalog.body.data.length > 0);
  assert.ok(publicCatalog.body.data.every((item) => item.category === '经文音频'));

  const headers = await adminHeaders();
  const adminCatalog = await request({ pathname: '/api/admin/products', headers });
  assert.equal(adminCatalog.statusCode, 200);
  assert.ok(adminCatalog.body.data.length >= publicCatalog.body.data.length);

  const created = await request({
    method: 'POST',
    pathname: '/api/admin/products',
    headers,
    payload: {
      category: '图鉴',
      tag: '测试',
      title: '后台新增修持图鉴',
      subtitle: '契约测试商品',
      price: 19.9,
      stock: 8,
      status: 'draft'
    }
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.data.title, '后台新增修持图鉴');

  const updated = await request({
    method: 'PUT',
    pathname: `/api/admin/products/${encodeURIComponent(created.body.data.id)}`,
    headers,
    payload: { status: 'published', price: 16 }
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.data.status, 'published');
  assert.equal(updated.body.data.price, 16);

  const archived = await request({
    method: 'DELETE',
    pathname: `/api/admin/products/${encodeURIComponent(created.body.data.id)}`,
    headers
  });
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.body.data.status, 'archived');

  const archivedCatalog = await request({ pathname: '/api/admin/products?status=archived', headers });
  assert.ok(archivedCatalog.body.data.some((item) => item.id === created.body.data.id));
  const publicAfterArchive = await request({ pathname: '/api/products' });
  assert.equal(publicAfterArchive.body.data.some((item) => item.id === created.body.data.id), false);
});

test('admin orders expose and update real order and payment status fields', async () => {
  const headers = await adminHeaders();
  const orders = await request({ pathname: '/api/admin/orders', headers });
  assert.equal(orders.statusCode, 200);
  assert.ok(orders.body.data.length > 0);
  const order = orders.body.data[0];
  assert.ok(order.orderNo);
  assert.ok(order.status);
  assert.ok(order.paymentStatus);

  const updated = await request({
    method: 'PUT',
    pathname: `/api/admin/orders/${encodeURIComponent(order.id)}/status`,
    headers,
    payload: { status: 'processing' }
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.data.status, 'processing');
  assert.equal(updated.body.data.paymentStatus, order.paymentStatus);
});
