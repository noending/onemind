const SHOP_STATE_KEY = "oneMind.shop.state.v1";
const MAX_RECENT_VIEWS = 8;

function safeGetStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined || value === "" ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function safeSetStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    // Ignore local cache failures.
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function sortByTimeDesc(entries, timeKey) {
  return [...entries].sort((left, right) => {
    const leftTime = Date.parse(left[timeKey] || 0) || 0;
    const rightTime = Date.parse(right[timeKey] || 0) || 0;
    return rightTime - leftTime;
  });
}

function normalizeFavoriteEntries(entries) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map((item) => ({
      id: normalizeId(item && item.id),
      updatedAt: String(item && item.updatedAt ? item.updatedAt : "")
    }))
    .filter((item) => item.id)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function normalizeRecentViews(entries) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map((item) => ({
      id: normalizeId(item && item.id),
      viewedAt: String(item && item.viewedAt ? item.viewedAt : "")
    }))
    .filter((item) => item.id)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, MAX_RECENT_VIEWS);
}

function normalizeCartEntries(entries) {
  const merged = new Map();
  (Array.isArray(entries) ? entries : []).forEach((item) => {
    const id = normalizeId(item && item.id);
    if (!id) return;
    const current = merged.get(id) || { id, count: 0, updatedAt: "" };
    current.count += Math.max(0, Number(item && item.count) || 0);
    current.updatedAt = String((item && item.updatedAt) || current.updatedAt || "");
    merged.set(id, current);
  });
  return Array.from(merged.values())
    .map((item) => ({
      id: item.id,
      count: Math.max(0, Math.round(item.count || 0)),
      updatedAt: String(item.updatedAt || "")
    }))
    .filter((item) => item.id && item.count > 0);
}

function normalizeShopState(state) {
  const source = state && typeof state === "object" ? state : {};
  return {
    favoriteEntries: sortByTimeDesc(normalizeFavoriteEntries(source.favoriteEntries), "updatedAt"),
    recentViews: sortByTimeDesc(normalizeRecentViews(source.recentViews), "viewedAt"),
    cartEntries: sortByTimeDesc(normalizeCartEntries(source.cartEntries), "updatedAt")
  };
}

function getShopState() {
  return normalizeShopState(safeGetStorage(SHOP_STATE_KEY, {}));
}

function saveShopState(state) {
  const normalized = normalizeShopState(state);
  safeSetStorage(SHOP_STATE_KEY, normalized);
  return normalized;
}

function toggleFavoriteProduct(id) {
  const productId = normalizeId(id);
  const state = getShopState();
  if (!productId) return state;

  const exists = state.favoriteEntries.some((item) => item.id === productId);
  const nextFavorites = exists
    ? state.favoriteEntries.filter((item) => item.id !== productId)
    : [{ id: productId, updatedAt: nowIso() }, ...state.favoriteEntries];

  return saveShopState({
    ...state,
    favoriteEntries: nextFavorites
  });
}

function recordRecentViewProduct(id) {
  const productId = normalizeId(id);
  const state = getShopState();
  if (!productId) return state;

  const nextRecentViews = [
    { id: productId, viewedAt: nowIso() },
    ...state.recentViews.filter((item) => item.id !== productId)
  ].slice(0, MAX_RECENT_VIEWS);

  return saveShopState({
    ...state,
    recentViews: nextRecentViews
  });
}

function addProductToCart(id) {
  const productId = normalizeId(id);
  const state = getShopState();
  if (!productId) return state;

  const nextCartEntries = [...state.cartEntries];
  const current = nextCartEntries.find((item) => item.id === productId);
  if (current) {
    current.count += 1;
    current.updatedAt = nowIso();
  } else {
    nextCartEntries.unshift({
      id: productId,
      count: 1,
      updatedAt: nowIso()
    });
  }

  return saveShopState({
    ...state,
    cartEntries: nextCartEntries
  });
}

module.exports = {
  getShopState,
  toggleFavoriteProduct,
  recordRecentViewProduct,
  addProductToCart
};
