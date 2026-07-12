const {
  getPlanRows,
  getProgressItems,
  getGrowthOverviewWithFallback,
  listRecitationGoalsWithFallback,
  syncPlansFromBackend
} = require("../../common/memory");
const { isAdaptivePlan } = require("../../common/adaptive-progress");
const {
  getPlatformInfo,
  getPlatformLabel,
  getReminderStrategy,
  getReminderCapabilities,
  getPlatformChecklist,
  toggleChecklistStatus,
  resetChecklistStatus
} = require("../../common/platform");
const {
  getNotificationSettingsApi,
  getAuthUser,
  getCurrentUser,
  isBackendEnabled,
  listNotificationJobsApi,
  loginWithWechat,
  logout,
  updateNotificationSettingApi
} = require("../../common/api");

const PROFILE_NOTIFICATION_SETTINGS_KEY = "oneMind.profile.notification-settings";
const PROFILE_NOTIFICATION_JOBS_KEY = "oneMind.profile.notification-jobs";
const PROFILE_LOCAL_WECHAT_USER_KEY = "oneMind.profile.local-wechat-user";
const NOTIFICATION_CHANNELS = ["wechat_subscribe", "app_push", "sms"];

function buildCurveData(totalDays) {
  const maxDays = Math.max(Number(totalDays) || 7, 30);
  const days = [];
  for (let day = 0; day <= 30; day += 1) {
    const retention = Math.round(100 * Math.exp(-0.4 * day) + 5);
    days.push({
      day,
      retention: Math.max(6, Math.min(100, retention)),
      review: [1, 3, 7, 14, 30].includes(day)
    });
  }
  return {
    maxDays,
    points: days,
    reviewDays: [1, 3, 7, 14, 30]
  };
}

function retentionAtDay(day) {
  return Math.max(5, Math.min(105, Math.round(100 * Math.exp(-0.4 * day) + 5)));
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.round(number);
  if (rounded <= 0) return fallback;
  return rounded;
}

function normalizeCurveProgress(plan) {
  const totalDay = toPositiveInt(plan.total || plan.totalDays, 1);
  const currentRaw = toPositiveInt(plan.current || plan.currentDay, 1);
  const currentDay = Math.max(1, Math.min(totalDay, currentRaw));
  return { currentDay, totalDay };
}

function appendModeToDuplicateTitles(plans) {
  const titleCounter = {};
  plans.forEach((plan) => {
    const key = String(plan.title || "");
    if (!key) return;
    titleCounter[key] = (titleCounter[key] || 0) + 1;
  });

  return plans.map((plan) => {
    const key = String(plan.title || "");
    if (!key || titleCounter[key] <= 1) return plan;
    const modeLabel = plan.mode === "playful" ? "趣味" : "科学";
    return {
      ...plan,
      title: `${key} · ${modeLabel}`
    };
  });
}

function buildCurveChart(currentDay, plotWidth = 260, plotHeight = 214) {
  const maxDay = 30;
  const maxRetention = 105;
  const reviewDays = [1, 3, 7, 14, 30];
  const plotDays = [0, 1, 3, 7, 14, 30];
  const paddingX = 8;
  const usableWidth = Math.max(1, plotWidth - paddingX * 2);
  const toPx = (num) => `${Math.max(0, num).toFixed(2)}px`;

  const points = plotDays.map((day, index) => {
    const retention = retentionAtDay(day);
    const x = paddingX + (day / maxDay) * usableWidth;
    const y = ((maxRetention - retention) / maxRetention) * plotHeight;
    return {
      id: `point-${index}-${day}`,
      day,
      retention,
      x,
      y,
      style: `left:${toPx(x)};top:${toPx(y)};`
    };
  });

  const segments = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    segments.push({
      id: `seg-${i}-${start.day}-${end.day}`,
      style: [
        `left:${toPx(start.x)}`,
        `top:${toPx(start.y)}`,
        `width:${toPx(length)}`,
        `transform:rotate(${angle}deg)`
      ].join(";")
    });
  }

  const guideLines = reviewDays.map((day) => ({
    id: `guide-${day}`,
    day,
    style: `left:${toPx(paddingX + (day / maxDay) * usableWidth)};`
  }));

  const xTicks = [0, 5, 10, 15, 20, 25, 30].map((day) => ({
    id: `xtick-${day}`,
    day,
    style: `left:${toPx(paddingX + (day / maxDay) * usableWidth)};`
  }));

  const yTicks = [105, 60, 30, 0].map((value) => ({
    id: `ytick-${value}`,
    value,
    style: `top:${toPx(((maxRetention - value) / maxRetention) * plotHeight)};`
  }));

  const nodeLegend = reviewDays.map((day) => ({
    id: `node-${day}`,
    day,
    label: `第${day}天`,
    active: Number(currentDay || 0) >= day
  }));

  return {
    points,
    segments,
    guideLines,
    xTicks,
    yTicks,
    nodeLegend
  };
}

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

function formatDateText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, 10);
}

function formatDateTimeText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text.replace("T", " ").slice(0, 16);
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function channelLabel(channel) {
  const key = String(channel || "").trim();
  if (key === "wechat_subscribe") return "微信订阅";
  if (key === "app_push") return "App 推送";
  if (key === "sms") return "短信兜底";
  return key || "提醒";
}

function channelDescription(channel) {
  const key = String(channel || "").trim();
  if (key === "wechat_subscribe") return "适合小程序内的订阅提醒与待办同步。";
  if (key === "app_push") return "App 容器可接入系统级通知。";
  if (key === "sms") return "作为最稳妥的兜底触达方式。";
  return "提醒触达配置。";
}

function periodLabel(period) {
  const key = String(period || "").trim();
  if (key === "morning") return "晨起";
  if (key === "noon") return "午间";
  if (key === "evening") return "傍晚";
  if (key === "night") return "夜间";
  return key || "晨起";
}

function goalTypeLabel(goalType) {
  const key = String(goalType || "").trim();
  if (key === "daily") return "每日目标";
  if (key === "weekly") return "每周目标";
  if (key === "festival") return "节日专题";
  return key || "读诵目标";
}

function jobStatusLabel(status) {
  const key = String(status || "").trim();
  if (key === "pending") return "待发送";
  if (key === "sent") return "已发送";
  if (key === "failed") return "发送失败";
  return key || "待处理";
}

function jobStatusTone(status) {
  const key = String(status || "").trim();
  if (key === "pending") return "pending";
  if (key === "sent") return "sent";
  if (key === "failed") return "failed";
  return "neutral";
}

function capabilityStatusLabel(status) {
  const key = String(status || "").trim();
  if (key === "ready") return "已就绪";
  if (key === "fallback") return "可降级";
  return "可用";
}

function capabilityStatusTone(status) {
  const key = String(status || "").trim();
  if (key === "ready") return "ready";
  if (key === "fallback") return "fallback";
  return "available";
}

function checklistStatusTone(status) {
  const key = String(status || "").trim();
  if (key === "passed") return "passed";
  if (key === "failed") return "failed";
  return "review";
}

function normalizeQuietHours(quietHours) {
  const source = quietHours && typeof quietHours === "object" ? quietHours : {};
  const start = String(source.start || "22:00").slice(0, 5);
  const end = String(source.end || "07:00").slice(0, 5);
  return { start, end };
}

function formatQuietHours(quietHours) {
  const normalized = normalizeQuietHours(quietHours);
  return `${normalized.start} - ${normalized.end}`;
}

function defaultNotificationSetting(channel) {
  return {
    id: `local-${channel}`,
    userId: "local",
    channel,
    enabled: channel !== "sms",
    quietHours: {
      start: "22:00",
      end: "07:00"
    },
    updatedAt: ""
  };
}

function buildDefaultNotificationSettings() {
  return NOTIFICATION_CHANNELS.map((channel) => defaultNotificationSetting(channel));
}

function normalizeNotificationSettings(settings) {
  const byChannel = new Map(buildDefaultNotificationSettings().map((item) => [item.channel, item]));
  (Array.isArray(settings) ? settings : []).forEach((item) => {
    if (!item || !item.channel) return;
    byChannel.set(item.channel, {
      ...byChannel.get(item.channel),
      ...item
    });
  });

  return NOTIFICATION_CHANNELS.map((channel) => {
    const source = byChannel.get(channel) || defaultNotificationSetting(channel);
    const quietHours = normalizeQuietHours(source.quietHours);
    const enabled = Boolean(source.enabled);
    return {
      ...defaultNotificationSetting(channel),
      ...source,
      quietHours,
      channelLabel: channelLabel(channel),
      channelDescription: channelDescription(channel),
      quietHoursText: formatQuietHours(quietHours),
      enabledText: enabled ? "已开启" : "已关闭",
      toggleText: enabled ? "关闭" : "开启"
    };
  });
}

function buildJobPayloadText(payload) {
  if (!payload || typeof payload !== "object") return "无额外载荷";
  const candidates = [
    payload.title,
    payload.name,
    payload.message,
    payload.contentTitle,
    payload.scene,
    payload.note
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (candidates.length) return candidates[0].slice(0, 24);

  const keys = Object.keys(payload).slice(0, 3);
  return keys.length ? keys.join(" · ") : "无额外载荷";
}

function normalizeNotificationJobs(jobs) {
  return (Array.isArray(jobs) ? jobs : [])
    .map((job) => {
      const payload = job && typeof job.payload === "object" && job.payload ? job.payload : {};
      return {
        ...job,
        channelLabel: channelLabel(job.channel),
        statusLabel: jobStatusLabel(job.status),
        statusTone: jobStatusTone(job.status),
        scheduledAtText: formatDateTimeText(job.scheduledAt),
        sentAtText: formatDateTimeText(job.sentAt),
        payloadText: buildJobPayloadText(payload)
      };
    })
    .slice(0, 5);
}

function normalizeRecitationGoals(goals) {
  return (Array.isArray(goals) ? goals : []).map((goal) => {
    const dailyTargetCount = Math.max(1, Number(goal.dailyTargetCount || 1));
    return {
      ...goal,
      preferredPeriodLabel: periodLabel(goal.preferredPeriod),
      goalTypeLabel: goalTypeLabel(goal.goalType),
      statusLabel: goal.status === "paused" ? "已暂停" : "进行中",
      statusTone: goal.status === "paused" ? "muted" : "active",
      dailyTargetText: `每日 ${dailyTargetCount} 次`,
      subtitleText: String(goal.preview || goal.scene || "").trim() || "保持当下节律"
    };
  });
}

function normalizeGrowthOverview(overview) {
  const nextOverview = overview || {};
  const milestone = nextOverview.latestMilestone;
  return {
    ...nextOverview,
    memorizationStreak: Number(nextOverview.memorizationStreak || 0),
    recitationStreak: Number(nextOverview.recitationStreak || 0),
    masteredCount: Number(nextOverview.masteredCount || 0),
    latestMilestone: milestone ? {
      ...milestone,
      title: String(milestone.title || milestone.name || milestone.stage || "最近里程碑").trim(),
      achievedAt: formatDateText(milestone.achievedAt)
    } : null
  };
}

function normalizeWechatProfile(userInfo = {}) {
  const nickname = String(userInfo.nickname || userInfo.nickName || userInfo.name || "").trim();
  const avatarUrl = String(userInfo.avatarUrl || userInfo.avatar || "").trim();
  return {
    nickname: nickname || "修行者",
    avatarUrl,
    avatarInitial: (nickname || "行").slice(0, 1)
  };
}

function isMeaningfulWechatNickname(value) {
  const nickname = String(value || "").trim();
  return Boolean(nickname && nickname !== "修行者" && nickname !== "微信用户");
}

function buildWechatUserInfoFromDraft(draft = {}) {
  const nickname = String(draft.nickname || "").trim();
  const avatarUrl = String(draft.avatarUrl || "").trim();
  return {
    nickName: nickname,
    nickname,
    avatarUrl
  };
}

function buildAuthView(user, options = {}) {
  const profile = normalizeWechatProfile(user || {});
  const loggedIn = Boolean(options.loggedIn);
  return {
    loggedIn,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl,
    avatarInitial: profile.avatarInitial,
    statusText: options.statusText || (loggedIn ? "已完成微信授权" : "可选：微信授权同步跨端进度")
  };
}

function getNotificationCache() {
  return normalizeNotificationSettings(safeGetStorage(PROFILE_NOTIFICATION_SETTINGS_KEY, buildDefaultNotificationSettings()));
}

function saveNotificationCache(settings) {
  safeSetStorage(PROFILE_NOTIFICATION_SETTINGS_KEY, normalizeNotificationSettings(settings));
}

function getNotificationJobCache() {
  return normalizeNotificationJobs(safeGetStorage(PROFILE_NOTIFICATION_JOBS_KEY, []));
}

function saveNotificationJobCache(jobs) {
  safeSetStorage(PROFILE_NOTIFICATION_JOBS_KEY, normalizeNotificationJobs(jobs));
}

function buildPlatformCapabilities() {
  return getReminderCapabilities().map((item) => ({
    ...item,
    statusLabel: capabilityStatusLabel(item.status),
    statusTone: capabilityStatusTone(item.status)
  }));
}

function buildPlatformChecklist() {
  return getPlatformChecklist().map((item) => ({
    ...item,
    statusTone: checklistStatusTone(item.status),
    editable: item.key !== "storage" && item.key !== "reminder",
    updatedAtText: item.updatedAt ? `更新于 ${formatDateText(item.updatedAt)}` : (item.key === "storage" ? "自动检测" : "系统固定")
  }));
}

Page({
  data: {
    subTab: "progress",
    stats: {
      reviewing: 0,
      atRisk: 0,
      mastered: 0
    },
    growthOverview: {
      memorizationStreak: 0,
      recitationStreak: 0,
      masteredCount: 0,
      latestMilestone: null
    },
    platformLabel: "",
    platformDetailText: "",
    reminderStrategy: "",
    reminderCapabilities: [],
    platformChecklist: [],
    platformChecklistHint: "",
    notificationSettings: [],
    notificationJobs: [],
    notificationSourceText: "",
    notificationJobsHint: "",
    recitationGoals: [],
    plans: [],
    reviewingPlans: [],
    riskPlans: [],
    donePlans: [],
    selectedPlanId: "",
    selectedPlanTitle: "",
    selectedPlanIsAdaptive: false,
    selectedPlanMigrationRequired: false,
    adaptiveProgress: null,
    curveData: [],
    curveReviewDays: [1, 3, 7, 14, 30],
    curveChart: {
      points: [],
      segments: [],
      guideLines: [],
      xTicks: [],
      yTicks: [],
      nodeLegend: []
    },
    curveCurrentDay: 0,
    curveTotalDays: 0,
    masteredPlans: [],
    hasPlans: false,
    auth: {
      loggedIn: false,
      nickname: "修行者",
      avatarUrl: "",
      avatarInitial: "行",
      statusText: "专注当下，持续修持"
    },
    authProfileSheetVisible: false,
    authDraft: {
      avatarUrl: "",
      nickname: "",
      saving: false
    },
    summaryText: "今日继续一小段，节律比速度更重要。"
  },

  onShow() {
    this.refreshData();
  },

  refreshData() {
    syncPlansFromBackend().finally(() => {
      const progress = getProgressItems();
      const sortedPlans = getPlanRows().sort((left, right) => this.planRank(left) - this.planRank(right));
      const plans = appendModeToDuplicateTitles(sortedPlans);
      const riskIds = new Set((progress.atRisk || []).map((item) => item.id));
      const reviewingOnly = (progress.reviewing || []).filter((item) => !riskIds.has(item.id));
      this.setData({
        stats: {
          reviewing: progress.reviewing.length,
          atRisk: progress.atRisk.length,
          mastered: progress.mastered.length
        },
        plans,
        reviewingPlans: reviewingOnly,
        riskPlans: progress.atRisk || [],
        donePlans: progress.mastered || [],
        selectedPlanId: this.pickSelectedPlanId(plans),
        masteredPlans: progress.mastered,
        hasPlans: plans.length > 0,
        summaryText: this.buildSummaryText(progress, plans)
      }, () => this.refreshCurveData());
      this.refreshPlatformPanel();
      this.refreshGrowth();
      this.refreshAuth().then((session) => this.refreshNotificationPanel(session));
    });
  },

  pickSelectedPlanId(plans) {
    const current = this.data.selectedPlanId;
    if (current && plans.some((item) => item.id === current)) return current;
    return plans.length ? plans[0].id : "";
  },

  planRank(plan) {
    if (plan.state === "at_risk") return 0;
    if (plan.state === "reviewing") return 1;
    return 2;
  },

  buildSummaryText(progress, plans) {
    if (!plans.length) {
      return "先开始一段内容，系统会为你自动安排后续复习。";
    }

    if (progress.atRisk.length) {
      return `当前有 ${progress.atRisk.length} 段进入易遗忘窗口，建议优先回稳。`;
    }

    if (progress.reviewing.length) {
      return `还有 ${progress.reviewing.length} 段正在掌握中，保持节律就会越来越稳。`;
    }

    return "当前计划都比较稳定，可以开始下一段新的修持内容。";
  },

  refreshGrowth() {
    return Promise.all([
      getGrowthOverviewWithFallback(),
      listRecitationGoalsWithFallback()
    ]).then(([growthOverview, recitationGoals]) => {
      const nextOverview = normalizeGrowthOverview(growthOverview || this.data.growthOverview);
      this.setData({
        growthOverview: nextOverview,
        recitationGoals: normalizeRecitationGoals(recitationGoals || [])
      });
    });
  },

  refreshPlatformPanel() {
    const platformInfo = getPlatformInfo();
    const platformLabel = getPlatformLabel(platformInfo);
    const platformDetail = [platformInfo.system, platformInfo.model].filter(Boolean).join(" · ")
      || platformInfo.hostName
      || "";
    this.setData({
      platformLabel,
      platformDetailText: platformDetail,
      reminderStrategy: getReminderStrategy(),
      reminderCapabilities: buildPlatformCapabilities(),
      platformChecklist: buildPlatformChecklist(),
      platformChecklistHint: "点击可切换可编辑项的检查状态，存储与提醒项由系统固定。"
    });
  },

  refreshAuth() {
    const cachedUser = getAuthUser();
    if (!isBackendEnabled()) {
      const localWechatUser = safeGetStorage(PROFILE_LOCAL_WECHAT_USER_KEY, null);
      const displayUser = localWechatUser || cachedUser || null;
      const session = {
        loggedIn: false,
        user: displayUser
      };
      this.setData({
        auth: buildAuthView(displayUser, {
          loggedIn: false,
          statusText: localWechatUser ? "已使用微信资料（本地）" : "点击头像可授权微信资料"
        })
      });
      return Promise.resolve(session);
    }

    return getCurrentUser().then((session) => {
      const loggedIn = Boolean(session.loggedIn);
      this.setData({
        auth: buildAuthView(session.user || null, {
          loggedIn,
          statusText: loggedIn ? "已完成微信授权" : "可选：微信授权同步跨端进度"
        })
      });
      return session;
    });
  },

  refreshNotificationPanel(session) {
    const resolvedSession = session || { loggedIn: false, user: null };
    const loggedIn = Boolean(resolvedSession.loggedIn);
    const useRemote = isBackendEnabled() && loggedIn;

    if (!useRemote) {
      const cachedSettings = getNotificationCache();
      const cachedJobs = getNotificationJobCache();
      this.setData({
        notificationSettings: cachedSettings,
        notificationJobs: cachedJobs,
        notificationSourceText: cachedSettings.some((item) => item.updatedAt)
          ? "正在使用本地缓存提醒设置"
          : "当前使用本地默认提醒设置",
        notificationJobsHint: cachedJobs.length
          ? "最近提醒任务来自本地缓存"
          : "登录后可查看最近提醒任务"
      });
      return Promise.resolve({
        notificationSettings: cachedSettings,
        notificationJobs: cachedJobs
      });
    }

    return Promise.all([
      getNotificationSettingsApi(),
      listNotificationJobsApi(5)
    ]).then(([settings, jobs]) => {
      const nextSettings = normalizeNotificationSettings(settings || []);
      const nextJobs = normalizeNotificationJobs(jobs || []);
      saveNotificationCache(nextSettings);
      saveNotificationJobCache(nextJobs);
      this.setData({
        notificationSettings: nextSettings,
        notificationJobs: nextJobs,
        notificationSourceText: "提醒设置已同步后台",
        notificationJobsHint: nextJobs.length
          ? "最近 5 条提醒任务已同步"
          : "后台当前暂无最近提醒任务"
      });
      return {
        notificationSettings: nextSettings,
        notificationJobs: nextJobs
      };
    }).catch(() => {
      const cachedSettings = getNotificationCache();
      const cachedJobs = getNotificationJobCache();
      this.setData({
        notificationSettings: cachedSettings,
        notificationJobs: cachedJobs,
        notificationSourceText: cachedSettings.some((item) => item.updatedAt)
          ? "后台同步失败，已回退到本地缓存"
          : "后台同步失败，当前使用本地默认提醒设置",
        notificationJobsHint: cachedJobs.length
          ? "已回退到本地缓存的提醒任务"
          : "登录后可查看最近提醒任务"
      });
      return {
        notificationSettings: cachedSettings,
        notificationJobs: cachedJobs
      };
    });
  },

  showWechatProfileSheet() {
    const currentAuth = this.data.auth || {};
    this.setData({
      authProfileSheetVisible: true,
      authDraft: {
        avatarUrl: currentAuth.avatarUrl || "",
        nickname: isMeaningfulWechatNickname(currentAuth.nickname) ? currentAuth.nickname : "",
        saving: false
      }
    });
  },

  onChooseWechatAvatar(event) {
    const avatarUrl = event && event.detail ? String(event.detail.avatarUrl || "").trim() : "";
    if (!avatarUrl) {
      wx.showToast({ title: "未选择头像", icon: "none" });
      return;
    }

    const draft = this.data.authDraft || {};
    this.setData({
      authProfileSheetVisible: true,
      authDraft: {
        ...draft,
        avatarUrl,
        saving: false
      }
    });
  },

  onWechatNicknameInput(event) {
    const draft = this.data.authDraft || {};
    this.setData({
      authDraft: {
        ...draft,
        nickname: String(event.detail.value || "").trim()
      }
    });
  },

  closeWechatProfileSheet() {
    if (this.data.authDraft && this.data.authDraft.saving) return;
    this.setData({
      authProfileSheetVisible: false
    });
  },

  noop() {},

  confirmWechatLogin() {
    const draft = this.data.authDraft || {};
    const userInfo = buildWechatUserInfoFromDraft(draft);
    if (!userInfo.avatarUrl) {
      wx.showToast({ title: "请先选择微信头像", icon: "none" });
      return;
    }
    if (!isMeaningfulWechatNickname(userInfo.nickName)) {
      wx.showToast({ title: "请先选择微信昵称", icon: "none" });
      return;
    }

    this.setData({
      authDraft: {
        ...draft,
        saving: true
      }
    });

    if (!isBackendEnabled()) {
      const localUser = normalizeWechatProfile(userInfo);
      safeSetStorage(PROFILE_LOCAL_WECHAT_USER_KEY, localUser);
      this.setData({
        auth: buildAuthView(localUser, {
          loggedIn: false,
          statusText: "已使用微信资料（本地）"
        }),
        authProfileSheetVisible: false,
        authDraft: {
          avatarUrl: localUser.avatarUrl,
          nickname: localUser.nickname,
          saving: false
        }
      });
      wx.showToast({ title: "已显示微信资料", icon: "success" });
      return;
    }

    loginWithWechat(userInfo).then((session) => {
      const user = session.user || {};
      this.setData({
        auth: buildAuthView(user, {
          loggedIn: true,
          statusText: "已完成微信授权"
        }),
        authProfileSheetVisible: false,
        authDraft: {
          avatarUrl: user.avatarUrl || userInfo.avatarUrl,
          nickname: user.nickname || userInfo.nickName,
          saving: false
        }
      }, () => {
        this.refreshNotificationPanel({
          loggedIn: true,
          user
        });
      });
      wx.showToast({ title: "授权成功", icon: "success" });
    }).catch((error) => {
      this.setData({
        authDraft: {
          ...this.data.authDraft,
          saving: false
        }
      });
      wx.showToast({ title: error.message || "授权失败", icon: "none" });
    });
  },

  logoutWechat() {
    logout().then(() => {
      safeSetStorage(PROFILE_LOCAL_WECHAT_USER_KEY, null);
      this.setData({
        auth: {
          loggedIn: false,
          nickname: "修行者",
          avatarUrl: "",
          avatarInitial: "行",
          statusText: "已退出微信授权"
        }
      }, () => {
        this.refreshNotificationPanel({
          loggedIn: false,
          user: null
        });
      });
      wx.showToast({ title: "已退出", icon: "success" });
    });
  },

  openRecitation(event) {
    const id = event.currentTarget.dataset.id;
    const goalId = event.currentTarget.dataset.goalId || "";
    const period = event.currentTarget.dataset.period || "morning";
    wx.navigateTo({
      url: `/pages/recitation/index?id=${id}&goalId=${goalId}&period=${period}`
    });
  },

  openPractice(event) {
    const id = event.currentTarget.dataset.id;
    const planId = event.currentTarget.dataset.planId || "";
    if (!id) return;
    wx.navigateTo({
      url: `/pages/practice/index?id=${id}&planId=${planId}`
    });
  },

  migrateLegacyPlan() {
    const plan = (this.data.plans || []).find((item) => item.id === this.data.selectedPlanId);
    if (!plan || !plan.migrationRequired) return;
    const versionId = plan.contentVersionId
      || (plan.contentSnapshot && plan.contentSnapshot.publishedVersionId)
      || "";
    if (!versionId) {
      wx.showToast({ title: "当前内容缺少可迁移版本", icon: "none" });
      return;
    }
    wx.showModal({
      title: "升级为新的分句计划",
      content: "新计划创建成功后才会归档当前旧计划。是否继续？",
      confirmText: "开始升级",
      success: (result) => {
        if (!result.confirm) return;
        const query = [
          `contentId=${encodeURIComponent(plan.contentId)}`,
          `versionId=${encodeURIComponent(versionId)}`,
          `legacyPlanId=${encodeURIComponent(plan.id)}`
        ].join("&");
        wx.navigateTo({ url: `/pages/assessment/index?${query}` });
      }
    });
  },

  goLibrary() {
    wx.reLaunch({ url: "/pages/library/index" });
  },

  changeSubTab(event) {
    const tab = event.currentTarget.dataset.tab;
    if (!tab || tab === this.data.subTab) return;
    this.setData({ subTab: tab }, () => {
      if (tab === "progress" && this.data.curveData && this.data.curveData.length) {
        this.measureAndBuildCurveChart();
      }
    });
  },

  toggleNotificationSetting(event) {
    const channel = event.currentTarget.dataset.channel;
    if (!channel) return;
    const current = (this.data.notificationSettings || []).find((item) => item.channel === channel);
    if (!current) return;

    const nextSetting = {
      ...current,
      enabled: !current.enabled,
      quietHours: normalizeQuietHours(current.quietHours),
      updatedAt: new Date().toISOString()
    };
    const nextSettings = normalizeNotificationSettings(
      (this.data.notificationSettings || []).map((item) => (item.channel === channel ? nextSetting : item))
    );

    const applyNotificationSettings = (settings, hint) => {
      const normalizedSettings = normalizeNotificationSettings(settings);
      saveNotificationCache(normalizedSettings);
      this.setData({
        notificationSettings: normalizedSettings,
        notificationSourceText: hint
      });
      return normalizedSettings;
    };

    if (this.data.auth.loggedIn && isBackendEnabled()) {
      updateNotificationSettingApi({
        channel: nextSetting.channel,
        enabled: nextSetting.enabled,
        quietHours: nextSetting.quietHours
      }).then((updatedSetting) => {
        const mergedSettings = normalizeNotificationSettings(
          nextSettings.map((item) => (item.channel === channel ? updatedSetting : item))
        );
        applyNotificationSettings(mergedSettings, "提醒设置已同步后台");
        wx.showToast({
          title: nextSetting.enabled ? "已开启" : "已关闭",
          icon: "none"
        });
      }).catch(() => {
        applyNotificationSettings(nextSettings, "后台同步失败，已保存在本地");
        wx.showToast({
          title: nextSetting.enabled ? "本地已开启" : "本地已关闭",
          icon: "none"
        });
      });
      return;
    }

    applyNotificationSettings(nextSettings, "当前使用本地提醒设置");
    wx.showToast({
      title: nextSetting.enabled ? "已开启" : "已关闭",
      icon: "none"
    });
  },

  toggleChecklistItem(event) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;
    const current = (this.data.platformChecklist || []).find((item) => item.key === key);
    if (current && !current.editable) {
      wx.showToast({ title: "这项为系统固定", icon: "none" });
      return;
    }
    toggleChecklistStatus(key);
    this.setData({
      platformChecklist: buildPlatformChecklist()
    });
    wx.showToast({ title: "自检状态已更新", icon: "none" });
  },

  resetPlatformChecklist() {
    wx.showModal({
      title: "重置自检",
      content: "要把可编辑的自检项恢复到默认状态吗？",
      success: (result) => {
        if (!result.confirm) return;
        resetChecklistStatus();
        this.setData({
          platformChecklist: buildPlatformChecklist()
        });
        wx.showToast({ title: "已重置", icon: "success" });
      }
    });
  },

  changeCurvePlan(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || id === this.data.selectedPlanId) return;
    this.setData({ selectedPlanId: id }, () => this.refreshCurveData());
  },

  refreshCurveData() {
    const plan = (this.data.plans || []).find((item) => item.id === this.data.selectedPlanId);
    if (!plan) {
      this.setData({
        selectedPlanTitle: "",
        selectedPlanIsAdaptive: false,
        selectedPlanMigrationRequired: false,
        adaptiveProgress: null,
        curveData: [],
        curveChart: {
          points: [],
          segments: [],
          guideLines: [],
          xTicks: [],
          yTicks: [],
          nodeLegend: []
        },
        curveCurrentDay: 0,
        curveTotalDays: 0
      });
      return;
    }

    if (isAdaptivePlan(plan)) {
      this.setData({
        selectedPlanTitle: plan.title || "",
        selectedPlanIsAdaptive: true,
        selectedPlanMigrationRequired: false,
        adaptiveProgress: {
          stableUnitCount: Number(plan.stableUnitCount || 0),
          totalUnitCount: Number(plan.totalUnitCount || 0),
          dueTodayCount: Number(plan.dueTodayCount || 0),
          weakUnitCount: Number(plan.weakUnitCount || 0),
          expectedFinishDate: plan.expectedFinishDate || "待生成",
          nextReviewDate: plan.nextReviewDate || "待首次复习",
          percent: Number(plan.percent || 0)
        },
        curveData: [],
        curveCurrentDay: 0,
        curveTotalDays: 0
      });
      return;
    }

    const normalized = normalizeCurveProgress(plan);
    const built = buildCurveData(normalized.totalDay);
    this.setData({
      selectedPlanTitle: plan.title || "",
      selectedPlanIsAdaptive: false,
      selectedPlanMigrationRequired: Boolean(plan.migrationRequired),
      adaptiveProgress: null,
      curveData: built.points,
      curveReviewDays: built.reviewDays,
      curveCurrentDay: normalized.currentDay,
      curveTotalDays: normalized.totalDay,
      curveChart: {
        points: [],
        segments: [],
        guideLines: [],
        xTicks: [],
        yTicks: [],
        nodeLegend: []
      }
    }, () => {
      this.measureAndBuildCurveChart();
    });
  },

  measureAndBuildCurveChart() {
    const drawToken = `${Date.now()}-${Math.random()}`;
    this._curveDrawToken = drawToken;
    const query = this.createSelectorQuery();
    query.select(".curve-plot").boundingClientRect();
    query.exec((res) => {
      const rect = res && res[0];
      const plotWidth = rect && rect.width ? Math.max(220, rect.width) : 260;
      const plotHeight = rect && rect.height ? Math.max(176, rect.height) : 214;
      const curveChart = buildCurveChart(this.data.curveCurrentDay || 1, plotWidth, plotHeight);
      this.setData({ curveChart }, () => {
        this.drawCurveCanvas(plotWidth, plotHeight, curveChart.points, drawToken);
      });
    });
  },

  drawCurveCanvas(plotWidth, plotHeight, points, drawToken) {
    if (drawToken && this._curveDrawToken && drawToken !== this._curveDrawToken) return;
    const query = this.createSelectorQuery();
    query.select("#curveCanvas").fields({ node: true, size: true });
    query.exec((res) => {
      if (drawToken && this._curveDrawToken && drawToken !== this._curveDrawToken) return;
      const first = res && res[0];
      if (!first || !first.node || !Array.isArray(points) || points.length < 2) return;

      const canvas = first.node;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const renderWidth = first.width && Number(first.width) > 0 ? Number(first.width) : plotWidth;
      const renderHeight = first.height && Number(first.height) > 0 ? Number(first.height) : plotHeight;
      const dprInfo = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : {};
      const dpr = Number(dprInfo.pixelRatio || 2);
      canvas.width = Math.max(1, Math.round(renderWidth * dpr));
      canvas.height = Math.max(1, Math.round(renderHeight * dpr));

      if (typeof ctx.resetTransform === "function") {
        ctx.resetTransform();
      } else if (typeof ctx.setTransform === "function") {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (typeof ctx.setTransform === "function") {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else {
        ctx.scale(dpr, dpr);
      }

      ctx.strokeStyle = "#8f3022";
      ctx.lineWidth = 2.4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i += 1) {
        const prev = points[i];
        const next = points[i + 1];
        const midX = (prev.x + next.x) / 2;
        const midY = (prev.y + next.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
      const lastSecond = points[points.length - 2];
      const lastPoint = points[points.length - 1];
      ctx.quadraticCurveTo(lastSecond.x, lastSecond.y, lastPoint.x, lastPoint.y);
      ctx.stroke();

      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        ctx.beginPath();
        ctx.fillStyle = "#8f3022";
        ctx.arc(point.x, point.y, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = "#f2d9b2";
        ctx.lineWidth = 2.4;
        ctx.arc(point.x, point.y, 5.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
});
