const { findContent } = require("../../common/content");
const { findCachedContent } = require("../../common/api");
const { completeRecitationWithFallback } = require("../../common/memory");

function getStatusBarHeight() {
  try {
    const windowInfo = typeof wx.getWindowInfo === "function"
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync();
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
  if (content.seriesId) {
    return "系列长文建议按节持诵，专注当下字音，不求快，重在心念清净相续。";
  }
  return "诵读时心念清净，逐句体会其义。可配合呼吸节奏，每段稍作停顿，让经文沉入心识。";
}

Page({
  data: {
    content: null,
    goalId: "",
    period: "morning",
    headerTop: 54,
    roundCount: 1,
    completed: false,
    playing: false,
    liked: false,
    looping: true,
    speed: 1,
    progress: 0.18,
    activeLine: 0,
    practiceTip: "读诵不等于背会，先稳定每日接触，让经文慢慢沉入心识。",
    currentTimeText: "0:00",
    totalTimeText: "0:00",
    dailyDurationText: "3分"
  },

  onLoad(options) {
    const content = findContent(options.id) || findCachedContent(options.id) || null;
    const planDays = Number((content && content.planDays) || 1);
    this.setData({
      content,
      goalId: options.goalId || "",
      period: options.period || (content && content.recommendedRecitationTime) || "morning",
      headerTop: getStatusBarHeight() + 16,
      practiceTip: buildPracticeTip(content),
      dailyDurationText: `${Math.max(3, planDays * 2)}分`
    }, () => this.syncPlaybackView());
  },

  onUnload() {
    this.stopPlaybackTicker();
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
      durationSeconds: this.data.roundCount * 120
    }).then(() => {
      this.setData({ completed: true });
      wx.showToast({ title: "读诵已记录", icon: "success" });
    }).catch(() => {
      wx.showToast({ title: "记录失败", icon: "none" });
    });
  },

  toggleLike() {
    const liked = !this.data.liked;
    this.setData({ liked });
    wx.showToast({
      title: liked ? "已加入收藏" : "已取消收藏",
      icon: "none"
    });
  },

  togglePlay() {
    const playing = !this.data.playing;
    this.setData({ playing });
    if (playing) {
      wx.showToast({ title: "开始播放唱诵", icon: "none" });
      this.startPlaybackTicker();
    } else {
      this.stopPlaybackTicker();
    }
  },

  toggleLooping() {
    this.setData({ looping: !this.data.looping });
  },

  cycleSpeed() {
    const options = [0.75, 1, 1.25, 1.5];
    const current = Number(this.data.speed) || 1;
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    this.setData({ speed: next }, () => this.syncPlaybackView());
  },

  skipBackward() {
    this.adjustProgress(-0.08);
  },

  skipForward() {
    this.adjustProgress(0.08);
  },

  adjustProgress(delta) {
    const current = Number(this.data.progress) || 0;
    const next = Math.max(0, Math.min(1, current + delta));
    this.setData({ progress: next }, () => this.syncPlaybackView());
  },

  onSliderChanging(event) {
    const value = Number(event.detail.value || 0);
    const progress = Math.max(0, Math.min(1, value / 100));
    this.setData({ progress }, () => this.syncPlaybackView());
  },

  onSliderChange(event) {
    this.onSliderChanging(event);
  },

  startPlaybackTicker() {
    this.stopPlaybackTicker();
    this._ticker = setInterval(() => {
      const speed = Number(this.data.speed) || 1;
      let progress = (Number(this.data.progress) || 0) + (0.012 * speed);
      if (progress >= 1) {
        if (this.data.looping) {
          progress = 0;
        } else {
          progress = 1;
          this.setData({ playing: false });
          this.stopPlaybackTicker();
        }
      }
      this.setData({ progress }, () => this.syncPlaybackView());
    }, 500);
  },

  stopPlaybackTicker() {
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
  },

  syncPlaybackView() {
    const content = this.data.content;
    const segments = content && Array.isArray(content.segments) ? content.segments : [];
    const segmentCount = Math.max(segments.length, 1);
    const speed = Number(this.data.speed) || 1;
    const totalSec = Math.max(1, Math.round((segmentCount * 4.5) / speed));
    const progress = Math.max(0, Math.min(1, Number(this.data.progress) || 0));
    const curSec = Math.round(totalSec * progress);
    const activeLine = Math.min(segmentCount - 1, Math.floor(progress * segmentCount));

    this.setData({
      activeLine: Math.max(0, activeLine),
      totalTimeText: this.formatTime(totalSec),
      currentTimeText: this.formatTime(curSec)
    });
  },

  formatTime(totalSeconds) {
    const sec = Math.max(0, Number(totalSeconds) || 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
});
