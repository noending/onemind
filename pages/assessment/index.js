const {
  createMemoryAssessmentApi,
  ensureLogin,
  getContentStructureApi,
  recommendMemoryPlanApi
} = require("../../common/api");
const { buildScopeOptions } = require("../../common/plan-setup");

const RECOMMENDATION_STORAGE_KEY = "oneMind.memoryAssessmentRecommendation";
const QUIZ_SECONDS = 60;

function safeStorageSet(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    // The next page exposes a recoverable state when local storage is unavailable.
  }
}

function stableKey(prefix, parts) {
  return `${prefix}-${parts.map((part) => String(part || "none")).join("-")}`.slice(0, 180);
}

function createAttemptId() {
  return `attempt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAuthRequired(error) {
  return Boolean(error && (error.code === "AUTH_REQUIRED" || error.statusCode === 401));
}

function makeUnitMap(structure) {
  const units = {};
  (structure && structure.sections || []).forEach((section) => {
    (section.units || []).forEach((unit) => {
      units[unit.id] = unit;
    });
  });
  return units;
}

function displayItem(item, unit) {
  const fullText = String((unit && unit.text) || item.text || "");
  return {
    ...item,
    fullText,
    cue: String((unit && unit.firstCharacterCue) || item.firstCharacterCue || fullText.charAt(0) || "…").charAt(0)
  };
}

Page({
  data: {
    contentId: "",
    versionId: "",
    legacyPlanId: "",
    attemptId: "",
    loading: true,
    error: "",
    errorStage: "structure",
    authRequired: false,
    structure: null,
    scopeOptions: [],
    totalUnitCount: 0,
    isEmpty: false,
    selectedScopeIndex: 0,
    phase: "scope",
    assessment: null,
    quizItems: [],
    currentIndex: 0,
    answers: [],
    currentRevealed: false,
    elapsedSeconds: 0,
    remainingSeconds: QUIZ_SECONDS,
    isSubmitting: false,
    pendingTimedOut: null
  },

  onLoad(options = {}) {
    const contentId = String(options.contentId || "").trim();
    const versionId = String(options.versionId || "").trim();
    const legacyPlanId = String(options.legacyPlanId || "").trim();
    if (!contentId || !versionId) {
      this.setData({ loading: false, error: "缺少内容或版本信息", errorStage: "structure" });
      return;
    }
    this.setData({ contentId, versionId, legacyPlanId, attemptId: createAttemptId() });
    this.loadStructure();
  },

  onUnload() {
    this.stopTimer();
  },

  onShow() {
    if (!this.data.authRequired || this.authRecoveryInFlight) return Promise.resolve();
    this.authRecoveryInFlight = true;
    return ensureLogin({ message: "请先在我的页面完成微信授权" })
      .then(() => {
        if (!this.data.authRequired) return;
        const { errorStage, pendingTimedOut } = this.data;
        this.setData({ error: "", authRequired: false });
        if (errorStage === "start") this.startAssessment();
        if (errorStage === "submit") this.finishAssessment(pendingTimedOut);
      })
      .catch((error) => {
        this.setData({
          error: error.message || "微信授权尚未完成",
          authRequired: isAuthRequired(error)
        });
      })
      .finally(() => {
        this.authRecoveryInFlight = false;
      });
  },

  loadStructure() {
    const { contentId, versionId } = this.data;
    this.stopTimer();
    this.setData({
      loading: true,
      error: "",
      errorStage: "structure",
      authRequired: false,
      phase: "scope",
      pendingTimedOut: null
    });
    getContentStructureApi(contentId, versionId)
      .then((structure) => {
        const scopeOptions = buildScopeOptions(structure);
        const totalUnitCount = Number(scopeOptions[0] && scopeOptions[0].unitCount || 0);
        this.setData({
          structure,
          scopeOptions,
          totalUnitCount,
          isEmpty: totalUnitCount <= 0,
          selectedScopeIndex: 0,
          loading: false
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: error.message || "无法载入已审核结构",
          errorStage: "structure"
        });
      });
  },

  chooseScope(event) {
    if (this.data.loading || this.data.isSubmitting) return;
    this.setData({ selectedScopeIndex: Number(event.currentTarget.dataset.index || 0) });
  },

  getSelectedScope() {
    return buildScopeOptions(this.data.structure)[this.data.selectedScopeIndex] || null;
  },

  startAssessment() {
    const scope = this.getSelectedScope();
    if (!scope || Number(scope.unitCount) <= 0) {
      this.setData({ error: "所选范围暂无可测验句段", errorStage: "start" });
      return;
    }
    const { attemptId, contentId, versionId } = this.data;
    const idempotencyKey = stableKey("assessment-start", [attemptId, contentId, versionId, scope.scopeType, scope.scopeId]);
    this.setData({ isSubmitting: true, error: "", errorStage: "start", authRequired: false });
    ensureLogin({ message: "请先在我的页面完成微信授权，再开始测验" })
      .then(() => createMemoryAssessmentApi({
        contentId,
        contentVersionId: versionId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        idempotencyKey
      }))
      .then((assessment) => {
      const unitMap = makeUnitMap(this.data.structure);
      const quizItems = (assessment.items || []).map((item) => displayItem(item, unitMap[item.memoryUnitId]));
      if (!quizItems.length) throw new Error("当前范围没有可测验题目");
      this.setData({
        assessment,
        quizItems,
        phase: "quiz",
        currentIndex: 0,
        answers: [],
        currentRevealed: false,
        elapsedSeconds: 0,
        remainingSeconds: QUIZ_SECONDS,
        isSubmitting: false,
        pendingTimedOut: null
      });
      this.startTimer();
    }).catch((error) => {
      this.setData({
        isSubmitting: false,
        error: error.message || "测验启动失败，请重试",
        errorStage: "start",
        authRequired: isAuthRequired(error)
      });
    });
  },

  startTimer() {
    this.stopTimer();
    this.currentStartedAt = Date.now();
    this.quizStartedAt = Date.now();
    this.timer = setInterval(() => {
      const elapsedSeconds = Math.min(QUIZ_SECONDS, Math.floor((Date.now() - this.quizStartedAt) / 1000));
      const remainingSeconds = Math.max(0, QUIZ_SECONDS - elapsedSeconds);
      this.setData({ elapsedSeconds, remainingSeconds });
      if (remainingSeconds === 0) {
        this.stopTimer();
        this.finishAssessment(true);
      }
    }, 250);
  },

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  revealCurrent() {
    if (this.data.phase !== "quiz" || this.data.isSubmitting) return;
    this.setData({ currentRevealed: true });
  },

  answerCurrent(event) {
    if (this.data.phase !== "quiz" || this.data.isSubmitting) return;
    const item = this.data.quizItems[this.data.currentIndex];
    if (!item) return;
    const result = event.currentTarget.dataset.result;
    const answer = {
      memoryUnitId: item.memoryUnitId,
      result,
      revealed: this.data.currentRevealed,
      latencyMs: Math.max(0, Date.now() - this.currentStartedAt)
    };
    const answers = [...this.data.answers, answer];
    const nextIndex = this.data.currentIndex + 1;
    if (nextIndex >= this.data.quizItems.length) {
      this.setData({ answers });
      this.finishAssessment(false);
      return;
    }
    this.currentStartedAt = Date.now();
    this.setData({ answers, currentIndex: nextIndex, currentRevealed: false });
  },

  finishAssessment(timedOut) {
    if (this.data.isSubmitting || !this.data.assessment) return;
    this.stopTimer();
    const pendingTimedOut = this.data.pendingTimedOut === null
      ? Boolean(timedOut)
      : this.data.pendingTimedOut;
    const answeredIds = new Set(this.data.answers.map((answer) => answer.memoryUnitId));
    const answers = [
      ...this.data.answers,
      ...this.data.quizItems
        .filter((item) => !answeredIds.has(item.memoryUnitId))
        .map((item) => ({
          memoryUnitId: item.memoryUnitId,
          result: "cannot",
          revealed: false,
          latencyMs: 0
        }))
    ];
    const assessmentId = this.data.assessment.id;
    const idempotencyKey = stableKey("assessment-complete", [this.data.attemptId, assessmentId]);
    this.setData({
      isSubmitting: true,
      answers,
      error: "",
      errorStage: "submit",
      authRequired: false,
      pendingTimedOut
    });
    recommendMemoryPlanApi({ assessmentId, answers, idempotencyKey })
      .then((recommendation) => {
        const scope = this.getSelectedScope() || {};
        safeStorageSet(RECOMMENDATION_STORAGE_KEY, {
          recommendation,
          assessmentContext: {
            assessmentId,
            contentId: this.data.contentId,
            versionId: this.data.versionId,
            scopeType: scope.scopeType || "full",
            scopeId: scope.scopeId || null,
            unitCount: Number(scope.unitCount || 0),
            timedOut: pendingTimedOut,
            legacyPlanId: this.data.legacyPlanId || ""
          }
        });
        const query = [
          `assessmentId=${encodeURIComponent(assessmentId)}`,
          `contentId=${encodeURIComponent(this.data.contentId)}`,
          `versionId=${encodeURIComponent(this.data.versionId)}`,
          `scopeType=${encodeURIComponent(scope.scopeType || "full")}`,
          `scopeId=${encodeURIComponent(scope.scopeId || "")}`,
          `legacyPlanId=${encodeURIComponent(this.data.legacyPlanId || "")}`
        ].join("&");
        wx.redirectTo({ url: `/pages/plan-setup/index?${query}` });
      })
      .catch((error) => {
        this.setData({
          isSubmitting: false,
          error: error.message || "测验结果提交失败，请重试",
          errorStage: "submit",
          authRequired: isAuthRequired(error)
        });
      });
  },

  retry() {
    if (this.data.authRequired) return;
    if (this.data.errorStage === "start") return this.startAssessment();
    if (this.data.errorStage === "submit") return this.finishAssessment();
    return this.loadStructure();
  },

  openAuthorization() {
    wx.navigateTo({ url: "/pages/profile/index?auth=1" });
  },

  goBack() {
    wx.navigateBack();
  }
});
