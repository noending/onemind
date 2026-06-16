const { listFestivals } = require("../../common/api");
const {
  getGrowthOverviewWithFallback,
  hasPlans,
  listTodayFocusWithFallback,
  syncPlansFromBackend
} = require("../../common/memory");

function formatDateLabel(now = new Date()) {
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
}

function withTimeout(promise, fallback, timeout = 2500) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(fallback), timeout);
    Promise.resolve(promise)
      .then((value) => finish(value))
      .catch(() => finish(fallback))
      .finally(() => clearTimeout(timer));
  });
}

function estimateMinutesByCategory(category, totalDays) {
  if (category === "短咒" || category === "短偈") return 3;
  if (category === "长咒") return 12;
  return Math.max(4, Math.min(10, Number(totalDays || 1) * 2));
}

function formatUpdateTime(now = new Date()) {
  const hour = `${now.getHours()}`.padStart(2, "0");
  const minute = `${now.getMinutes()}`.padStart(2, "0");
  return `${hour}:${minute}`;
}

function sourceStatusText(source) {
  if (source === "backend") return "已同步后台内容";
  if (source === "cache") return "后台不可用，当前使用缓存";
  if (source === "fallback") return "后台不可用，已回退本地";
  return "当前使用本地演示数据";
}

function buildDueList(focus) {
  const scientificTasks = focus.scientificTasks || [];
  const playfulTasks = focus.playfulTasks || [];
  const recitationTasks = focus.recitationTasks || [];

  return []
    .concat(scientificTasks.map((item) => ({
      ...item,
      openType: "practice",
      groupKey: "scientific",
      groupTitle: "科学背诵",
      groupDesc: "按记忆曲线回稳今天该复习的内容",
      actionText: "去训练",
      modeTag: item.category || "经文片段",
      metaTag: `第 ${item.currentDay}/${item.totalDays} 天`,
      methodTag: item.method || "拆段跟读",
      body: item.body || item.reasonText || "按记忆曲线安排复习。",
      meta: `约 ${estimateMinutesByCategory(item.category, item.totalDays)} 分钟 · ${item.scene || "拆段跟读"}`
    })))
    .concat(playfulTasks.map((item) => ({
      ...item,
      openType: "practice",
      groupKey: "playful",
      groupTitle: "趣味背诵",
      groupDesc: "先推进一点，再回看一点，保持节律",
      actionText: "去推进",
      modeTag: item.category || "经文片段",
      metaTag: `第 ${item.currentDay}/${item.totalDays} 天`,
      methodTag: item.method || "节奏卡片",
      body: item.body || "完成一段推进，并回看一段旧记忆。",
      meta: `约 ${estimateMinutesByCategory(item.category, item.totalDays)} 分钟 · ${item.scene || "节奏卡片"}`
    })))
    .concat(recitationTasks.map((item) => ({
      ...item,
      openType: "recitation",
      groupKey: "recitation",
      groupTitle: "日常读诵",
      groupDesc: "用每日接触维持熟悉度，不急着背会",
      actionText: "去读诵",
      modeTag: "读诵",
      metaTag: item.preferredPeriod === "evening" ? "晚课" : item.preferredPeriod === "theme" ? "主题" : "晨课",
      methodTag: `每日 ${item.dailyTargetCount} 轮`,
      body: item.preview || `今日目标 ${item.dailyTargetCount} 轮，点击进入开始读诵。`,
      meta: `${item.scene || "读诵熏修"}`
    })));
}

function buildFocusGroups(dueList) {
  const groupMap = {
    scientific: { key: "scientific", title: "科学背诵", desc: "按记忆曲线回稳今天的内容", tasks: [] },
    playful: { key: "playful", title: "趣味背诵", desc: "先推进一点，再回看一点", tasks: [] },
    recitation: { key: "recitation", title: "日常读诵", desc: "通过读诵维持节律", tasks: [] }
  };

  (dueList || []).forEach((item) => {
    if (groupMap[item.groupKey]) {
      groupMap[item.groupKey].tasks.push(item);
    }
  });

  return ["scientific", "playful", "recitation"]
    .map((key) => groupMap[key])
    .filter((group) => group.tasks.length > 0)
    .map((group) => ({
      ...group,
      count: group.tasks.length
    }));
}

Page({
  data: {
    scientificTasks: [],
    playfulTasks: [],
    recitationTasks: [],
    dueList: [],
    focusGroups: [],
    summaryCards: [],
    nextDueCard: null,
    allDone: false,
    totalFocusCount: 0,
    dateLabel: "",
    streakDays: 0,
    hasPlans: false,
    featuredFestival: null,
    festivalSource: "local",
    sourceText: "当前使用本地演示数据",
    lastUpdatedText: "",
    loading: true,
    refreshing: false
  },

  onShow() {
    this.setData({
      dateLabel: formatDateLabel(),
      hasPlans: hasPlans()
    });

    this.loadHomeData();
  },

  onPullDownRefresh() {
    this.loadHomeData({ refresh: true, toast: true });
  },

  loadHomeData(options = {}) {
    const isRefresh = Boolean(options.refresh);
    this.setData(isRefresh ? { refreshing: true } : { loading: true });
    Promise.all([
      withTimeout(syncPlansFromBackend(), null, 2200),
      withTimeout(
        listTodayFocusWithFallback(),
        { scientificTasks: [], playfulTasks: [], recitationTasks: [] },
        2600
      ),
      withTimeout(
        listFestivals(),
        { festivals: [], source: "fallback" },
        2600
      ),
      withTimeout(
        getGrowthOverviewWithFallback(),
        { memorizationStreak: 0 },
        2600
      )
    ]).then((results) => {
      const focus = results[1] || { scientificTasks: [], playfulTasks: [], recitationTasks: [] };
      const festivalResult = results[2] || { festivals: [], source: "fallback" };
      const featuredFestival = (festivalResult.festivals || [])[0] || null;
      const growthOverview = results[3] || { memorizationStreak: 0 };
      const scientificTasks = focus.scientificTasks || [];
      const playfulTasks = focus.playfulTasks || [];
      const recitationTasks = focus.recitationTasks || [];
      const dueList = buildDueList(focus);
      const focusGroups = buildFocusGroups(dueList);
      const nextDueCard = dueList[0] || null;
      const summaryCards = [
        { key: "scientific", label: "科学", count: scientificTasks.length, desc: "回稳" },
        { key: "playful", label: "趣味", count: playfulTasks.length, desc: "推进" },
        { key: "recitation", label: "读诵", count: recitationTasks.length, desc: "维持节律" }
      ];
      this.setData({
        scientificTasks,
        playfulTasks,
        recitationTasks,
        dueList,
        focusGroups,
        summaryCards,
        nextDueCard,
        allDone: dueList.length === 0,
        totalFocusCount: scientificTasks.length + playfulTasks.length + recitationTasks.length,
        hasPlans: hasPlans(),
        streakDays: growthOverview.memorizationStreak || 0,
        featuredFestival,
        festivalSource: festivalResult.source || "fallback",
        sourceText: sourceStatusText(festivalResult.source || "fallback"),
        lastUpdatedText: formatUpdateTime(),
        loading: false,
        refreshing: false
      });
      if (isRefresh && options.toast) {
        wx.showToast({ title: "已刷新今日任务", icon: "success" });
      }
    }).catch(() => {
      this.setData({
        loading: false,
        refreshing: false
      });
      if (isRefresh) {
        wx.showToast({ title: "刷新失败，请稍后重试", icon: "none" });
      }
    }).finally(() => {
      if (isRefresh) {
        wx.stopPullDownRefresh();
      }
    });
  },

  openPractice(event) {
    const id = event.currentTarget.dataset.id;
    const planId = event.currentTarget.dataset.planId;
    const query = planId ? `id=${id}&planId=${planId}` : `id=${id}`;
    wx.navigateTo({ url: `/pages/practice/index?${query}` });
  },

  startFirstDue() {
    const first = (this.data.dueList || [])[0];
    if (!first) {
      wx.showToast({ title: "今日已完成", icon: "success" });
      return;
    }
    if (first.openType === "recitation") {
      wx.navigateTo({
        url: `/pages/recitation/index?id=${first.contentId}&goalId=${first.goalId || ""}&period=${first.preferredPeriod || "morning"}`
      });
      return;
    }
    wx.navigateTo({
      url: `/pages/practice/index?id=${first.contentId}&planId=${first.planId || ""}`
    });
  },

  openFirstInGroup(event) {
    const groupKey = event.currentTarget.dataset.groupKey;
    const group = (this.data.focusGroups || []).find((item) => item.key === groupKey);
    const first = group && group.tasks && group.tasks[0];
    if (!first) return;

    if (first.openType === "recitation") {
      wx.navigateTo({
        url: `/pages/recitation/index?id=${first.contentId}&goalId=${first.goalId || ""}&period=${first.preferredPeriod || "morning"}`
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/practice/index?id=${first.contentId}&planId=${first.planId || ""}`
    });
  },

  openDueItem(event) {
    const contentId = event.currentTarget.dataset.id;
    const openType = event.currentTarget.dataset.openType;
    if (openType === "recitation") {
      wx.navigateTo({
        url: `/pages/recitation/index?id=${contentId}&goalId=${event.currentTarget.dataset.goalId || ""}&period=${event.currentTarget.dataset.period || "morning"}`
      });
      return;
    }
    wx.navigateTo({
      url: `/pages/practice/index?id=${contentId}&planId=${event.currentTarget.dataset.planId || ""}`
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

  goLibrary() {
    wx.reLaunch({ url: "/pages/library/index" });
  },

  openFestival() {
    wx.reLaunch({ url: "/pages/library/index" });
  },

  refreshToday() {
    this.loadHomeData({ refresh: true, toast: true });
  }
});
