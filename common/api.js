const { contents: localContents, festivals: localFestivals } = require("./content");

const API_ENABLED_KEY = "oneMind.api.enabled";
const API_BASE_URL_KEY = "oneMind.api.baseUrl";
const API_CACHE_KEY = "oneMind.api.contents.cache";
const API_STATUS_KEY = "oneMind.api.status";
const AUTH_TOKEN_KEY = "oneMind.auth.token";
const AUTH_REFRESH_TOKEN_KEY = "oneMind.auth.refreshToken";
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

const BUILTIN_CONTENT_ID_MAP = {
  "six-syllable-mantra": "om-mani",
  "green-tara-mantra": "green-tara",
  "diamond-sutra-ending": "diamond-end",
  "heart-sutra-core": "heart-sutra-core",
  "great-compassion-opening": "great-compassion-snippet"
};

function findBuiltinContentFallback(item) {
  const mappedId = BUILTIN_CONTENT_ID_MAP[item && item.id] || item && item.id;
  return localContents.find((content) => content.id === mappedId)
    || localContents.find((content) => content.title === item.title)
    || null;
}

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
  return requestOnce(path, options).catch((error) => {
    if (shouldRefreshAuth(error, options)) {
      return refreshToken()
        .then(() => requestOnce(path, {
          ...options,
          skipRefresh: true
        }))
        .catch((refreshError) => {
          if (refreshError && refreshError.statusCode === 401 && !options.skipAuth) {
            clearAuthSession();
          }
          throw refreshError;
        });
    }

    if (error && error.statusCode === 401 && !options.skipAuth) {
      clearAuthSession();
    }
    throw error;
  });
}

function requestOnce(path, options = {}) {
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
        const responseData = response.data || {};
        const error = new Error(responseData.message || responseData.error || `HTTP ${response.statusCode}`);
        error.statusCode = response.statusCode;
        error.response = responseData;
        settle(reject, error);
      },
      fail(error) {
        settle(reject, error);
      }
    });
  });
}

function shouldRefreshAuth(error, options = {}) {
  return Boolean(
    error &&
    error.statusCode === 401 &&
    !options.skipAuth &&
    !options.skipRefresh &&
    getRefreshToken()
  );
}

function getAuthToken() {
  return String(safeGetStorage(AUTH_TOKEN_KEY, "") || "");
}

function getRefreshToken() {
  return String(safeGetStorage(AUTH_REFRESH_TOKEN_KEY, "") || "");
}

function getAuthUser() {
  return safeGetStorage(AUTH_USER_KEY, null);
}

function clearAuthSession() {
  safeSetStorage(AUTH_TOKEN_KEY, "");
  safeSetStorage(AUTH_REFRESH_TOKEN_KEY, "");
  safeSetStorage(AUTH_USER_KEY, null);
}

function saveAuthSession(token, user, refreshTokenValue) {
  safeSetStorage(AUTH_TOKEN_KEY, token || "");
  safeSetStorage(AUTH_USER_KEY, user || null);
  if (refreshTokenValue !== undefined) {
    safeSetStorage(AUTH_REFRESH_TOKEN_KEY, refreshTokenValue || "");
  }
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

        request("/auth/wechat-login", {
          method: "POST",
          skipAuth: true,
          data: {
            code,
            platform: "wechat",
            userInfo: userInfo || {}
          }
        })
          .catch((error) => {
            if (error && error.statusCode === 404) {
              return request("/api/auth/wechat/login", {
                method: "POST",
                skipAuth: true,
                data: {
                  code,
                  platform: "wechat",
                  userInfo: userInfo || {}
                }
              });
            }
            throw error;
          })
          .then((response) => {
            const data = response.data || {};
            saveAuthSession(data.token || "", data.user || null, data.refreshToken || "");
            resolve(data);
          })
          .catch(reject);
      },
      fail: () => reject(new Error("无法调用微信登录接口"))
    });
  });
}

function login(userInfo = {}) {
  return loginWithWechat(userInfo);
}

function loginWithUserInfo(userInfo = {}) {
  return loginWithWechat(userInfo);
}

function refreshToken() {
  const refreshTokenValue = getRefreshToken();
  if (!refreshTokenValue) {
    clearAuthSession();
    const error = new Error("登录已过期，请重新授权");
    error.code = "AUTH_REQUIRED";
    return Promise.reject(error);
  }

  return request("/auth/refresh-token", {
    method: "POST",
    skipAuth: true,
    skipRefresh: true,
    data: {
      refreshToken: refreshTokenValue
    }
  }).then((response) => {
    const data = response.data || {};
    if (!data.token) {
      const error = new Error("登录已过期，请重新授权");
      error.code = "AUTH_REQUIRED";
      throw error;
    }
    saveAuthSession(
      data.token || "",
      data.user || getAuthUser(),
      data.refreshToken || refreshTokenValue
    );
    return data;
  }).catch((error) => {
    clearAuthSession();
    throw error;
  });
}

function updateAuthProfile(payload = {}) {
  return request("/auth/profile", {
    method: "PUT",
    data: payload
  }).then((response) => {
    const user = response.data || null;
    if (user) {
      saveAuthSession(getAuthToken(), user);
    }
    return user;
  });
}

function logout() {
  const action = getAuthToken()
    ? request("/auth/logout", {
      method: "POST",
      skipRefresh: true
    })
    : Promise.resolve(null);

  return action
    .then(() => {
      clearAuthSession();
      return { ok: true };
    })
    .catch(() => {
      clearAuthSession();
      return { ok: true };
    });
}

function isLoggedIn() {
  return Boolean(getAuthToken() && getAuthUser());
}

function ensureLogin(options = {}) {
  if (!getAuthToken()) {
    const error = new Error(options.message || "请先完成微信授权");
    error.code = "AUTH_REQUIRED";
    return Promise.reject(error);
  }
  return getCurrentUser().then((session) => {
    if (session.loggedIn) return session;
    const error = new Error(options.message || "请先完成微信授权");
    error.code = "AUTH_REQUIRED";
    throw error;
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

  return request("/auth/me")
    .catch((error) => {
      if (error && error.statusCode === 404) {
        return request("/api/auth/me");
      }
      throw error;
    })
    .then((response) => {
      const user = response.data || null;
      if (!user) {
        clearAuthSession();
        return { loggedIn: false, token: "", user: null };
      }
      const nextToken = getAuthToken() || token;
      saveAuthSession(nextToken, user);
      return {
        loggedIn: true,
        token: nextToken,
        user
      };
    })
    .catch((error) => {
      if (error && error.statusCode === 401) {
        clearAuthSession();
        return {
          loggedIn: false,
          token: "",
          user: null
        };
      }
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
  const builtinContent = findBuiltinContentFallback(item || {});
  const category = item.category || item.subtitle || TYPE_CATEGORY[item.type] || "经文片段";
  const lengthTier = item.lengthTier || item.length_tier || "short";
  const planDays = Number(item.planDays || item.plan_days || builtinContent && builtinContent.planDays || 1);
  const hasServerSegments = Object.prototype.hasOwnProperty.call(item, "segments");
  const hasServerSections = Object.prototype.hasOwnProperty.call(item, "sections");
  const segments = hasServerSegments
    ? (Array.isArray(item.segments) ? item.segments : splitBodyToSegments(item.segments || item.body || item.preview || ""))
    : Array.isArray(builtinContent && builtinContent.segments)
      ? builtinContent.segments
      : splitBodyToSegments(item.body || item.preview || "");
  const sections = hasServerSections
    ? item.sections
    : builtinContent && builtinContent.sections;
  const pinyinSegments = Array.isArray(item.pinyinSegments) && item.pinyinSegments.length
    ? item.pinyinSegments
    : Array.isArray(builtinContent && builtinContent.pinyinSegments) && builtinContent.pinyinSegments.length
    ? builtinContent.pinyinSegments
    : [];

  return {
    id: item.id,
    title: item.title,
    category,
    body: item.body || item.preview || "",
    preview: item.preview || item.body || "",
    segments,
    sections,
    pinyinSegments,
    lengthTier,
    lengthLevel: lengthTier,
    planDays,
    lengthLabel: item.lengthLabel || LENGTH_LABEL[lengthTier] || "长度 短",
    dayText: `约 ${planDays} 天背会`,
    festival: item.festival,
    festivalTag: item.festivalTag,
    scene: item.scene || "按计划修持",
    publishedVersionId: item.publishedVersionId !== undefined
      ? item.publishedVersionId
      : builtinContent && builtinContent.publishedVersionId,
    sourceNote: item.sourceNote !== undefined ? item.sourceNote : builtinContent && builtinContent.sourceNote,
    versionNote: item.versionNote !== undefined ? item.versionNote : builtinContent && builtinContent.versionNote,
    reviewStatus: item.reviewStatus !== undefined ? item.reviewStatus : builtinContent && builtinContent.reviewStatus,
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

function createMemoryAssessmentApi(payload = {}) {
  const { idempotencyKey, ...data } = payload;
  return request("/api/memory-assessments", {
    method: "POST",
    header: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    data
  }).then((response) => response.data || null);
}

function recommendMemoryPlanApi(payload = {}) {
  const { idempotencyKey, ...data } = payload;
  return request("/api/memory-plans/recommendation", {
    method: "POST",
    header: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    data
  }).then((response) => response.data || null);
}

function getContentStructureApi(contentId, versionId) {
  return request(
    `/api/contents/${encodeURIComponent(contentId)}/versions/${encodeURIComponent(versionId)}/structure`
  ).then((response) => response.data || null);
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
  ensureLogin,
  getCurrentUser,
  getAuthToken,
  getRefreshToken,
  isBackendEnabled,
  isLoggedIn,
  login,
  loginWithWechat,
  loginWithUserInfo,
  logout,
  refreshToken,
  listMemoryPlansApi,
  createMemoryAssessmentApi,
  createMemoryPlanApi,
  createNotificationJobApi,
  createRecitationSessionApi,
  completeReviewTaskApi,
  getGrowthOverviewApi,
  getContentStructureApi,
  getNotificationSettingsApi,
  listNotificationJobsApi,
  listRecitationGoalsApi,
  listContents,
  listFestivals,
  listTodayFocusApi,
  normalizeContent,
  normalizeFestival,
  recommendMemoryPlanApi,
  getAuthUser,
  setBackendEnabled,
  setBaseUrl,
  updateAuthProfile,
  upsertRecitationGoalApi,
  updateNotificationSettingApi
};
