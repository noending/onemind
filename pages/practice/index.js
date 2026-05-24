const { contents, findContent, recommendNext } = require("../../common/content");
const { createMemoryPlan, getPlan, firstOpenTask, completeTask, upsertPlan } = require("../../common/memory");

function getStatusBarHeight() {
  try {
    if (typeof wx.getWindowInfo === "function") {
      return wx.getWindowInfo().statusBarHeight || 0;
    }
    return wx.getSystemInfoSync().statusBarHeight || 0;
  } catch (error) {
    return 0;
  }
}

function makeDisplaySegments(content, method, revealed) {
  return content.segments.map((segment, index) => {
    const isRevealed = revealed.includes(index) || method === "拆段跟读";

    if (method === "拆段跟读" || isRevealed) {
      return { i: index, text: segment, hint: "", revealed: true };
    }

    if (method === "首字提示") {
      return { i: index, text: `${segment[0]}__`, hint: "点击显示全句", revealed: false };
    }

    if (method === "遮挡回忆") {
      return { i: index, text: "•".repeat(segment.length), hint: "在心中默诵后揭开", revealed: false };
    }

    const mid = Math.max(1, Math.floor(segment.length / 2));
    return {
      i: index,
      text: `${segment.slice(0, mid)}${"＿".repeat(segment.length - mid)}`,
      hint: "想出后半段，再揭开核对",
      revealed: false
    };
  });
}

function calcProgress(content, revealed) {
  if (!content || !content.segments || !content.segments.length) return 0;
  return Math.min(100, Math.round((revealed.length / content.segments.length) * 100));
}

Page({
  data: {
    content: contents[0],
    method: "拆段跟读",
    currentDay: 1,
    totalDays: 1,
    planId: "",
    progressPct: 0,
    headerTop: 54,
    revealed: [],
    displaySegments: [],
    finished: false,
    recommendation: null
  },

  onLoad(options) {
    const content = findContent(options.id) || contents[0];
    const plan = options.planId ? getPlan(options.planId) : null;
    const task = firstOpenTask(plan);
    const method = task ? task.method : this.data.method;
    const headerTop = getStatusBarHeight() + 16;
    this.setData({
      content,
      method,
      currentDay: task ? task.dayIndex + 1 : 1,
      totalDays: plan ? plan.totalDays : content.planDays,
      planId: plan ? plan.id : "",
      headerTop,
      progressPct: calcProgress(content, []),
      displaySegments: makeDisplaySegments(content, method, [])
    });
  },

  reveal(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (this.data.revealed.includes(index)) return;
    const revealed = [...this.data.revealed, index];
    this.setData({
      revealed,
      progressPct: calcProgress(this.data.content, revealed),
      displaySegments: makeDisplaySegments(this.data.content, this.data.method, revealed)
    });
  },

  goBack() {
    wx.navigateBack();
  },

  needsWork() {
    this.finishPractice("needsWork", "明日再练");
  },

  stronger() {
    this.finishPractice("stronger", "已记录");
  },

  mastered() {
    this.finishPractice("mastered", "今日圆满");
  },

  finishPractice(result, title) {
    if (this.data.finished) return;
    let nextPlan = null;
    if (this.data.planId) {
      nextPlan = completeTask(this.data.planId, result);
    }
    const isComplete = nextPlan
      ? nextPlan.state === "mastered"
      : result === "mastered";
    const recommendation = isComplete ? recommendNext(this.data.content.id) : null;

    this.setData({
      progressPct: 100,
      finished: true,
      recommendation
    });
    wx.showToast({ title, icon: result === "needsWork" ? "none" : "success" });
  },

  startRecommendation() {
    if (!this.data.recommendation) return;
    const plan = createMemoryPlan(this.data.recommendation);
    const savedPlan = upsertPlan(plan);
    wx.redirectTo({
      url: `/pages/practice/index?id=${this.data.recommendation.id}&planId=${savedPlan.id}`
    });
  }
});
