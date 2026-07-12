const { contents, findContent } = require("../../common/content");
const {
  completeStudyTaskItemApi,
  ensureLogin,
  getCachedContents,
  getLocalContents,
  getTodayStudyTaskApi,
  isBackendEnabled
} = require("../../common/api");
const { createPracticeSession, advancePracticeStep } = require("../../common/practice-session");
const {
  createPlanWithFallback,
  getPlan,
  firstOpenTask,
  completeTaskWithFallback,
  growthStageFromScore,
  syncPlansFromBackend
} = require("../../common/memory");

const TRAINING_STEPS = [
  { key: "read", title: "跟读", method: "拆段跟读" },
  { key: "first", title: "首字提示", method: "首字提示" },
  { key: "mask", title: "遮挡回忆", method: "遮挡回忆" },
  { key: "blank", title: "填空回填", method: "填空复现" },
  { key: "feedback", title: "本次反馈", method: "本次反馈" }
];

const ADAPTIVE_STEP_TITLES = {
  study: "完整学习",
  first_character: "首字提示",
  free_recall: "自由回忆",
  check: "核对",
  grade: "本次评分"
};

function todayDate() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isAdaptivePlan(plan) {
  return Boolean(plan && plan.contentVersionId && plan.adaptiveStatus);
}

function pendingTask(task) {
  return {
    ...task,
    items: Array.isArray(task && task.items)
      ? task.items.filter((item) => item && item.status === "pending")
      : []
  };
}

function adaptiveAttemptKey(task, item) {
  return `adaptive-practice-${task && task.id}-${item && item.id}`.slice(0, 180);
}

function adaptivePrompt(session) {
  const unit = session && session.activeUnit;
  const text = String(unit && unit.text || "");
  if (!unit) return "";
  if (session.step === "study" || session.step === "check") return text;
  if (session.step === "first_character") return `${unit.firstCharacterCue || Array.from(text)[0] || ""}…`;
  return "请在心中完整复现这一单元";
}

function adaptiveSessionState(session, response) {
  const planStates = Array.isArray(response && response.plan && response.plan.itemStates)
    ? response.plan.itemStates
    : [];
  const fallback = response && response.state ? response.state : null;

  if (session && session.isComplete) {
    return {
      dueAt: fallback && fallback.dueAt || "",
      phase: planStates.length && planStates.every((state) => state && state.phase === "stable")
        ? "stable"
        : ""
    };
  }

  const activeState = planStates.find((state) => (
    state && session && session.activeUnit && state.memoryUnitId === session.activeUnit.memoryUnitId
  ));
  return activeState || fallback;
}

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

function isPronouncedChar(char) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(char);
}

function splitPinyin(pinyin) {
  return String(pinyin || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function displayCharForMethod(char, method, isRevealed, pronouncedIndex, halfPoint) {
  if (!isPronouncedChar(char)) return char;
  if (method === "拆段跟读" || isRevealed) return char;
  if (method === "首字提示") return pronouncedIndex === 0 ? char : "＿";
  if (method === "遮挡回忆") return "•";
  return pronouncedIndex < halfPoint ? char : "＿";
}

function makeSegmentUnits(segment, pinyin, method, isRevealed) {
  const chars = Array.from(String(segment || ""));
  const tokens = splitPinyin(pinyin);
  const pronouncedTotal = chars.filter(isPronouncedChar).length;
  const halfPoint = Math.max(1, Math.floor(pronouncedTotal / 2));
  let pronouncedIndex = 0;

  return chars.map((char, charIndex) => {
    const pronounced = isPronouncedChar(char);
    const pinyinText = pronounced ? (tokens[pronouncedIndex] || "") : "";
    const text = displayCharForMethod(char, method, isRevealed, pronouncedIndex, halfPoint);
    const unit = {
      key: `${charIndex}-${char}`,
      text,
      pinyin: pinyinText,
      hidden: pronounced && text !== char,
      punctuation: !pronounced
    };

    if (pronounced) pronouncedIndex += 1;
    return unit;
  });
}

function makeFullTextUnits(content) {
  const text = String(content && (content.body || content.preview || "") || "").replace(/\s+/g, "");
  const pinyin = Array.isArray(content && content.pinyinSegments)
    ? content.pinyinSegments.join(" ")
    : "";
  return makeSegmentUnits(text, pinyin, "拆段跟读", true);
}

function shouldUseShortFullText(content) {
  const text = String(content && (content.body || content.preview || "") || "").replace(/\s+/g, "");
  return Array.from(text).filter(isPronouncedChar).length <= 10;
}

function resolvePracticeContent(contentId, plan) {
  const snapshot = plan && plan.contentSnapshot;
  return findContent(contentId)
    || findContent(snapshot && snapshot.id)
    || snapshot
    || contents[0];
}

function makeDisplaySegments(content, method, revealed) {
  const segments = Array.isArray(content.segments) ? content.segments : [];
  const pinyinSegments = Array.isArray(content.pinyinSegments) ? content.pinyinSegments : [];
  const compact = content.lengthTier === "short" || content.lengthLevel === "short";

  return segments.map((segment, index) => {
    const isRevealed = revealed.includes(index) || method === "拆段跟读";
    const pinyin = pinyinSegments[index] || "";

    if (method === "拆段跟读" || isRevealed) {
      return {
        i: index,
        text: segment,
        pinyin,
        units: makeSegmentUnits(segment, pinyin, method, isRevealed),
        compact,
        hint: "",
        revealed: true
      };
    }

    if (method === "首字提示") {
      return {
        i: index,
        text: `${segment[0]}__`,
        pinyin,
        units: makeSegmentUnits(segment, pinyin, method, isRevealed),
        compact,
        hint: "点击显示全句",
        revealed: false
      };
    }

    if (method === "遮挡回忆") {
      return {
        i: index,
        text: "•".repeat(segment.length),
        pinyin,
        units: makeSegmentUnits(segment, pinyin, method, isRevealed),
        compact,
        hint: "在心中默诵后揭开",
        revealed: false
      };
    }

    const mid = Math.max(1, Math.floor(segment.length / 2));
    return {
      i: index,
      text: `${segment.slice(0, mid)}${"＿".repeat(segment.length - mid)}`,
      pinyin,
      units: makeSegmentUnits(segment, pinyin, method, isRevealed),
      compact,
      hint: "先回忆，再揭开核对",
      revealed: false
    };
  });
}

function buildPracticeView(content, method, revealed) {
  const displaySegments = makeDisplaySegments(content, method, revealed);
  const total = displaySegments.length;
  const segmentProgressCount = method === "拆段跟读"
    ? total
    : Math.min(revealed.length, total);
  const allSegmentsReady = total === 0 || segmentProgressCount >= total;

  return {
    displaySegments,
    segmentProgressCount,
    allSegmentsReady,
    primaryStepText: allSegmentsReady ? "下一步" : "先揭开核对",
    progressPct: total ? Math.round((segmentProgressCount / total) * 100) : 0
  };
}

function recommendNextContent(currentContent) {
  const sourceContents = getCachedContents();
  const pool = sourceContents.length ? sourceContents : getLocalContents();
  if (!currentContent) return pool[0] || contents[0];

  return pool.find((item) => item.id !== currentContent.id && item.category === currentContent.category)
    || pool.find((item) => item.id !== currentContent.id)
    || null;
}

function buildScientificInsight(plan, task) {
  if (!plan || !task) {
    return "按计划推进今天的这一小段。";
  }

  const metrics = plan.lastPracticeMetrics || {};
  if (plan.state === "at_risk") {
    if (Number(metrics.mistakeCount || 0) > 0) {
      return `上一轮有 ${metrics.mistakeCount} 处卡顿或错误，这段正处在易遗忘窗口，今天先稳住再推进。`;
    }
    return "这段最近出现遗忘波动，今天优先回稳，不建议一次推进太快。";
  }

  if (Number(task.dayIndex || 0) <= 1) {
    return "你刚学到这里，正处于最容易遗忘的时间窗口，现在复习最有效。";
  }

  if (Number(plan.masteryScore || 0) >= 60) {
    return "这段已接近稳定，再巩固一次即可进入更长周期。";
  }

  return "按记忆曲线复习，能减少后续反复遗忘。";
}

function buildModeCopy(mode, plan, task) {
  if (mode === "playful") {
    return {
      heroLabel: "趣味背诵",
      helperText: "今天推进一点，再回看一点，让这段内容慢慢长成自己的修持树。",
      insightTitle: "今日趣味任务",
      insightBody: `完成第 ${task ? task.dayIndex + 1 : 1} 天推进后，会点亮新的记忆节点。`,
      feedbackLabel: "这次推进如何？",
      strongerTitle: "更熟了",
      strongerSub: "点亮下一步",
      primaryTitle: "已持诵",
      primarySub: "进入稳定期"
    };
  }

  return {
    heroLabel: "科学背诵",
    helperText: "按记忆曲线拆解、回忆、核对，让背诵更稳，不靠硬撑。",
    insightTitle: "今天为什么轮到这段",
    insightBody: buildScientificInsight(plan, task),
    feedbackLabel: "这次掌握度如何？",
    strongerTitle: "更熟了",
    strongerSub: "按计划推进",
    primaryTitle: "已掌握",
    primarySub: "提前巩固"
  };
}

Page({
  data: {
    content: contents[0],
    method: "拆段跟读",
    mode: "scientific",
    scene: "",
    currentDay: 1,
    totalDays: 1,
    planId: "",
    progressPct: 0,
    headerTop: 54,
    revealed: [],
    displaySegments: [],
    segmentProgressCount: 0,
    allSegmentsReady: true,
    primaryStepText: "下一步",
    fullTextUnits: [],
    showFullTextStrip: false,
    shortFullTextStrip: false,
    finished: false,
    recommendation: null,
    growthStage: "初见",
    planState: "reviewing",
    riskTitle: "",
    riskBody: "",
    heroLabel: "科学背诵",
    helperText: "",
    insightTitle: "",
    insightBody: "",
    feedbackLabel: "这次感觉如何？",
    strongerTitle: "更熟了",
    strongerSub: "按计划推进",
    primaryTitle: "已掌握",
    primarySub: "提前巩固",
    stepIndex: 0,
    stepTotal: TRAINING_STEPS.length,
    stepTitle: TRAINING_STEPS[0].title,
    adaptiveMode: false,
    adaptiveLoading: false,
    adaptiveError: "",
    adaptiveSession: null,
    adaptiveTask: null,
    adaptiveStepTitle: "",
    adaptivePrompt: "",
    adaptiveAnswerVisible: false,
    adaptiveRemainingCount: 0,
    adaptiveProgressPct: 0,
    adaptiveNextDueAt: "",
    adaptiveStable: false,
    adaptiveCompleted: false,
    adaptiveSubmitting: false,
    adaptiveSubmitError: "",
    adaptivePendingGrade: "",
    adaptiveAttemptKey: ""
  },

  onLoad(options = {}) {
    this.loadPractice(options);
  },

  loadPractice(options) {
    const planId = String(options.planId || "");
    const localPlan = planId ? getPlan(planId) : null;
    if (localPlan || !planId || !isBackendEnabled()) {
      this.setupLegacyPractice(options);
      if (isAdaptivePlan(localPlan)) this.loadAdaptivePractice(planId);
      return;
    }

    syncPlansFromBackend().finally(() => {
      const syncedPlan = getPlan(planId);
      this.setupLegacyPractice(options);
      if (isAdaptivePlan(syncedPlan)) this.loadAdaptivePractice(planId);
    });
  },

  setupLegacyPractice(options = {}) {
    const plan = options.planId ? getPlan(options.planId) : null;
    const content = resolvePracticeContent(options.id, plan);
    const task = firstOpenTask(plan);
    const rawMethod = task ? task.method : this.data.method;
    const stepIndex = this.findStepIndex(rawMethod);
    const method = TRAINING_STEPS[stepIndex].method;
    const mode = plan ? (plan.mode || "scientific") : "scientific";
    const showFullTextStrip = content.lengthTier === "short" || content.lengthLevel === "short";
    const shortFullTextStrip = showFullTextStrip && shouldUseShortFullText(content);
    const practiceView = buildPracticeView(content, method, []);
    const headerTop = getStatusBarHeight() + 16;
    const copy = buildModeCopy(mode, plan, task);
    const riskTitle = mode === "scientific" && plan && plan.state === "at_risk" ? "遗忘风险偏高" : "";
    const riskBody = riskTitle
      ? (plan.lastPracticeMetrics && Number(plan.lastPracticeMetrics.mistakeCount || 0) > 0
        ? `上一轮记录了 ${plan.lastPracticeMetrics.mistakeCount} 处卡顿，建议先完整回看，再逐句揭开核对。`
        : "建议先放慢节奏完成一轮稳固训练，再判断是否继续推进。")
      : "";
    this.setData({
      content,
      method,
      mode,
      scene: content.scene || "",
      currentDay: task ? task.dayIndex + 1 : 1,
      totalDays: plan ? plan.totalDays : content.planDays,
      planId: plan ? plan.id : "",
      planState: plan ? plan.state || "reviewing" : "reviewing",
      headerTop,
      growthStage: growthStageFromScore(plan ? plan.masteryScore : 0),
      progressPct: practiceView.progressPct,
      displaySegments: practiceView.displaySegments,
      segmentProgressCount: practiceView.segmentProgressCount,
      allSegmentsReady: practiceView.allSegmentsReady,
      primaryStepText: practiceView.primaryStepText,
      fullTextUnits: showFullTextStrip ? makeFullTextUnits(content) : [],
      showFullTextStrip,
      shortFullTextStrip,
      stepIndex,
      stepTotal: TRAINING_STEPS.length,
      stepTitle: TRAINING_STEPS[stepIndex].title,
      riskTitle,
      riskBody,
      ...copy
    });
  },

  loadAdaptivePractice(planId) {
    this.setData({
      adaptiveMode: true,
      adaptiveLoading: true,
      adaptiveError: "",
      adaptiveSubmitError: "",
      adaptiveCompleted: false
    });
    ensureLogin({ message: "请先在我的页面完成微信授权，再开始今日训练" })
      .then(() => getTodayStudyTaskApi(planId, todayDate()))
      .then((task) => {
        if (!task || !Array.isArray(task.items)) throw new Error("今日任务数据无效，请重试");
        this.startAdaptiveSession(task);
      })
      .catch((error) => {
        this.setData({
          adaptiveLoading: false,
          adaptiveError: error.message || "今日任务加载失败，请重试"
        });
      });
  },

  retryAdaptiveLoad() {
    if (!this.data.planId || this.data.adaptiveLoading) return;
    this.loadAdaptivePractice(this.data.planId);
  },

  startAdaptiveSession(task, completionResponse = null) {
    const taskWithPendingItems = pendingTask(task);
    const session = createPracticeSession(taskWithPendingItems, { startAt: Date.now() });
    const activeUnit = session.activeUnit;
    if (activeUnit && !activeUnit.text) {
      this.setData({
        adaptiveMode: true,
        adaptiveLoading: false,
        adaptiveError: "今日任务缺少单元正文，请稍后重试",
        adaptiveTask: task,
        adaptiveSession: null
      });
      return;
    }
    this.updateAdaptiveSession(session, task, adaptiveSessionState(session, completionResponse), {
      adaptiveLoading: false,
      adaptiveError: "",
      adaptiveSubmitError: "",
      adaptiveSubmitting: false,
      adaptivePendingGrade: ""
    });
  },

  updateAdaptiveSession(session, task, completionState = null, extras = {}) {
    const activeUnit = session.activeUnit;
    const state = completionState || {
      dueAt: this.data.adaptiveNextDueAt,
      phase: this.data.adaptiveStable ? "stable" : ""
    };
    this.setData({
      adaptiveMode: true,
      adaptiveSession: session,
      adaptiveTask: task,
      adaptiveStepTitle: ADAPTIVE_STEP_TITLES[session.step] || "",
      adaptivePrompt: adaptivePrompt(session),
      adaptiveAnswerVisible: Boolean(session.activeMetrics && (session.step === "study" || session.step === "check" || session.activeMetrics.usedReveal)),
      adaptiveRemainingCount: session.queue.length,
      adaptiveProgressPct: session.isComplete ? 100 : Math.round(((session.stepIndex + 1) / session.steps.length) * 100),
      adaptiveNextDueAt: state.dueAt || "",
      adaptiveStable: state.phase === "stable",
      adaptiveCompleted: session.isComplete,
      adaptiveAttemptKey: activeUnit ? adaptiveAttemptKey(task, activeUnit) : "",
      ...extras
    });
  },

  advanceAdaptiveStep() {
    const session = this.data.adaptiveSession;
    if (!session || this.data.adaptiveSubmitting || session.step === "grade") return;
    const next = advancePracticeStep(session, { type: "advance", at: Date.now() });
    this.updateAdaptiveSession(next, this.data.adaptiveTask);
  },

  revealAdaptiveAnswer() {
    const session = this.data.adaptiveSession;
    if (!session || this.data.adaptiveSubmitting || !["first_character", "free_recall"].includes(session.step)) return;
    const next = advancePracticeStep(session, { type: "reveal", at: Date.now() });
    this.updateAdaptiveSession(next, this.data.adaptiveTask);
  },

  markAdaptiveMistake() {
    const session = this.data.adaptiveSession;
    if (!session || this.data.adaptiveSubmitting || session.step !== "check") return;
    const next = advancePracticeStep(session, { type: "mark_mistake", at: Date.now() });
    this.updateAdaptiveSession(next, this.data.adaptiveTask);
  },

  selectAdaptiveGrade(event) {
    this.submitAdaptiveGrade(event.currentTarget.dataset.grade);
  },

  retryAdaptiveGrade() {
    this.submitAdaptiveGrade(this.data.adaptivePendingGrade);
  },

  submitAdaptiveGrade(grade) {
    const session = this.data.adaptiveSession;
    if (!session || session.step !== "grade" || this.data.adaptiveSubmitting) return;
    if (!session.allowedGrades.includes(grade)) return;
    const item = session.activeUnit;
    const metrics = session.activeMetrics;
    const idempotencyKey = this.data.adaptiveAttemptKey || adaptiveAttemptKey(this.data.adaptiveTask, item);
    const reviewedAt = new Date().toISOString();
    this.setData({
      adaptiveSubmitting: true,
      adaptiveSubmitError: "",
      adaptivePendingGrade: grade,
      adaptiveAttemptKey: idempotencyKey
    });
    completeStudyTaskItemApi(item.id, {
      grade,
      latencyMs: Math.max(0, Date.now() - Number(metrics.startedAt || Date.now())),
      mistakeCount: Number(metrics.mistakeCount || 0),
      hintCount: Number(metrics.hintCount || 0),
      reviewedAt,
      idempotencyKey
    })
      .then((response) => {
        if (!response || !response.task) throw new Error("训练提交结果无效，请重试");
        this.startAdaptiveSession(response.task, response);
      })
      .catch((error) => {
        this.setData({
          adaptiveSubmitting: false,
          adaptiveSubmitError: error.message || "提交失败，请使用原评分重试"
        });
      });
  },

  reveal(event) {
    if (this.data.stepIndex >= TRAINING_STEPS.length - 1) return;
    const index = Number(event.currentTarget.dataset.index);
    if (this.data.revealed.includes(index)) return;
    const revealed = [...this.data.revealed, index];
    const practiceView = buildPracticeView(this.data.content, this.data.method, revealed);
    this.setData({
      revealed,
      progressPct: practiceView.progressPct,
      displaySegments: practiceView.displaySegments,
      segmentProgressCount: practiceView.segmentProgressCount,
      allSegmentsReady: practiceView.allSegmentsReady,
      primaryStepText: practiceView.primaryStepText
    });
  },

  findStepIndex(method) {
    const index = TRAINING_STEPS.findIndex((item) => item.method === method);
    return index >= 0 ? index : 0;
  },

  prevStep() {
    this.switchStep(Math.max(0, this.data.stepIndex - 1));
  },

  nextStep() {
    if (this.data.stepIndex < TRAINING_STEPS.length - 1 && !this.data.allSegmentsReady) {
      wx.showToast({ title: "先逐句揭开核对", icon: "none" });
      return;
    }
    this.switchStep(Math.min(TRAINING_STEPS.length - 1, this.data.stepIndex + 1));
  },

  switchStep(stepIndex) {
    const step = TRAINING_STEPS[stepIndex];
    if (!step) return;
    const revealed = [];
    const practiceView = buildPracticeView(this.data.content, step.method, revealed);
    this.setData({
      stepIndex,
      stepTitle: step.title,
      method: step.method,
      revealed,
      displaySegments: practiceView.displaySegments,
      segmentProgressCount: practiceView.segmentProgressCount,
      allSegmentsReady: practiceView.allSegmentsReady,
      primaryStepText: practiceView.primaryStepText,
      progressPct: practiceView.progressPct
    });
  },

  openFullText() {
    const content = this.data.content || {};
    const contentId = content.id;
    if (!contentId) return;
    wx.navigateTo({
      url: `/pages/recitation/index?id=${contentId}&period=theme`
    });
  },

  goBack() {
    wx.navigateBack();
  },

  needsWork() {
    this.finishPractice("needsWork", "明日再练", {
      selfRating: "low",
      latencyBand: "hesitant",
      mistakeCount: Math.max(1, this.data.content.segments.length - this.data.revealed.length)
    });
  },

  stronger() {
    this.finishPractice("stronger", "已记录", {
      selfRating: "medium",
      latencyBand: "steady",
      mistakeCount: Math.max(0, this.data.content.segments.length - this.data.revealed.length - 1)
    });
  },

  mastered() {
    this.finishPractice("mastered", "今日圆满", {
      selfRating: "high",
      latencyBand: "smooth",
      mistakeCount: 0
    });
  },

  finishPractice(result, title, metrics) {
    if (this.data.finished) return;
    const handleFinish = (nextPlan) => {
      const isComplete = nextPlan
        ? nextPlan.state === "mastered"
        : result === "mastered";
      const recommendation = isComplete ? recommendNextContent(this.data.content) : null;
      const nextTask = nextPlan ? firstOpenTask(nextPlan) : null;
      const copy = buildModeCopy(this.data.mode, nextPlan, nextTask);
      this.setData({
        progressPct: 100,
        finished: true,
        recommendation,
        growthStage: growthStageFromScore(nextPlan ? nextPlan.masteryScore : 100),
        planState: nextPlan ? nextPlan.state || "reviewing" : this.data.planState,
        riskTitle: nextPlan && nextPlan.state === "at_risk" ? "遗忘风险偏高" : "",
        riskBody: nextPlan && nextPlan.state === "at_risk"
          ? "这次先记为回稳训练，建议明天优先复练这段，不急着进入下一段。"
          : "",
        insightBody: copy.insightBody,
        helperText: copy.helperText
      });
      wx.showToast({ title, icon: result === "needsWork" ? "none" : "success" });
    };

    if (!this.data.planId) {
      handleFinish(null);
      return;
    }

    completeTaskWithFallback(this.data.planId, result, metrics)
      .then((nextPlan) => handleFinish(nextPlan))
      .catch((error) => {
        wx.showToast({ title: error.message || "记录失败", icon: "none" });
      });
  },

  startRecommendation() {
    if (!this.data.recommendation) return;
    createPlanWithFallback(this.data.recommendation, this.data.mode)
      .then((savedPlan) => {
        wx.redirectTo({
          url: `/pages/practice/index?id=${this.data.recommendation.id}&planId=${savedPlan.id}`
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "创建计划失败", icon: "none" });
      });
  }
});
