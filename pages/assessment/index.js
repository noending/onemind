const {
  createMemoryAssessmentApi,
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
    loading: true,
    error: "",
    errorStage: "structure",
    structure: null,
    scopeOptions: [],
    selectedScopeIndex: 0,
    phase: "scope",
    assessment: null,
    quizItems: [],
    currentIndex: 0,
    answers: [],
    currentRevealed: false,
    elapsedSeconds: 0,
    remainingSeconds: QUIZ_SECONDS,
    isSubmitting: false
  },

  onLoad(options = {}) {
    const contentId = String(options.contentId || "").trim();
    const versionId = String(options.versionId || "").trim();
    if (!contentId || !versionId) {
      this.setData({ loading: false, error: "缺少内容或版本信息", errorStage: "structure" });
      return;
    }
    this.setData({ contentId, versionId });
    this.loadStructure();
  },

  onUnload() {
    this.stopTimer();
  },

  loadStructure() {
    const { contentId, versionId } = this.data;
    this.stopTimer();
    this.setData({ loading: true, error: "", errorStage: "structure", phase: "scope" });
    getContentStructureApi(contentId, versionId)
      .then((structure) => {
        const scopeOptions = buildScopeOptions(structure);
        this.setData({
          structure,
          scopeOptions,
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

  startAssessment() {
    const scope = this.data.scopeOptions[this.data.selectedScopeIndex];
    if (!scope || !scope.unitCount) {
      this.setData({ error: "所选范围暂无可测验句段", errorStage: "start" });
      return;
    }
    const { contentId, versionId } = this.data;
    const idempotencyKey = stableKey("assessment-start", [contentId, versionId, scope.scopeType, scope.scopeId]);
    this.setData({ isSubmitting: true, error: "", errorStage: "start" });
    createMemoryAssessmentApi({
      contentId,
      contentVersionId: versionId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      idempotencyKey
    }).then((assessment) => {
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
        isSubmitting: false
      });
      this.startTimer();
    }).catch((error) => {
      this.setData({
        isSubmitting: false,
        error: error.message || "测验启动失败，请重试",
        errorStage: "start"
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
    const idempotencyKey = stableKey("assessment-complete", [assessmentId]);
    this.setData({ isSubmitting: true, answers, error: "", errorStage: "submit" });
    recommendMemoryPlanApi({ assessmentId, answers, idempotencyKey })
      .then((recommendation) => {
        const scope = this.data.scopeOptions[this.data.selectedScopeIndex] || {};
        safeStorageSet(RECOMMENDATION_STORAGE_KEY, {
          recommendation,
          assessmentContext: {
            assessmentId,
            contentId: this.data.contentId,
            versionId: this.data.versionId,
            scopeType: scope.scopeType || "full",
            scopeId: scope.scopeId || null,
            timedOut: Boolean(timedOut)
          }
        });
        const query = [
          `assessmentId=${encodeURIComponent(assessmentId)}`,
          `contentId=${encodeURIComponent(this.data.contentId)}`,
          `versionId=${encodeURIComponent(this.data.versionId)}`,
          `scopeType=${encodeURIComponent(scope.scopeType || "full")}`,
          `scopeId=${encodeURIComponent(scope.scopeId || "")}`
        ].join("&");
        wx.redirectTo({ url: `/pages/plan-setup/index?${query}` });
      })
      .catch((error) => {
        this.setData({
          isSubmitting: false,
          error: error.message || "测验结果提交失败，请重试",
          errorStage: "submit"
        });
      });
  },

  retry() {
    if (this.data.errorStage === "start") return this.startAssessment();
    if (this.data.errorStage === "submit") return this.finishAssessment(false);
    return this.loadStructure();
  },

  goBack() {
    wx.navigateBack();
  }
});
