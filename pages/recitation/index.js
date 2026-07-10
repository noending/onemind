const { findContent } = require("../../common/content");
const { findCachedContent } = require("../../common/api");
const { completeRecitationWithFallback } = require("../../common/memory");

function getStatusBarHeight() {
  try {
    const windowInfo = typeof wx.getWindowInfo === "function"
      ? wx.getWindowInfo()
      : {};
    const statusBarHeight = Number(windowInfo.statusBarHeight || 0);

    let capsuleTop = 0;
    if (typeof wx.getMenuButtonBoundingClientRect === "function") {
      const capsuleRect = wx.getMenuButtonBoundingClientRect() || {};
      capsuleTop = Number(capsuleRect.top || 0);
    }

    return Math.max(statusBarHeight, capsuleTop, 20);
  } catch (error) {
    return 20;
  }
}

function buildPracticeTip(content) {
  if (!content) {
    return "读诵不等于背会，先稳定每日接触，让经文慢慢沉入心识。";
  }
  if (content.lengthTier === "long" || content.lengthLevel === "long") {
    return "长咒先按短句段建立熟悉度，每日固定少量推进；先求准确与稳定，再逐步连成完整读诵。";
  }
  return "诵读时心念清净，逐句体会其义。可配合呼吸节奏，每段稍作停顿，让经文沉入心识。";
}

function buildDailySegmentText(content) {
  const total = Array.isArray(content && content.segments) ? content.segments.length : 0;
  const days = Math.max(1, Number(content && content.planDays || 1));
  return `${Math.max(1, Math.ceil(total / days))}句/天`;
}

Page({
  data: {
    content: null,
    goalId: "",
    period: "morning",
    headerTop: 54,
    roundCount: 1,
    completed: false,
    liked: false,
    practiceTip: "读诵不等于背会，先稳定每日接触，让经文慢慢沉入心识。",
    dailySegmentText: "1句/天"
  },

  onLoad(options) {
    const content = findContent(options.id) || findCachedContent(options.id) || null;
    this.setData({
      content,
      goalId: options.goalId || "",
      period: options.period || (content && content.recommendedRecitationTime) || "morning",
      headerTop: getStatusBarHeight() + 16,
      practiceTip: buildPracticeTip(content),
      dailySegmentText: buildDailySegmentText(content)
    });
  },

  goBack() {
    wx.navigateBack();
  },

  increaseRound() {
    this.setData({ roundCount: Math.min(9, Number(this.data.roundCount || 1) + 1) });
  },

  decreaseRound() {
    this.setData({ roundCount: Math.max(1, Number(this.data.roundCount || 1) - 1) });
  },

  completeRecitation() {
    if (!this.data.content || this.data.completed) return;
    completeRecitationWithFallback(this.data.content, {
      goalId: this.data.goalId,
      sessionType: this.data.goalId ? "daily" : "free",
      period: this.data.period,
      roundCount: this.data.roundCount,
      durationSeconds: this.data.roundCount * Math.max(60, (this.data.content.segments || []).length * 6)
    }).then(() => {
      this.setData({ completed: true });
      wx.showToast({ title: "读诵已记录", icon: "success" });
    }).catch((error) => {
      wx.showToast({ title: error.message || "记录失败", icon: "none" });
    });
  },

  toggleLike() {
    const liked = !this.data.liked;
    this.setData({ liked });
    wx.showToast({
      title: liked ? "已加入收藏" : "已取消收藏",
      icon: "none"
    });
  }
});
