const { createMemoryPlanApi, ensureLogin } = require("../../common/api");
const { buildRecommendationCards, normalizeCustomTargetDays } = require("../../common/plan-setup");
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

function isAuthRequired(error) {
  return Boolean(error && (error.code === "AUTH_REQUIRED" || error.statusCode === 401));
}

Page({
  data: {
    loading: true,
    fatalContextError: "",
    submitError: "",
    authRequired: false,
    routeContentId: "",
    routeVersionId: "",
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
    const routeContentId = String(options.contentId || "");
    const routeVersionId = String(options.versionId || "");
    this.setData({ routeContentId, routeVersionId });
    const stored = readStoredContext();
    const context = stored && stored.assessmentContext;
    const unitCount = Number(context && context.unitCount);
    const matches = context
      && String(context.assessmentId) === String(options.assessmentId || "")
      && String(context.contentId) === String(options.contentId || "")
      && String(context.versionId) === String(options.versionId || "");
    if (!stored || !stored.recommendation || !matches || !Number.isFinite(unitCount) || unitCount <= 0) {
      this.setData({ loading: false, fatalContextError: "测验推荐或范围信息已失效，请重新完成测验。" });
      return;
    }
    const recommendation = { ...stored.recommendation, unitCount };
    const workloadContext = {
      ...context,
      familiarityLevel: recommendation.familiarityLevel
    };
    const dailyMinutes = Number(recommendation.dailyMinutes || 15);
    const targetDays = normalizeTargetDays(recommendation.recommendedTargetDays || recommendation.targetDays || 14);
    this.setData({
      loading: false,
      recommendation,
      assessmentContext: workloadContext,
      cards: buildRecommendationCards({ ...recommendation, dailyMinutes }),
      dailyMinutes,
      targetDays,
      workload: this.buildWorkload(workloadContext, targetDays, dailyMinutes)
    });
  },

  buildWorkload(context, targetDays, dailyMinutes) {
    const unitCount = Number(context && context.unitCount);
    const plan = recommendPlan({
      unitCount,
      familiarityLevel: context && context.familiarityLevel,
      targetDays,
      dailyMinutes
    });
    return {
      ...plan,
      estimatedReviewUnits: Math.min(
        unitCount,
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
      workload: this.buildWorkload(this.data.assessmentContext, targetDays, this.data.dailyMinutes)
    });
  },

  setCustomDays(event) {
    if (this.data.isSubmitting) return;
    const customDays = String(event.detail.value || "").replace(/\D/g, "").slice(0, 3);
    this.setData({ customDays });
  },

  normalizeCustomDays() {
    if (this.data.isSubmitting || !this.data.customDays) return null;
    const normalized = normalizeCustomTargetDays(this.data.customDays);
    if (!normalized) return null;
    this.setData({
      customDays: normalized.displayValue,
      targetDays: normalized.targetDays,
      workload: this.buildWorkload(this.data.assessmentContext, normalized.targetDays, this.data.dailyMinutes)
    });
    return normalized.targetDays;
  },

  chooseDailyMinutes(event) {
    if (this.data.isSubmitting) return;
    const dailyMinutes = Number(event.currentTarget.dataset.minutes);
    this.setData({
      dailyMinutes,
      cards: buildRecommendationCards({ ...this.data.recommendation, dailyMinutes }),
      workload: this.buildWorkload(this.data.assessmentContext, this.data.targetDays, dailyMinutes)
    });
  },

  createPlan() {
    const { assessmentContext, recommendation, dailyMinutes } = this.data;
    if (this.data.isSubmitting || !assessmentContext || !recommendation || this.data.fatalContextError) return;
    const targetDays = this.normalizeCustomDays() || this.data.targetDays;
    const idempotencyKey = stableKey("adaptive-plan", [assessmentContext.assessmentId, targetDays, dailyMinutes]);
    this.setData({ isSubmitting: true, submitError: "", authRequired: false });
    ensureLogin({ message: "请先在我的页面完成微信授权，再创建计划" })
      .then(() => createMemoryPlanApi({
        contentId: assessmentContext.contentId,
        contentVersionId: assessmentContext.versionId,
        scopeType: assessmentContext.scopeType,
        scopeId: assessmentContext.scopeId,
        targetDays,
        dailyMinutes,
        familiarityLevel: recommendation.familiarityLevel,
        strategy: "assessment",
        idempotencyKey
      }))
      .then((plan) => {
      if (!plan || !plan.id) throw new Error("计划创建结果无效");
      wx.redirectTo({
        url: `/pages/practice/index?id=${encodeURIComponent(assessmentContext.contentId)}&planId=${encodeURIComponent(plan.id)}`
      });
    }).catch((error) => {
      this.setData({
        isSubmitting: false,
        submitError: error.message || "计划创建失败，请重试",
        authRequired: isAuthRequired(error)
      });
    });
  },

  retryAssessment() {
    const context = this.data.assessmentContext || {
      contentId: this.data.routeContentId,
      versionId: this.data.routeVersionId
    };
    if (!context.contentId || !context.versionId) return;
    wx.redirectTo({
      url: `/pages/assessment/index?contentId=${encodeURIComponent(context.contentId)}&versionId=${encodeURIComponent(context.versionId)}`
    });
  },

  openAuthorization() {
    wx.navigateTo({ url: "/pages/profile/index" });
  },

  goBack() {
    wx.navigateBack();
  }
});
