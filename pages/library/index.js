const { listContents, listFestivals } = require("../../common/api");
const {
  createPlanWithFallback,
  getPlanRows,
  saveRecitationGoalWithFallback,
  syncPlansFromBackend
} = require("../../common/memory");

function buildModeCards(content) {
  const supported = Array.isArray(content.supportedModes) && content.supportedModes.length
    ? content.supportedModes
    : ["scientific"];
  const cards = [];
  if (supported.includes("scientific")) {
    cards.push({
      key: "scientific",
      title: "科学背诵",
      desc: "按记忆曲线安排复习，适合严肃稳固地背会。",
      button: "开始科学背诵"
    });
  }
  if (supported.includes("playful")) {
    cards.push({
      key: "playful",
      title: "趣味背诵",
      desc: "用成长阶段和每日推进感来陪你坚持，不做浮夸小游戏。",
      button: "开始趣味背诵"
    });
  }
  if (content.supportsRecitation !== false) {
    cards.push({
      key: "recitation",
      title: "日常读诵",
      desc: "先养成每日读诵习惯，不要求立刻背会。",
      button: "加入日常读诵"
    });
  }
  return cards;
}

Page({
  data: {
    filters: ["全部", "短咒", "短偈", "经文片段", "长咒"],
    activeFilter: "全部",
    contents: [],
    filteredContents: [],
    picked: null,
    showLongTip: false,
    contentSource: "本地演示数据",
    loading: true,
    modeCards: [],
    longSeries: null,
    festivalOptions: [],
    festivalFilterId: "",
    festivalSource: "",
    activeFestival: null
  },

  onLoad(options = {}) {
    this.setData({
      festivalFilterId: options.festivalId || "",
      festivalSource: options.festivalSource || ""
    });
  },

  onShow() {
    syncPlansFromBackend().finally(() => this.loadContents());
  },

  loadContents() {
    this.setData({ loading: true });
    Promise.all([listContents(), listFestivals()]).then(([contentResult, festivalResult]) => {
      const enhanced = this.attachPlanState(contentResult.contents || []);
      const festivalOptions = festivalResult.festivals || [];
      const activeFestival = festivalOptions.find((item) => item.id === this.data.festivalFilterId) || null;
      const filteredContents = this.filterContents(enhanced, this.data.activeFilter, activeFestival);
      this.setData({
        contents: enhanced,
        filteredContents,
        longSeries: this.buildLongSeries(this.getFestivalScopedContents(enhanced, activeFestival)),
        contentSource: contentResult.status.statusText,
        festivalOptions,
        activeFestival,
        festivalSource: this.data.festivalSource || festivalResult.source || "",
        loading: false
      });
    });
  },

  getFestivalScopedContents(contents, activeFestival) {
    if (!activeFestival || !Array.isArray(activeFestival.recommendedContents) || !activeFestival.recommendedContents.length) {
      return contents;
    }
    const allowedIds = new Set(activeFestival.recommendedContents.map((item) => item.id));
    return contents.filter((item) => allowedIds.has(item.id));
  },

  filterContents(contents, activeFilter, activeFestival = this.data.activeFestival) {
    const scoped = this.getFestivalScopedContents(contents, activeFestival);
    return activeFilter === "全部"
      ? scoped
      : scoped.filter((item) => item.category === activeFilter);
  },

  changeFilter(event) {
    const activeFilter = event.currentTarget.dataset.filter;
    const scoped = this.getFestivalScopedContents(this.data.contents, this.data.activeFestival);
    const filteredContents = this.filterContents(this.data.contents, activeFilter, this.data.activeFestival);
    this.setData({
      activeFilter,
      filteredContents,
      longSeries: this.buildLongSeries(scoped)
    });
  },

  attachPlanState(contents) {
    const rows = getPlanRows();
    const activeMap = {};

    rows.forEach((plan) => {
      if (!plan || plan.state === "mastered") return;
      if (!activeMap[plan.contentId]) activeMap[plan.contentId] = [];
      activeMap[plan.contentId].push(plan);
    });

    return (contents || []).map((item) => {
      const plans = activeMap[item.id] || [];
      const supportedModes = Array.isArray(item.supportedModes) ? item.supportedModes : ["scientific"];
      return {
        ...item,
        supportedModes,
        supportsRecitation: item.supportsRecitation !== false,
        inPlan: plans.length > 0,
        planCount: plans.length
      };
    });
  },

  buildLongSeries(contents) {
    const longItems = (contents || []).filter((item) => item.lengthTier === "long");
    if (!longItems.length) return null;

    const inPlanCount = longItems.filter((item) => item.inPlan).length;
    return {
      title: "长咒修持 · 系列入口",
      subtitle: "分段循序推进，每日一小步，长期更稳定。",
      total: longItems.length,
      inPlanCount
    };
  },

  pickContent(event) {
    const id = event.currentTarget.dataset.id;
    const picked = this.data.contents.find((item) => item.id === id);
    if (!picked) return;
    this.setData({
      picked,
      showLongTip: picked.lengthTier === "long" && picked.planDays > 7,
      modeCards: buildModeCards(picked)
    });
  },

  pickLongSeries() {
    const firstLong = this.getFestivalScopedContents(this.data.contents || [], this.data.activeFestival)
      .find((item) => item.lengthTier === "long");
    if (!firstLong) {
      wx.showToast({ title: "暂无长咒内容", icon: "none" });
      return;
    }
    this.setData({
      picked: firstLong,
      showLongTip: true,
      modeCards: buildModeCards(firstLong)
    });
  },

  applyFestivalFilter(event) {
    const festivalId = event.currentTarget.dataset.id || "";
    const activeFestival = (this.data.festivalOptions || []).find((item) => item.id === festivalId) || null;
    const filteredContents = this.filterContents(this.data.contents, this.data.activeFilter, activeFestival);
    this.setData({
      festivalFilterId: festivalId,
      activeFestival,
      filteredContents,
      longSeries: this.buildLongSeries(this.getFestivalScopedContents(this.data.contents, activeFestival))
    });
  },

  clearFestivalFilter() {
    const filteredContents = this.filterContents(this.data.contents, this.data.activeFilter, null);
    this.setData({
      festivalFilterId: "",
      activeFestival: null,
      filteredContents,
      longSeries: this.buildLongSeries(this.data.contents)
    });
  },

  closeSheet(callback) {
    this.setData({ picked: null, showLongTip: false, modeCards: [] }, callback);
  },

  acceptPlan(event) {
    if (!this.data.picked) return;
    const mode = event.currentTarget.dataset.mode || "scientific";
    createPlanWithFallback(this.data.picked, mode)
      .then((savedPlan) => {
        const contentId = this.data.picked.id;
        this.closeSheet(() => {
          wx.navigateTo({ url: `/pages/practice/index?id=${contentId}&planId=${savedPlan.id}` });
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "创建计划失败", icon: "none" });
      });
  },

  startRecitation() {
    if (!this.data.picked) return;
    const contentId = this.data.picked.id;
    const payload = {
      goalType: "daily",
      preferredPeriod: this.data.picked.recommendedRecitationTime || "morning",
      dailyTargetCount: 1
    };
    saveRecitationGoalWithFallback(this.data.picked, payload)
      .then((goal) => {
        this.closeSheet(() => {
          wx.navigateTo({
            url: `/pages/recitation/index?id=${contentId}&goalId=${(goal && goal.id) || ""}&period=${payload.preferredPeriod}`
          });
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "加入读诵失败", icon: "none" });
      });
  },

  goHome() {
    wx.reLaunch({ url: "/pages/home/index" });
  }
});
