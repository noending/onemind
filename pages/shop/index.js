const {
  addProductToCart,
  getShopState,
  recordRecentViewProduct,
  toggleFavoriteProduct
} = require("../../common/shop");

const PRODUCTS = [
  {
    id: "prod1",
    category: "经文音频",
    tag: "本月精选",
    title: "观音法门 · 音频合辑",
    subtitle: "三段经咒 + 一段唱诵导读 + 同步训练",
    price: 9.9,
    originalPrice: 28,
    isFeatured: true,
    color: "#7E2A1C",
    cover: "/assets/music-heart.jpg",
    description: "精选观音法门三段核心经咒，搭配法师导读与节奏提示，适合与每日记忆计划共同修持。",
    features: ["大悲咒完整版", "六字大明咒循环版", "法师导读"]
  },
  {
    id: "prod2",
    category: "经文音频",
    tag: "新品",
    title: "心经 · 梵唱合集",
    subtitle: "山月禅 · 28 分钟 · 高保真",
    price: 18,
    color: "#A37049",
    cover: "/assets/music-mantra.jpg",
    description: "梵唱版本适合晨课与静坐，让经文进入更稳定的日常节律。",
    features: ["完整梵唱", "晨课版", "静坐版"]
  },
  {
    id: "prod3",
    category: "经文音频",
    tag: "热销",
    title: "六字大明咒 · 唱诵冥想",
    subtitle: "自然环境音 · 15 分钟循环",
    price: 12,
    color: "#7E2A1C",
    cover: "/assets/music-guqin.jpg",
    description: "更轻松的循环唱诵版本，适合通勤、短时静坐与睡前放松。",
    features: ["15分钟循环", "环境音底噪", "适合睡前"]
  },
  {
    id: "prod4",
    category: "经文音频",
    tag: "精选",
    title: "药师琉璃 · 静心三十分",
    subtitle: "助眠 · 病中 · 回向",
    price: 36,
    color: "#5E7A4F",
    cover: "/assets/music-heart.jpg",
    description: "药师法门静心合集，适合晚间安神、病中回向和日常稳心。",
    features: ["药师心咒", "静心导引", "助眠版节律"]
  },
  {
    id: "prod5",
    category: "唐卡 · 壁纸",
    tag: "壁纸",
    title: "唐卡 · 观音慈悲",
    subtitle: "单图 · 4K",
    price: 6,
    color: "#5E7A4F",
    cover: "/assets/thangka-medicine.jpg",
    description: "观音主题高清唐卡数字图，适合作为锁屏与日常观修视觉锚点。",
    features: ["单图精选", "4K 高清", "可长期保存"]
  },
  {
    id: "prod6",
    category: "唐卡 · 壁纸",
    tag: "壁纸",
    title: "唐卡 · 度母系列（4 张）",
    subtitle: "高清壁纸 · 适配锁屏 / 桌面",
    price: 9.9,
    color: "#8B5A1E",
    cover: "/assets/thangka-tara.jpg",
    description: "精选度母主题数字壁纸，适配手机和平板，作为日常观修陪伴。",
    features: ["4K 分辨率", "4 张主题", "多设备适配"]
  },
  {
    id: "prod7",
    category: "图鉴",
    tag: "图鉴",
    title: "佛菩萨圣诞日历",
    subtitle: "一年节日 · 推荐经咒",
    price: 12,
    color: "#A37049",
    cover: "/assets/thangka-mandala.jpg",
    description: "全年节日与推荐经咒整理，帮助建立稳定读诵与节日修持节奏。",
    features: ["全年日历", "节日提醒", "推荐经咒"]
  },
  {
    id: "prod8",
    category: "图鉴",
    tag: "图鉴",
    title: "修持仪轨入门图鉴",
    subtitle: "早晚课次第 · 可打印版",
    price: 16,
    color: "#8B5A1E",
    cover: "/assets/thangka-mandala.jpg",
    description: "将常见修持次第与供养动作整理为可随时翻看的图鉴，降低初学门槛。",
    features: ["早晚课次第", "供养动作示意", "可打印版"]
  }
];

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
