const { getBaseUrl, isBackendEnabled } = require('./api');
const { PRODUCTS } = require('./products');

function normalizeProduct(product = {}) {
  const price = Number(product.price);
  const originalPrice = Number(product.originalPrice);
  const stock = Number(product.stock);
  return {
    ...product,
    id: String(product.id || ''),
    title: String(product.title || ''),
    category: String(product.category || '其他'),
    tag: String(product.tag || '精选'),
    subtitle: String(product.subtitle || ''),
    description: String(product.description || ''),
    color: String(product.color || '#7E2A1C'),
    cover: String(product.cover || ''),
    price: Number.isFinite(price) ? price : 0,
    originalPrice: Number.isFinite(originalPrice) && originalPrice > 0 ? originalPrice : undefined,
    stock: Number.isFinite(stock) ? stock : 0,
    status: String(product.status || 'published'),
    isFeatured: Boolean(product.isFeatured),
    features: Array.isArray(product.features) ? product.features.map(String) : []
  };
}

function localCatalog(source, statusText) {
  return {
    products: PRODUCTS.map(normalizeProduct).filter((item) => item.status === 'published'),
    source,
    statusText
  };
}

function requestProducts() {
  return new Promise((resolve, reject) => {
    const timeout = 4500;
    let settled = false;
    const settle = (handler, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(guardTimer);
      handler(payload);
    };
    const guardTimer = setTimeout(() => {
      settle(reject, new Error('REQUEST_TIMEOUT /api/products'));
    }, timeout + 500);

    wx.request({
      url: `${getBaseUrl()}/api/products`,
      method: 'GET',
      timeout,
      data: {},
      header: {
        'Content-Type': 'application/json'
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const products = response.data && response.data.data;
          if (!Array.isArray(products)) {
            settle(reject, new Error('PRODUCT_CATALOG_INVALID'));
            return;
          }
          settle(resolve, products);
          return;
        }
        settle(reject, new Error(`HTTP ${response.statusCode}`));
      },
      fail(error) {
        settle(reject, error);
      }
    });
  });
}

function listShopProducts() {
  if (!isBackendEnabled()) {
    return Promise.resolve(localCatalog('local', '本地商品目录'));
  }

  return requestProducts()
    .then((products) => ({
      products: products.map(normalizeProduct).filter((item) => item.status === 'published'),
      source: 'backend',
      statusText: '已同步管理后台'
    }))
    .catch(() => localCatalog('fallback', '后台不可用，已显示本地商品'));
}

module.exports = {
  listShopProducts,
  normalizeProduct
};
