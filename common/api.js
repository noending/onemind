const { contents: localContents, festivals: localFestivals } = require("./content");

const API_ENABLED_KEY = "oneMind.api.enabled";
const API_BASE_URL_KEY = "oneMind.api.baseUrl";
const API_CACHE_KEY = "oneMind.api.contents.cache";
const API_STATUS_KEY = "oneMind.api.status";
const AUTH_TOKEN_KEY = "oneMind.auth.token";
const AUTH_USER_KEY = "oneMind.auth.user";

const DEFAULT_BASE_URL = "http://127.0.0.1:8787";

const TYPE_CATEGORY = {
  mantra: "短咒",
  verse: "短偈",
  sutra_segment: "经文片段",
  ritual: "仪轨片段",
  teaching: "上师开示"
};

const LENGTH_LABEL = {
  short: "长度 短",
  medium: "长度 中",
  long: "长度 长"
};

function splitBodyToSegments(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return [];

  const byLine = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;

  const byPunctuation = text
    .split(/[。！？；;，,、：:]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (byPunctuation.length > 1) return byPunctuation;

  const byWhitespace = text.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  if (byWhitespace.length > 1) return byWhitespace;

  if (text.length <= 10) return [text];

  const chunks = [];
  for (let index = 0; index < text.length; index += 8) {
    chunks.push(text.slice(index, index + 8));
  }
  return chunks.filter(Boolean);
}

function safeGetStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === "" || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function safeSetStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    // Storage failure should not block the memorization flow.
  }
}

function isBackendEnabled() {
  return Boolean(safeGetStorage(API_ENABLED_KEY, false));
}

function setBackendEnabled(enabled) {
  safeSetStorage(API_ENABLED_KEY, Boolean(enabled));
}

function getBaseUrl() {
  return safeGetStorage(API_BASE_URL_KEY, DEFAULT_BASE_URL);
}

function setBaseUrl(url) {
  safeSetStorage(API_BASE_URL_KEY, url || DEFAULT_BASE_URL);
}

function getApiStatus() {
  return safeGetStorage(API_STATUS_KEY, {
    source: "local",
    statusText: "本地演示数据",
    checkedAt: ""
  });
}

function setApiStatus(status) {
  const nextStatus = {
    source: status.source || "local",
    statusText: status.statusText || "本地演示数据",
    checkedAt: new Date().toISOString()
  };
  safeSetStorage(API_STATUS_KEY, nextStatus);
  return nextStatus;
}

function request(path, options = {}) {
  const authToken = options.skipAuth ? "" : getAuthToken();
  const timeout = Number(options.timeout || 4500);
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (handler, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(guardTimer);
      handler(payload);
    };

    const guardTimer = setTimeout(() => {
      settle(reject, new Error(`REQUEST_TIMEOUT ${path}`));
    }, timeout + 500);

    wx.request({
      url: `${getBaseUrl()}${path}`,
      method: options.method || "GET",
      timeout,
      data: options.data || {},
      header: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.header || {})
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          settle(resolve, response.data);
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

function getAuthToken() {
  return String(safeGetStorage(AUTH_TOKEN_KEY, "") || "");
}

function getAuthUser() {
  return safeGetStorage(AUTH_USER_KEY, null);
}

function clearAuthSession() {
  safeSetStorage(AUTH_TOKEN_KEY, "");
  safeSetStorage(AUTH_USER_KEY, null);
}

function saveAuthSession(token, user) {
  safeSetStorage(AUTH_TOKEN_KEY, token || "");
  safeSetStorage(AUTH_USER_KEY, user || null);
}

function loginWithWechat(userInfo = {}) {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (result) => {
        const code = result && result.code;
        if (!code) {
          reject(new Error("微信登录失败，请重试"));
          return;
        }

        request("/api/auth/wechat/login", {
          method: "POST",
          skipAuth: true,
          data: {
            code,
            platform: "wechat",
            userInfo: userInfo || {}
          }
        })
          .then((response) => {
            const data = response.data || {};
            saveAuthSession(data.token || "", data.user || null);
            resolve(data);
          })
          .catch(reject);
      },
      fail: () => reject(new Error("无法调用微信登录接口"))
    });
  });
}

function getCurrentUser() {
  const token = getAuthToken();
  if (!token) {
    return Promise.resolve({
      loggedIn: false,
      token: "",
      user: null
    });
  }

  return request("/api/auth/me")
    .then((response) => {
      const user = response.data || null;
      if (!user) {
        clearAuthSession();
        return { loggedIn: false, token: "", user: null };
      }
      saveAuthSession(token, user);
      return {
        loggedIn: true,
        token,
        user
      };
    })
    .catch(() => {
      const cachedUser = getAuthUser();
      if (cachedUser) {
        return {
          loggedIn: true,
          token,
          user: cachedUser
        };
      }
      clearAuthSession();
      return {
        loggedIn: false,
        token: "",
        user: null
      };
    });
}

function normalizeContent(item) {
  const category = item.category || TYPE_CATEGORY[item.type] || "经文片段";
  const lengthTier = item.lengthTier || item.length_tier || "short";
  const planDays = Number(item.planDays || item.plan_days || 1);
  const segments = Array.isArray(item.segments) && item.segments.length
    ? item.segments
    : splitBodyToSegments(item.body || item.preview || "");
  const pinyinSegments = Array.isArray(item.pinyinSegments) && item.pinyinSegments.length
    ? item.pinyinSegments
    : [];

  return {
    id: item.id,
    title: item.title,
    category,
    body: item.body || item.preview || "",
    preview: item.preview || item.body || "",
    segments,
    pinyinSegments,
    lengthTier,
    lengthLevel: lengthTier,
    planDays,
    lengthLabel: item.lengthLabel || LENGTH_LABEL[lengthTier] || "长度 短",
    dayText: `约 ${planDays} 天背会`,
    festival: item.festival,
    festivalTag: item.festivalTag,
    scene: item.scene || "按计划修持",
    hasAudio: Boolean(item.hasAudio),
    accessLevel: item.accessLevel || item.access_level || "public",
    defaultMode: item.defaultMode || "scientific",
    supportedModes: Array.isArray(item.supportedModes) && item.supportedModes.length
      ? item.supportedModes
      : ["scientific", "playful"],
    supportsRecitation: item.supportsRecitation !== false,
    recommendedRecitationTime: item.recommendedRecitationTime || "",
    recitationTheme: item.recitationTheme || ""
  };
}

function normalizeFestival(item) {
  const date = item.lunarDate || item.date || item.solarDate || "";
  const deity = item.relatedFigure || item.deity || "";
  const recommendedContents = Array.isArray(item.recommendedContents)
    ? item.recommendedContents.map(normalizeContent)
    : (Array.isArray(item.contentIds)
      ? item.contentIds.map((contentId) => {
        const content = getLocalContents().find((entry) => entry.id === contentId);
        return content || null;
      }).filter(Boolean)
      : []);

  return {
    id: item.id,
    name: item.name || "",
    date,
    deity,
    reason: item.reason || item.description || "",
    recommendedContents
  };
}

function getLocalContents() {
  return localContents.map(normalizeContent);
}

function getCachedContents() {
  const cached = safeGetStorage(API_CACHE_KEY, []);
  return Array.isArray(cached) ? cached.map(normalizeContent) : [];
}

function findCachedContent(id) {
  return getCachedContents().find((item) => item.id === id);
}

function listContents() {
  if (!isBackendEnabled()) {
    return Promise.resolve({
      contents: getLocalContents(),
      source: "local",
      status: setApiStatus({
        source: "local",
        statusText: "本地演示数据"
      })
    });
  }

  return request("/api/contents")
    .then((response) => {
      const contents = (response.data || []).map(normalizeContent);
      safeSetStorage(API_CACHE_KEY, contents);
      return {
        contents,
        source: "backend",
        status: setApiStatus({
          source: "backend",
          statusText: "后台已连接"
        })
      };
    })
    .catch(() => {
      const cached = getCachedContents();
      return {
        contents: cached.length ? cached : getLocalContents(),
        source: cached.length ? "cache" : "fallback",
        status: setApiStatus({
          source: cached.length ? "cache" : "fallback",
          statusText: cached.length ? "后台不可用，使用缓存" : "后台不可用，回退本地"
        })
      };
    });
}

function listFestivals() {
  if (!isBackendEnabled()) {
    return Promise.resolve({
      festivals: localFestivals.map(normalizeFestival),
      source: "local"
    });
  }

  return request("/api/festivals")
    .then((response) => ({
      festivals: (response.data || []).map(normalizeFestival),
      source: "backend"
    }))
    .catch(() => ({
      festivals: localFestivals.map(normalizeFestival),
      source: "fallback"
    }));
}

function healthCheck() {
  if (!isBackendEnabled()) {
    return Promise.resolve(setApiStatus({
      source: "local",
      statusText: "本地演示数据"
    }));
  }

  return request("/health")
    .then(() => setApiStatus({
      source: "backend",
      statusText: "后台已连接"
    }))
    .catch(() => setApiStatus({
      source: "fallback",
      statusText: "后台不可用，回退本地"
    }));
}

function listMemoryPlansApi(userId) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request(`/api/memory-plans${query}`).then((response) => response.data || []);
}

function createMemoryPlanApi(payload = {}) {
  return request("/api/memory-plans", {
    method: "POST",
    data: payload
  }).then((response) => response.data || null);
}

function completeReviewTaskApi(taskId, result, extra = {}) {
  return request(`/api/review-tasks/${encodeURIComponent(taskId)}/complete`, {
    method: "POST",
    data: {
      result,
      selfRating: extra.selfRating || "",
      latencyBand: extra.latencyBand || "",
      mistakeCount: extra.mistakeCount || 0,
      note: extra.note || ""
    }
  }).then((response) => response.data || null);
}

function getNotificationSettingsApi() {
  return request("/api/notification-settings").then((response) => response.data || []);
}

function updateNotificationSettingApi(payload = {}) {
  return request("/api/notification-settings", {
    method: "PUT",
    data: payload
  }).then((response) => response.data || null);
}

function createNotificationJobApi(payload = {}) {
  return request("/api/notification-jobs", {
    method: "POST",
    data: payload
  }).then((response) => response.data || null);
}

function listNotificationJobsApi(limit) {
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  return request(`/api/notification-jobs${query}`).then((response) => response.data || []);
}

function listTodayFocusApi(userId) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request(`/api/today-focus${query}`).then((response) => response.data || null);
}

function getGrowthOverviewApi(userId) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request(`/api/growth-overview${query}`).then((response) => response.data || null);
}

function listRecitationGoalsApi(userId) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request(`/api/recitation-goals${query}`).then((response) => response.data || []);
}

function upsertRecitationGoalApi(contentId, payload = {}) {
  return request(`/api/recitation-goals/${encodeURIComponent(contentId)}`, {
    method: "PUT",
    data: payload
  }).then((response) => response.data || null);
}

function createRecitationSessionApi(payload = {}) {
  return request("/api/recitation-sessions", {
    method: "POST",
    data: payload
  }).then((response) => response.data || null);
}

module.exports = {
  DEFAULT_BASE_URL,
  findCachedContent,
  getCachedContents,
  getApiStatus,
  getBaseUrl,
  getLocalContents,
  healthCheck,
  clearAuthSession,
  getCurrentUser,
  getAuthToken,
  isBackendEnabled,
  loginWithWechat,
  listMemoryPlansApi,
  createMemoryPlanApi,
  createNotificationJobApi,
  createRecitationSessionApi,
  completeReviewTaskApi,
  getGrowthOverviewApi,
  getNotificationSettingsApi,
  listNotificationJobsApi,
  listRecitationGoalsApi,
  listContents,
  listFestivals,
  listTodayFocusApi,
  normalizeContent,
  normalizeFestival,
  getAuthUser,
  setBackendEnabled,
  setBaseUrl,
  upsertRecitationGoalApi,
  updateNotificationSettingApi
};
