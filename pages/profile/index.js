const {
  getPlanRows,
  getProgressItems,
  getGrowthOverviewWithFallback,
  listRecitationGoalsWithFallback,
  syncPlansFromBackend
} = require("../../common/memory");
const {
  clearAuthSession,
  getAuthUser,
  getCurrentUser,
  isBackendEnabled,
  loginWithWechat
} = require("../../common/api");

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
    recitationGoals: [],
    orders: [
      {
        id: "o1",
        title: "六字大明咒 · 唱诵冥想",
        date: "2026-05-20",
        price: "¥12",
        status: "已完成",
        color: "#7E2A1C"
      },
      {
        id: "o2",
        title: "唐卡 · 度母系列（4 张）",
        date: "2026-05-15",
        price: "¥9.9",
        status: "已完成",
        color: "#8B5A1E"
      },
      {
        id: "o3",
        title: "佛菩萨圣诞日历",
        date: "2026-04-28",
        price: "¥12",
        status: "已完成",
        color: "#A37049"
      }
    ],
    plans: [],
    reviewingPlans: [],
    riskPlans: [],
    donePlans: [],
    selectedPlanId: "",
    selectedPlanTitle: "",
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
      this.refreshGrowth();
      this.refreshAuth();
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
    Promise.all([
      getGrowthOverviewWithFallback(),
      listRecitationGoalsWithFallback()
    ]).then(([growthOverview, recitationGoals]) => {
      const nextOverview = growthOverview || this.data.growthOverview;
      const milestone = nextOverview.latestMilestone;
      this.setData({
        growthOverview: {
          ...nextOverview,
          latestMilestone: milestone ? {
            ...milestone,
            achievedAt: milestone.achievedAt ? String(milestone.achievedAt).slice(0, 10) : ""
          } : null
        },
        recitationGoals: recitationGoals || []
      });
    });
  },

  refreshAuth() {
    const cachedUser = getAuthUser();
    if (!isBackendEnabled()) {
      this.setData({
        auth: {
          loggedIn: false,
          nickname: (cachedUser && cachedUser.nickname) || "修行者",
          avatarUrl: (cachedUser && cachedUser.avatarUrl) || "",
          avatarInitial: ((cachedUser && cachedUser.nickname) || "行").slice(0, 1),
          statusText: "专注修持，无需复杂设置"
        }
      });
      return;
    }

    getCurrentUser().then((session) => {
      const loggedIn = Boolean(session.loggedIn);
      this.setData({
        auth: {
          loggedIn,
          nickname: (session.user && session.user.nickname) || "修行者",
          avatarUrl: (session.user && session.user.avatarUrl) || "",
          avatarInitial: (((session.user && session.user.nickname) || "行")).slice(0, 1),
          statusText: loggedIn ? "已完成微信授权" : "可选：微信授权同步跨端进度"
        }
      });
    });
  },

  authorizeWechatLogin() {
    if (!isBackendEnabled()) {
      wx.showToast({ title: "当前为本地模式", icon: "none" });
      return;
    }

    wx.getUserProfile({
      desc: "用于同步你的修持进度",
      success: (profile) => {
        loginWithWechat(profile.userInfo || {}).then((session) => {
          const user = session.user || {};
          this.setData({
            auth: {
              loggedIn: true,
              nickname: user.nickname || "修行者",
              avatarUrl: user.avatarUrl || "",
              avatarInitial: (user.nickname || "行").slice(0, 1),
              statusText: "已完成微信授权"
            }
          });
          wx.showToast({ title: "授权成功", icon: "success" });
        }).catch((error) => {
          wx.showToast({ title: error.message || "授权失败", icon: "none" });
        });
      },
      fail: () => {
        wx.showToast({ title: "已取消授权", icon: "none" });
      }
    });
  },

  logoutWechat() {
    clearAuthSession();
    this.setData({
      auth: {
        loggedIn: false,
        nickname: "修行者",
        avatarUrl: "",
        avatarInitial: "行",
        statusText: "已退出微信授权"
      }
    });
    wx.showToast({ title: "已退出", icon: "success" });
  },

  onAuthAction() {
    if (!this.data.auth.loggedIn) {
      this.authorizeWechatLogin();
      return;
    }
    wx.showToast({ title: "设置开发中", icon: "none" });
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

    const normalized = normalizeCurveProgress(plan);
    const built = buildCurveData(normalized.totalDay);
    this.setData({
      selectedPlanTitle: plan.title || "",
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
      const dprInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
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
  },

  openOrder(event) {
    const id = event.currentTarget.dataset.id;
    const order = (this.data.orders || []).find((item) => item.id === id);
    if (!order) return;
    wx.showToast({
      title: `${order.title} · ${order.status}`,
      icon: "none"
    });
  }
});
