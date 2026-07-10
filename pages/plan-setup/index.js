const { createMemoryPlanApi } = require("../../common/api");
const { buildRecommendationCards } = require("../../common/plan-setup");
const { normalizeTargetDays, recommendPlan } = require("../../common/adaptive-memory");

const RECOMMENDATION_STORAGE_KEY = "oneMind.memoryAssessmentRecommendation";
const DAILY_MINUTES = [10, 15, 20, 30];

function stableKey(prefix, parts) {
  return `${prefix}-${parts.map((part) => String(part || "none")).join("-")}`.slice(0, 180);
}

function readStoredContext() {
  try {
    return wx.getStorageSync(RECOMMENDATION_STORAGE_KEY) || null;
  } catch (error) {
    return null;
  }
}

Page({
  data: {
    loading: true,
    error: "",
    recommendation: null,
    assessmentContext: null,
    cards: [],
    dailyMinutesOptions: DAILY_MINUTES,
    dailyMinutes: 15,
    targetDays: 14,
    customDays: "",
    workload: null,
    isSubmitting: false
  },

  onLoad(options = {}) {
    const stored = readStoredContext();
    const context = stored && stored.assessmentContext;
    const matches = context
      && String(context.assessmentId) === String(options.assessmentId || "")
      && String(context.contentId) === String(options.contentId || "")
      && String(context.versionId) === String(options.versionId || "");
    if (!stored || !stored.recommendation || !matches) {
      this.setData({ loading: false, error: "测验推荐已失效，请重新完成测验。" });
      return;
    }
    const recommendation = stored.recommendation;
    const dailyMinutes = Number(recommendation.dailyMinutes || 15);
    const targetDays = normalizeTargetDays(recommendation.recommendedTargetDays || recommendation.targetDays || 14);
    this.setData({
      loading: false,
      recommendation,
      assessmentContext: context,
      cards: buildRecommendationCards({ ...recommendation, dailyMinutes }),
      dailyMinutes,
      targetDays,
      workload: this.buildWorkload(recommendation, targetDays, dailyMinutes)
    });
  },

  buildWorkload(recommendation, targetDays, dailyMinutes) {
    const plan = recommendPlan({
      unitCount: recommendation.unitCount || recommendation.totalUnits,
      familiarityLevel: recommendation.familiarityLevel,
      targetDays,
      dailyMinutes
    });
    return {
      ...plan,
      estimatedReviewUnits: Math.min(
        Math.max(1, Number(recommendation.unitCount || recommendation.totalUnits || 1)),
        plan.newUnitsPerDay * 2
      )
    };
  },

  setTargetDays(event) {
    if (this.data.isSubmitting) return;
    const targetDays = normalizeTargetDays(event.currentTarget.dataset.days);
    this.setData({
      targetDays,
      customDays: "",
      workload: this.buildWorkload(this.data.recommendation, targetDays, this.data.dailyMinutes)
    });
  },

  setCustomDays(event) {
    if (this.data.isSubmitting) return;
    const customDays = String(event.detail.value || "").replace(/\D/g, "").slice(0, 2);
    const numeric = Number(customDays);
    const targetDays = numeric ? normalizeTargetDays(numeric) : this.data.targetDays;
    this.setData({
      customDays,
      targetDays,
      workload: this.buildWorkload(this.data.recommendation, targetDays, this.data.dailyMinutes)
    });
  },

  normalizeCustomDays() {
    if (this.data.isSubmitting || !this.data.customDays) return;
    const targetDays = normalizeTargetDays(this.data.customDays);
    this.setData({
      customDays: String(targetDays),
      targetDays,
      workload: this.buildWorkload(this.data.recommendation, targetDays, this.data.dailyMinutes)
    });
  },

  chooseDailyMinutes(event) {
    if (this.data.isSubmitting) return;
    const dailyMinutes = Number(event.currentTarget.dataset.minutes);
    this.setData({
      dailyMinutes,
      cards: buildRecommendationCards({ ...this.data.recommendation, dailyMinutes }),
      workload: this.buildWorkload(this.data.recommendation, this.data.targetDays, dailyMinutes)
    });
  },

  createPlan() {
    const { assessmentContext, recommendation, targetDays, dailyMinutes } = this.data;
    if (this.data.isSubmitting || !assessmentContext || !recommendation) return;
    const idempotencyKey = stableKey("adaptive-plan", [assessmentContext.assessmentId, targetDays, dailyMinutes]);
    this.setData({ isSubmitting: true, error: "" });
    createMemoryPlanApi({
      contentId: assessmentContext.contentId,
      contentVersionId: assessmentContext.versionId,
      scopeType: assessmentContext.scopeType,
      scopeId: assessmentContext.scopeId,
      targetDays,
      dailyMinutes,
      familiarityLevel: recommendation.familiarityLevel,
      strategy: "assessment",
      idempotencyKey
    }).then((plan) => {
      if (!plan || !plan.id) throw new Error("计划创建结果无效");
      wx.redirectTo({
        url: `/pages/practice/index?id=${encodeURIComponent(assessmentContext.contentId)}&planId=${encodeURIComponent(plan.id)}`
      });
    }).catch((error) => {
      this.setData({ isSubmitting: false, error: error.message || "计划创建失败，请重试" });
    });
  },

  retryAssessment() {
    wx.navigateBack();
  },

  goBack() {
    wx.navigateBack();
  }
});
