const {
  addProductToCart,
  getShopState,
  recordRecentViewProduct,
  toggleFavoriteProduct
} = require("../../common/shop");
const { listShopProducts } = require("../../common/commerce-api");
const { PRODUCTS } = require("../../common/products");

function favoriteIdsFromState(state) {
  return (state && Array.isArray(state.favoriteEntries) ? state.favoriteEntries : [])
    .map((item) => item.id)
    .filter(Boolean);
}

function favoriteSetFromState(state) {
  return new Set(favoriteIdsFromState(state));
}

function cartCountFromState(state) {
  return (state && Array.isArray(state.cartEntries) ? state.cartEntries : [])
    .reduce((total, item) => total + Math.max(0, Number(item && item.count) || 0), 0);
}

function formatRecordTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function findProduct(products, id) {
  return (Array.isArray(products) ? products : []).find((item) => item.id === id) || null;
}

function buildRecentViewProducts(products, state, favoriteSet) {
  const recentViews = Array.isArray(state && state.recentViews) ? state.recentViews : [];
  return recentViews
    .map((entry) => {
      const product = findProduct(products, entry.id);
      if (!product) return null;
      return {
        id: product.id,
        title: product.title,
        tag: product.tag,
        isFavorite: favoriteSet.has(product.id),
        viewedAtText: formatRecordTime(entry.viewedAt)
      };
    })
    .filter(Boolean);
}

function buildPreferencePanel(products, state, favoriteSet) {
  const cartEntries = Array.isArray(state && state.cartEntries) ? state.cartEntries : [];
  if (cartEntries.length) {
    return {
      title: "意向记录",
      sourceText: "来自真实加购记录，重启后仍会保留。",
      records: cartEntries
        .map((entry) => {
          const product = findProduct(products, entry.id);
          if (!product) return null;
          return {
            id: product.id,
            title: product.title,
            kicker: "意向单",
            meta: `已加购 ${entry.count} 次 · 最近 ${formatRecordTime(entry.updatedAt) || "刚刚"}`,
            accent: `¥${product.price}`,
            accentTone: "cart"
          };
        })
        .filter(Boolean)
    };
  }

  const recentViews = Array.isArray(state && state.recentViews) ? state.recentViews : [];
  if (recentViews.length) {
    return {
      title: "最近浏览",
      sourceText: "来自真实浏览记录，方便你继续接着看。",
      records: recentViews
        .map((entry) => {
          const product = findProduct(products, entry.id);
          if (!product) return null;
          return {
            id: product.id,
            title: product.title,
            kicker: "最近看过",
            meta: `${product.category} · ${formatRecordTime(entry.viewedAt) || "刚刚"}`,
            accent: favoriteSet.has(product.id) ? "已收藏" : "可继续看看",
            accentTone: favoriteSet.has(product.id) ? "favorite" : "muted"
          };
        })
        .filter(Boolean)
    };
  }

  const favorites = Array.isArray(state && state.favoriteEntries) ? state.favoriteEntries : [];
  if (favorites.length) {
    return {
      title: "收藏记录",
      sourceText: "来自真实收藏记录，后续会优先帮你记住这些偏好。",
      records: favorites
        .map((entry) => {
          const product = findProduct(products, entry.id);
          if (!product) return null;
          return {
            id: product.id,
            title: product.title,
            kicker: "已收藏",
            meta: `${product.category} · ${formatRecordTime(entry.updatedAt) || "刚刚"}`,
            accent: `¥${product.price}`,
            accentTone: "favorite"
          };
        })
        .filter(Boolean)
    };
  }

  return {
    title: "意向记录",
    sourceText: "开始收藏、浏览或加购一件内容后，这里就会显示真实偏好轨迹。",
    records: []
  };
}

function buildShopStats(state) {
  const favoriteCount = favoriteIdsFromState(state).length;
  const recentViewCount = Array.isArray(state && state.recentViews) ? state.recentViews.length : 0;
  const cartCount = cartCountFromState(state);
  return [
    { key: "favorite", label: "收藏", value: favoriteCount, desc: "会保留" },
    { key: "recent", label: "最近看过", value: recentViewCount, desc: "有痕迹" },
    { key: "cart", label: "加购", value: cartCount, desc: "成意向" }
  ];
}

Page({
  data: {
    categories: ["经文音频", "唐卡 · 壁纸", "图鉴", "收藏"],
    activeCategory: "经文音频",
    products: PRODUCTS,
    productSourceText: "正在同步商品目录",
    visibleProducts: [],
    featuredProduct: null,
    favorites: [],
    cartCount: 0,
    selectedProduct: null,
    shopStats: [],
    recentViewProducts: [],
    preferencePanel: {
      title: "意向记录",
      sourceText: "",
      records: []
    }
  },

  onShow() {
    this.refreshProducts();
    this.loadProductCatalog();
  },

  onUnload() {
    this._catalogRequestId = (this._catalogRequestId || 0) + 1;
  },

  loadProductCatalog() {
    const requestId = (this._catalogRequestId || 0) + 1;
    this._catalogRequestId = requestId;
    return listShopProducts().then((result) => {
      if (this._catalogRequestId !== requestId) return result;
      this.setData({
        products: result.products,
        productSourceText: result.statusText
      }, () => this.refreshProducts(this._shopState || getShopState()));
      return result;
    });
  },

  switchTab(event) {
    const activeCategory = event.currentTarget.dataset.tab;
    this.setData({ activeCategory }, () => this.refreshProducts(this._shopState || getShopState()));
  },

  toggleFavorite(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    this.refreshProducts(toggleFavoriteProduct(id));
  },

  openProduct(event) {
    const id = event.currentTarget.dataset.id;
    if (!findProduct(this.data.products, id)) return;
    this.refreshProducts(recordRecentViewProduct(id), id);
  },

  closeProduct() {
    this.setData({ selectedProduct: null });
  },

  noop() {},

  addToCart() {
    const product = this.data.selectedProduct;
    if (!product || !product.id) return;
    this.refreshProducts(addProductToCart(product.id));
    this.closeProduct();
    if (product && product.title) {
      wx.showToast({
        title: `已加入：${product.title}`,
        icon: "none"
      });
    }
  },

  refreshProducts(shopState = getShopState(), selectedProductId) {
    this._shopState = shopState;
    const active = this.data.activeCategory;
    const all = Array.isArray(this.data.products) ? this.data.products : [];
    const favoriteSet = favoriteSetFromState(shopState);
    const favorites = Array.from(favoriteSet);
    const featuredProduct = all.find((item) => item.isFeatured) || null;
    const selectedId = selectedProductId !== undefined
      ? selectedProductId
      : (this.data.selectedProduct && this.data.selectedProduct.id);
    const visibleProducts = (active === "收藏"
      ? all.filter((item) => favoriteSet.has(item.id))
      : all.filter((item) => item.category === active && !item.isFeatured)
    ).map((item) => ({
      ...item,
      isFavorite: favoriteSet.has(item.id)
    }));
    const selectedBase = selectedId ? findProduct(all, selectedId) : null;
    const selectedProduct = selectedBase ? {
      ...selectedBase,
      isFavorite: favoriteSet.has(selectedBase.id)
    } : null;

    this.setData({
      visibleProducts,
      featuredProduct,
      favorites,
      cartCount: cartCountFromState(shopState),
      selectedProduct,
      shopStats: buildShopStats(shopState),
      recentViewProducts: buildRecentViewProducts(all, shopState, favoriteSet),
      preferencePanel: buildPreferencePanel(all, shopState, favoriteSet)
    });
  }
});
