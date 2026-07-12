const { findContent } = require("./content");
const {
  archiveMemoryPlanApi,
  completeReviewTaskApi,
  createMemoryPlanApi,
  createRecitationSessionApi,
  ensureLogin,
  findCachedContent,
  getGrowthOverviewApi,
  isBackendEnabled,
  listMemoryPlansApi,
  listRecitationGoalsApi,
  listTodayFocusApi,
  upsertRecitationGoalApi
} = require("./api");
const {
  isAdaptivePlan,
  summarizeAdaptiveProgress,
  withLegacyMigrationFlag
} = require("./adaptive-progress");

const PLAN_STORAGE_KEY = "sutra-memo-store-v2";
const RECITATION_GOAL_KEY = "sutra-recitation-goals-v1";
const RECITATION_SESSION_KEY = "sutra-recitation-sessions-v1";

const REVIEW_SEQUENCE = ["拆段跟读", "首字提示", "遮挡回忆", "填空复现", "整段复诵", "抽查巩固"];
const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30];
const REVIEW_TAIL_INTERVAL = 15;
const GROWTH_STAGES = ["初见", "熟悉", "稳定", "通顺", "已持诵"];
const AUTH_REQUIRED_MESSAGE = "请先在我的页面完成微信授权";

function formatDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDate() {
  return formatDate(new Date());
}

function addDays(dateStr, dayOffset) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + dayOffset);
  return formatDate(date);
}

function compareDate(a, b) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function isAuthRequiredError(error) {
  return Boolean(
    error &&
    (error.code === "AUTH_REQUIRED" || error.statusCode === 401)
  );
}

function requireBackendSession() {
  if (!isBackendEnabled()) return Promise.resolve(null);
  return ensureLogin({ message: AUTH_REQUIRED_MESSAGE });
}

function shiftDate(dateStr, dayOffset) {
  return addDays(dateStr, dayOffset);
}

function normalizeMode(mode) {
  return String(mode || "scientific").trim() === "playful" ? "playful" : "scientific";
}

function buildReviewOffsets(totalDays) {
  const total = Math.max(1, Number(totalDays || 1));
  const offsets = [];

  for (let index = 0; index < total; index += 1) {
    if (index < REVIEW_INTERVALS.length) {
      offsets.push(REVIEW_INTERVALS[index]);
      continue;
    }
    const last = offsets[offsets.length - 1] || REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1];
    offsets.push(last + REVIEW_TAIL_INTERVAL);
  }

  return offsets;
}

function methodForDay(dayIndex, totalDays) {
  if (totalDays <= 2) return REVIEW_SEQUENCE[Math.min(dayIndex, 1)];
  return REVIEW_SEQUENCE[Math.min(dayIndex, REVIEW_SEQUENCE.length - 1)];
}

function growthStageFromScore(score) {
  const value = Number(score || 0);
  if (value >= 100) return GROWTH_STAGES[4];
  if (value >= 75) return GROWTH_STAGES[3];
  if (value >= 50) return GROWTH_STAGES[2];
  if (value >= 25) return GROWTH_STAGES[1];
  return GROWTH_STAGES[0];
}

function scientificReasonText(plan, task) {
  if (!task) return "今天适合再回顾一次，帮助记忆进入更稳的阶段。";
  if (plan.state === "at_risk") return "这段最近出现遗忘波动，建议及时巩固。";
  if (Number(task.dayIndex || 0) <= 1) return "你刚学到这里，正处于最容易遗忘的时间窗口。";
  if (Number(plan.masteryScore || 0) >= 60) return "这段已接近稳定，再巩固一次即可进入更长周期。";
  return "按记忆曲线复习，能减少后续反复遗忘。";
}

function createMemoryPlan(content, mode = "scientific") {
  const startDate = todayDate();
  const totalDays = content.planDays || 1;
  const planId = `${content.id}-${normalizeMode(mode)}-${Date.now()}`;
  const offsets = buildReviewOffsets(totalDays);
  const tasks = Array.from({ length: totalDays }, (_, index) => ({
    id: `${planId}-${index}`,
    planId,
    dayIndex: index,
    scheduledDate: addDays(startDate, offsets[index] || 0),
    method: methodForDay(index, totalDays),
    done: false,
    result: "",
    completedAt: ""
  }));

  return {
    id: planId,
    contentId: content.id,
    title: content.title,
    mode: normalizeMode(mode),
    contentSnapshot: {
      id: content.id,
      title: content.title,
      category: content.category,
      body: content.body,
      preview: content.preview,
      segments: content.segments,
      pinyinSegments: content.pinyinSegments || [],
      scene: content.scene,
      lengthTier: content.lengthTier,
      planDays: content.planDays,
      supportedModes: content.supportedModes || ["scientific"],
      defaultMode: content.defaultMode || "scientific",
      supportsRecitation: content.supportsRecitation !== false,
      recommendedRecitationTime: content.recommendedRecitationTime || "",
      recitationTheme: content.recitationTheme || "",
      publishedVersionId: content.publishedVersionId || ""
    },
    tier: content.lengthTier,
    startDate,
    totalDays,
    currentDay: 1,
    tasks,
    state: "reviewing",
    streakHits: 0,
    masteryScore: 0
  };
}

function safeRead(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined || value === "" ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    // Ignore storage failures in demo mode.
  }
}

function getPlans() {
  const stored = safeRead(PLAN_STORAGE_KEY, []);
  const plans = Array.isArray(stored) ? stored : [];
  return rescheduleOverduePlans(plans);
}

function savePlans(plans) {
  safeWrite(PLAN_STORAGE_KEY, plans);
}

function setPlans(plans) {
  savePlans(Array.isArray(plans) ? plans : []);
  return getPlans();
}

function getRecitationGoals() {
  const stored = safeRead(RECITATION_GOAL_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function saveRecitationGoals(goals) {
  safeWrite(RECITATION_GOAL_KEY, goals);
}

function getRecitationSessions() {
  const stored = safeRead(RECITATION_SESSION_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function saveRecitationSessions(sessions) {
  safeWrite(RECITATION_SESSION_KEY, sessions);
}

function rescheduleOverduePlans(plans, dateStr = todayDate()) {
  let changed = false;

  const nextPlans = plans.map((plan) => {
    if (!plan || plan.state === "mastered" || !Array.isArray(plan.tasks)) return plan;

    const firstOpen = plan.tasks.find((task) => !task.done);
    if (!firstOpen || compareDate(firstOpen.scheduledDate, dateStr) >= 0) return plan;

    let offset = 0;
    const tasks = plan.tasks.map((task) => {
      if (task.done) return task;
      const scheduledDate = addDays(dateStr, offset);
      offset += 1;
      changed = true;
      return { ...task, scheduledDate };
    });

    return { ...plan, tasks };
  });

  if (changed) savePlans(nextPlans);
  return nextPlans;
}

function calculateDailyStreak(days) {
  if (!Array.isArray(days) || !days.length) return 0;
  const normalized = Array.from(new Set(
    days
      .map((day) => String(day || "").slice(0, 10))
      .filter(Boolean)
  )).sort().reverse();

  let cursor = todayDate();
  let streak = 0;
  for (const day of normalized) {
    if (day === cursor) {
      streak += 1;
      cursor = shiftDate(cursor, -1);
      continue;
    }
    if (streak === 0 && day === shiftDate(cursor, -1)) {
      streak += 1;
      cursor = shiftDate(day, -1);
      continue;
    }
    break;
  }
  return streak;
}

function upsertPlan(plan) {
  const plans = getPlans();
  const active = plans.find((item) => (
    item.contentId === plan.contentId &&
    normalizeMode(item.mode) === normalizeMode(plan.mode) &&
    item.state !== "mastered"
  ));
  if (active) return active;
  const nextPlans = [plan, ...plans];
  savePlans(nextPlans);
  return plan;
}

function getPlan(planId) {
  return getPlans().find((plan) => plan.id === planId);
}

function firstOpenTask(plan) {
  if (!plan || !Array.isArray(plan.tasks)) return null;
  return plan.tasks.find((task) => !task.done) || plan.tasks[plan.tasks.length - 1] || null;
}

function planProgress(plan) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const doneCount = tasks.filter((task) => task.done).length;
  const total = plan.totalDays || tasks.length || 1;
  return {
    current: doneCount,
    total,
    percent: Math.round((doneCount / total) * 100)
  };
}

function taskCardFromPlan(plan, task) {
  const content = findContent(plan.contentId) || plan.contentSnapshot;
  const total = plan.totalDays || (plan.tasks ? plan.tasks.length : 1);
  return {
    id: plan.contentId,
    contentId: plan.contentId,
    planId: plan.id,
    taskId: task.id,
    title: plan.title,
    category: content ? content.category : "经文片段",
    mode: normalizeMode(plan.mode),
    meta: `第 ${task.dayIndex + 1}/${total} 天 · ${task.method}`,
    method: task.method,
    currentDay: task.dayIndex + 1,
    totalDays: total,
    body: content ? content.preview : "",
    scene: content ? content.scene : "按计划修持",
    state: plan.state || "reviewing",
    masteryScore: Number(plan.masteryScore || 0),
    growthStage: growthStageFromScore(plan.masteryScore),
    lastPracticeMetrics: plan.lastPracticeMetrics || null,
    reasonText: scientificReasonText(plan, task)
  };
}

function getTodayFocusLocal(dateStr = todayDate()) {
  const duePlans = getPlans()
    .filter((plan) => plan.state !== "mastered")
    .map((plan) => {
      const task = plan.tasks.find((item) => !item.done && item.scheduledDate <= dateStr);
      return task ? { plan, task } : null;
    })
    .filter(Boolean);

  const grouped = {
    date: dateStr,
    scientificTasks: [],
    playfulTasks: [],
    recitationTasks: []
  };

  duePlans.forEach(({ plan, task }) => {
    const item = taskCardFromPlan(plan, task);
    if (normalizeMode(plan.mode) === "playful") {
      grouped.playfulTasks.push(item);
    } else {
      grouped.scientificTasks.push(item);
    }
  });

  grouped.recitationTasks = getRecitationGoals().map((goal) => {
    const content = findContent(goal.contentId) || findCachedContent(goal.contentId) || {};
    return {
      goalId: goal.id,
      contentId: goal.contentId,
      title: goal.title || content.title || "日常读诵",
      preview: content.preview || "",
      preferredPeriod: goal.preferredPeriod || "morning",
      dailyTargetCount: Number(goal.dailyTargetCount || 1),
      goalType: goal.goalType || "daily",
      status: goal.status || "active"
    };
  });

  return grouped;
}

function getTodayReviews() {
  const focus = getTodayFocusLocal();
  return [...focus.scientificTasks, ...focus.playfulTasks];
}

function hasPlans() {
  return getPlans().length > 0;
}

function normalizePlan(plan) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const content = findContent(plan.contentId) || plan.contentSnapshot;
  const normalized = withLegacyMigrationFlag({
    ...plan,
    title: plan.title || (content && content.title) || "学习计划",
    growthStage: growthStageFromScore(plan.masteryScore),
    taskRows: tasks.map((task) => ({
      id: task.id,
      date: task.scheduledDate,
      title: `第 ${task.dayIndex + 1} 天 · ${task.method}`,
      done: task.done
    }))
  });
  if (!isAdaptivePlan(plan)) return normalized;
  return {
    ...normalized,
    ...summarizeAdaptiveProgress(plan.itemStates, todayDate()),
    expectedFinishDate: plan.expectedFinishDate || ""
  };
}

function getPlanRows() {
  return getPlans().map(normalizePlan);
}

function getProgressItems() {
  const plans = getPlans();
  const base = {
    reviewing: [],
    atRisk: [],
    mastered: [],
    playful: [],
    scientific: []
  };
  if (!plans.length) return base;

  return plans.reduce((acc, plan) => {
    const content = findContent(plan.contentId) || plan.contentSnapshot;
    const progress = isAdaptivePlan(plan)
      ? summarizeAdaptiveProgress(plan.itemStates, todayDate())
      : planProgress(plan);
    const item = {
      id: plan.id,
      contentId: plan.contentId,
      title: plan.title || (content && content.title) || "学习计划",
      mode: normalizeMode(plan.mode),
      growthStage: growthStageFromScore(plan.masteryScore),
      scene: content ? content.scene : "按计划修持",
      current: isAdaptivePlan(plan) ? progress.stableUnitCount : progress.current,
      total: isAdaptivePlan(plan) ? progress.totalUnitCount : progress.total,
      percent: progress.percent
    };

    if (plan.state === "mastered") {
      acc.mastered.push(item);
    } else if (plan.state === "at_risk") {
      acc.atRisk.push(item);
      acc.reviewing.push(item);
    } else {
      acc.reviewing.push(item);
    }

    if (item.mode === "playful") {
      acc.playful.push(item);
    } else {
      acc.scientific.push(item);
    }
    return acc;
  }, base);
}

function completeTask(planId, result, metrics = {}) {
  const plans = getPlans();
  const planIndex = plans.findIndex((plan) => plan.id === planId);
  if (planIndex < 0) return null;

  const plan = plans[planIndex];
  const task = firstOpenTask(plan);
  if (!task) return plan;

  const tasks = plan.tasks.map((item) => item.id === task.id
    ? {
        ...item,
        done: true,
        result,
        completedAt: new Date().toISOString()
      }
    : item);

  const doneCount = tasks.filter((item) => item.done).length;
  const total = plan.totalDays || tasks.length || 1;
  const mastered = doneCount >= total;
  const scoreDelta = result === "mastered" ? 40 : result === "stronger" ? 24 : -8;
  const rawNextScore = Math.max(0, Math.min(100, Number(plan.masteryScore || 0) + scoreDelta));
  const nextScore = mastered
    ? 100
    : Math.min(95, rawNextScore);
  const nextPlan = {
    ...plan,
    tasks,
    currentDay: mastered ? total : Math.min(doneCount + 1, total),
    masteryScore: nextScore,
    state: result === "needsWork" ? "at_risk" : (mastered ? "mastered" : "reviewing"),
    streakHits: result === "needsWork" ? plan.streakHits : (plan.streakHits || 0) + 1,
    lastPracticeMetrics: {
      selfRating: metrics.selfRating || "",
      latencyBand: metrics.latencyBand || "",
      mistakeCount: Number(metrics.mistakeCount || 0)
    }
  };

  plans[planIndex] = nextPlan;
  savePlans(plans);
  return nextPlan;
}

function mapResultToApi(result) {
  if (result === "needsWork") return "needs_work";
  if (result === "needs_work") return "needs_work";
  if (result === "mastered") return "mastered";
  return "stronger";
}

function mapResultFromApi(result) {
  if (result === "needs_work") return "needsWork";
  if (result === "mastered") return "mastered";
  return "stronger";
}

function mapRemoteTask(task) {
  const dayIndex = Math.max(1, Number(task.dayIndex || 1));
  return {
    id: task.id,
    planId: task.planId,
    dayIndex: dayIndex - 1,
    scheduledDate: task.dueDate || todayDate(),
    method: task.method || "拆段跟读",
    done: task.status === "completed",
    result: mapResultFromApi(task.result),
    completedAt: task.completedAt || "",
    createdAt: task.createdAt || "",
    updatedAt: task.updatedAt || ""
  };
}

function mapRemotePlan(plan) {
  const snapshot = findCachedContent(plan.contentId) || findContent(plan.contentId) || null;
  const mapped = {
    id: plan.id,
    userId: plan.userId,
    contentId: plan.contentId,
    title: plan.title || (snapshot && snapshot.title) || "",
    mode: normalizeMode(plan.mode),
    contentSnapshot: snapshot ? {
      id: snapshot.id,
      title: snapshot.title,
      category: snapshot.category,
      body: snapshot.body,
      preview: snapshot.preview,
      segments: snapshot.segments,
      pinyinSegments: snapshot.pinyinSegments || [],
      scene: snapshot.scene,
      lengthTier: snapshot.lengthTier,
      planDays: snapshot.planDays,
      supportedModes: snapshot.supportedModes,
      defaultMode: snapshot.defaultMode,
      supportsRecitation: snapshot.supportsRecitation,
      recommendedRecitationTime: snapshot.recommendedRecitationTime,
      recitationTheme: snapshot.recitationTheme,
      publishedVersionId: snapshot.publishedVersionId || ""
    } : {
      id: plan.contentId,
      title: plan.title,
      category: "经文片段",
      body: "",
      preview: "",
      segments: [],
      pinyinSegments: [],
      scene: "按计划修持",
      lengthTier: "short",
      planDays: Number(plan.totalDays || 1),
      supportedModes: [normalizeMode(plan.mode)],
      defaultMode: normalizeMode(plan.mode),
      supportsRecitation: false,
      recommendedRecitationTime: "",
      recitationTheme: ""
    },
    tier: snapshot ? snapshot.lengthTier : "short",
    startDate: plan.startDate || todayDate(),
    totalDays: Number(plan.totalDays || 1),
    currentDay: Number(plan.currentDay || 1),
    tasks: Array.isArray(plan.tasks) ? plan.tasks.map(mapRemoteTask) : [],
    state: plan.state || "reviewing",
    streakHits: Number(plan.streakHits || 0),
    masteryScore: Number(plan.masteryScore || 0),
    lastReviewedAt: plan.lastReviewedAt || "",
    createdAt: plan.createdAt || "",
    updatedAt: plan.updatedAt || ""
  };

  if (!isAdaptiveRemotePlan(plan)) return mapped;

  return {
    ...mapped,
    contentVersionId: plan.contentVersionId,
    scopeType: plan.scopeType || "full",
    scopeId: plan.scopeId || null,
    targetDays: Number(plan.targetDays || 1),
    dailyMinutes: Number(plan.dailyMinutes || 0),
    familiarityLevel: plan.familiarityLevel || "new",
    strategy: plan.strategy || "",
    expectedFinishDate: plan.expectedFinishDate || "",
    adaptiveStatus: plan.adaptiveStatus || "active",
    itemStates: Array.isArray(plan.itemStates) ? plan.itemStates : [],
    tasks: []
  };
}

function isAdaptiveRemotePlan(plan = {}) {
  return Boolean(
    plan.contentVersionId ||
    plan.adaptiveStatus ||
    Array.isArray(plan.itemStates)
  );
}

function mergePlan(plan) {
  const plans = getPlans();
  const index = plans.findIndex((item) => item.id === plan.id);
  if (index >= 0) {
    plans[index] = plan;
    return setPlans(plans).find((item) => item.id === plan.id);
  }
  const byContent = plans.findIndex((item) => (
    item.contentId === plan.contentId &&
    normalizeMode(item.mode) === normalizeMode(plan.mode) &&
    item.state !== "mastered"
  ));
  if (byContent >= 0) {
    plans[byContent] = plan;
    return setPlans(plans).find((item) => item.id === plan.id);
  }
  return setPlans([plan, ...plans]).find((item) => item.id === plan.id);
}

function syncPlansFromBackend() {
  if (!isBackendEnabled()) return Promise.resolve(getPlans());
  return listMemoryPlansApi()
    .then((remotePlans) => {
      const mappedPlans = (remotePlans || []).map(mapRemotePlan);
      return setPlans(mappedPlans);
    })
    .catch(() => getPlans());
}

function archiveLocalPlan(planId) {
  const plans = getPlans();
  const exists = plans.some((plan) => plan.id === planId);
  if (!exists) return { id: planId, archived: true };
  savePlans(plans.filter((plan) => plan.id !== planId));
  return { id: planId, archived: true };
}

function archiveLegacyPlanWithFallback(planId, idempotencyKey) {
  if (!isBackendEnabled()) {
    return Promise.resolve(archiveLocalPlan(planId));
  }
  return requireBackendSession()
    .then(() => archiveMemoryPlanApi(planId, idempotencyKey))
    .then((result) => {
      if (!result || !result.archived) throw new Error("旧计划归档结果无效");
      archiveLocalPlan(planId);
      return result;
    });
}

function createPlanWithFallback(content, mode = "scientific") {
  if (!isBackendEnabled()) {
    return Promise.resolve(upsertPlan(createMemoryPlan(content, mode)));
  }

  return requireBackendSession()
    .then(() => createMemoryPlanApi({
      contentId: content.id,
      startDate: todayDate(),
      mode: normalizeMode(mode)
    }))
    .then((plan) => {
      if (!plan) return upsertPlan(createMemoryPlan(content, mode));
      const mapped = mapRemotePlan(plan);
      mapped.contentSnapshot = {
        id: content.id,
        title: content.title,
        category: content.category,
        body: content.body,
        preview: content.preview,
        segments: content.segments,
        pinyinSegments: content.pinyinSegments || [],
        scene: content.scene,
        lengthTier: content.lengthTier,
        planDays: content.planDays,
        supportedModes: content.supportedModes || ["scientific"],
        defaultMode: content.defaultMode || "scientific",
        supportsRecitation: content.supportsRecitation !== false,
        recommendedRecitationTime: content.recommendedRecitationTime || "",
        recitationTheme: content.recitationTheme || ""
      };
      return mergePlan(mapped);
    })
    .catch((error) => {
      if (isAuthRequiredError(error)) throw error;
      return upsertPlan(createMemoryPlan(content, mode));
    });
}

function completeTaskWithFallback(planId, result, metrics = {}) {
  if (!isBackendEnabled()) {
    return Promise.resolve(completeTask(planId, result, metrics));
  }

  const currentPlan = getPlan(planId);
  const currentTask = firstOpenTask(currentPlan);
  if (!currentTask) {
    return Promise.resolve(currentPlan);
  }

  return requireBackendSession()
    .then(() => completeReviewTaskApi(currentTask.id, mapResultToApi(result), metrics))
    .then((payload) => {
      const remotePlan = payload && payload.plan;
      if (!remotePlan) return completeTask(planId, result, metrics);
      const mapped = mapRemotePlan(remotePlan);
      if (currentPlan && currentPlan.contentSnapshot) {
        mapped.contentSnapshot = currentPlan.contentSnapshot;
      }
      return mergePlan(mapped);
    })
    .catch((error) => {
      if (isAuthRequiredError(error)) throw error;
      return completeTask(planId, result, metrics);
    });
}

function listTodayFocusWithFallback() {
  if (!isBackendEnabled()) {
    return Promise.resolve(getTodayFocusLocal());
  }
  return listTodayFocusApi()
    .then((focus) => focus || getTodayFocusLocal())
    .catch(() => getTodayFocusLocal());
}

function getGrowthOverviewLocal() {
  const progress = getProgressItems();
  const sessions = getRecitationSessions();
  const plans = getPlans();
  const completedTaskDates = plans
    .flatMap((plan) => (plan.tasks || []).filter((task) => task.done && task.completedAt).map((task) => task.completedAt));
  const latestPractice = plans
    .slice()
    .sort((left, right) => String(right.updatedAt || right.startDate || "").localeCompare(String(left.updatedAt || left.startDate || "")))[0] || null;
  return {
    memorizationStreak: calculateDailyStreak(completedTaskDates),
    recitationStreak: calculateDailyStreak(sessions.filter((item) => item.completed !== false).map((item) => item.createdAt)),
    masteredCount: progress.mastered.length,
    playfulPlanCount: progress.playful.length,
    scientificPlanCount: progress.scientific.length,
    completedTaskCount: plans.reduce((sum, plan) => sum + plan.tasks.filter((task) => task.done).length, 0),
    recitationSessionCount: sessions.filter((item) => item.completed !== false).length,
    latestMilestone: latestPractice ? {
      title: growthStageFromScore(latestPractice.masteryScore),
      achievedAt: latestPractice.updatedAt || latestPractice.startDate || ""
    } : null
  };
}

function getGrowthOverviewWithFallback() {
  if (!isBackendEnabled()) {
    return Promise.resolve(getGrowthOverviewLocal());
  }
  return getGrowthOverviewApi()
    .then((overview) => overview || getGrowthOverviewLocal())
    .catch(() => getGrowthOverviewLocal());
}

function listRecitationGoalsWithFallback() {
  if (!isBackendEnabled()) {
    return Promise.resolve(getRecitationGoals());
  }
  return listRecitationGoalsApi()
    .then((goals) => {
      saveRecitationGoals(goals || []);
      return goals || [];
    })
    .catch(() => getRecitationGoals());
}

function saveRecitationGoalWithFallback(content, payload = {}) {
  const localGoals = getRecitationGoals();
  const existingIndex = localGoals.findIndex((item) => item.contentId === content.id && item.goalType === (payload.goalType || "daily"));
  const nextGoal = {
    id: existingIndex >= 0 ? localGoals[existingIndex].id : `${content.id}-${Date.now()}`,
    contentId: content.id,
    title: content.title,
    goalType: payload.goalType || "daily",
    preferredPeriod: payload.preferredPeriod || content.recommendedRecitationTime || "morning",
    dailyTargetCount: Number(payload.dailyTargetCount || 1),
    status: "active"
  };
  const mergedGoals = existingIndex >= 0
    ? localGoals.map((item, index) => index === existingIndex ? { ...item, ...nextGoal } : item)
    : [nextGoal, ...localGoals];
  const saveLocalGoal = () => {
    saveRecitationGoals(mergedGoals);
    return nextGoal;
  };

  if (!isBackendEnabled()) {
    return Promise.resolve(saveLocalGoal());
  }

  return requireBackendSession()
    .then(() => upsertRecitationGoalApi(content.id, payload))
    .then((goal) => {
      const savedGoal = goal || nextGoal;
      const withoutSameGoal = getRecitationGoals()
        .filter((item) => !(item.contentId === content.id && item.goalType === savedGoal.goalType));
      saveRecitationGoals([savedGoal, ...withoutSameGoal]);
      listRecitationGoalsWithFallback();
      return savedGoal;
    })
    .catch((error) => {
      if (isAuthRequiredError(error)) throw error;
      return saveLocalGoal();
    });
}

function completeRecitationWithFallback(content, payload = {}) {
  const localSession = {
    id: `${content.id}-${Date.now()}`,
    contentId: content.id,
    goalId: payload.goalId || "",
    period: payload.period || content.recommendedRecitationTime || "morning",
    roundCount: payload.roundCount || 1,
    durationSeconds: payload.durationSeconds || 0,
    completed: true,
    createdAt: new Date().toISOString()
  };
  const saveLocalSession = () => {
    saveRecitationSessions([localSession, ...getRecitationSessions()]);
    return localSession;
  };

  if (!isBackendEnabled()) {
    return Promise.resolve(saveLocalSession());
  }

  return requireBackendSession()
    .then(() => createRecitationSessionApi({
      contentId: content.id,
      goalId: payload.goalId || null,
      sessionType: payload.sessionType || "free",
      period: payload.period || content.recommendedRecitationTime || "morning",
      roundCount: payload.roundCount || 1,
      durationSeconds: payload.durationSeconds || 0,
      completed: true,
      note: payload.note || ""
    }))
    .then((session) => session || localSession)
    .catch((error) => {
      if (isAuthRequiredError(error)) throw error;
      return saveLocalSession();
    });
}

function getTodayFocusWithFallback() {
  return listTodayFocusWithFallback();
}

module.exports = {
  formatDate,
  todayDate,
  createMemoryPlan,
  getPlan,
  getPlans,
  getPlanRows,
  getTodayReviews,
  getTodayFocusLocal,
  listTodayFocusWithFallback,
  getTodayFocusWithFallback,
  getGrowthOverviewWithFallback,
  getRecitationGoals,
  listRecitationGoalsWithFallback,
  saveRecitationGoalWithFallback,
  completeRecitationWithFallback,
  hasPlans,
  getProgressItems,
  savePlans,
  upsertPlan,
  completeTask,
  firstOpenTask,
  syncPlansFromBackend,
  archiveLegacyPlanWithFallback,
  createPlanWithFallback,
  completeTaskWithFallback,
  growthStageFromScore
};
