const test = require('node:test');
const assert = require('node:assert/strict');

function loadCommerceApi({ backendEnabled = true, requestHandler } = {}) {
  const storage = new Map();
  storage.set('oneMind.api.enabled', backendEnabled);
  storage.set('oneMind.api.baseUrl', 'https://api.example.test');
  const requests = [];

  global.wx = {
    getStorageSync(key) {
      return storage.get(key);
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    request(options) {
      requests.push(options);
      if (requestHandler) {
        requestHandler(options);
        return;
      }
      options.success({
        statusCode: 200,
        data: {
          data: [{
            id: 'server-product',
            title: '服务端商品',
            category: '经文音频',
            price: '12.50',
            status: 'published',
            features: ['同步内容']
          }]
        }
      });
    }
  };

  delete require.cache[require.resolve('../../common/api')];
  delete require.cache[require.resolve('../../common/commerce-api')];
  return {
    commerceApi: require('../../common/commerce-api'),
    requests
  };
}

test('shop catalog uses the public backend product source when available', async () => {
  const { commerceApi, requests } = loadCommerceApi();

  const result = await commerceApi.listShopProducts();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.example.test/api/products');
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].header.Authorization, undefined);
  assert.equal(result.source, 'backend');
  assert.equal(result.products[0].id, 'server-product');
  assert.equal(result.products[0].price, 12.5);
});

test('shop catalog explicitly falls back to shared local products on a network failure', async () => {
  const { commerceApi } = loadCommerceApi({
    requestHandler(options) {
      options.fail({ errMsg: 'request:fail timeout' });
    }
  });

  const result = await commerceApi.listShopProducts();

  assert.equal(result.source, 'fallback');
  assert.match(result.statusText, /本地/);
  assert.ok(result.products.length >= 8);
  assert.ok(result.products.every((item) => item.status === 'published'));
});

test('shop catalog stays local without making a request when backend is disabled', async () => {
  const { commerceApi, requests } = loadCommerceApi({ backendEnabled: false });

  const result = await commerceApi.listShopProducts();

  assert.equal(requests.length, 0);
  assert.equal(result.source, 'local');
  assert.match(result.statusText, /本地/);
});
