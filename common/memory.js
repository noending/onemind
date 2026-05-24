const { findContent, progressItems } = require("./content");

const STORAGE_KEY = "sutra-memo-store-v1";

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

function methodForDay(dayIndex, totalDays) {
  const sequence = ["拆段跟读", "首字提示", "遮挡回忆", "填空复现"];
  if (totalDays <= 2) return sequence[Math.min(dayIndex, 1)];
  return sequence[Math.min(dayIndex, sequence.length - 1)];
}

function createMemoryPlan(content) {
  const startDate = todayDate();
  const totalDays = content.planDays || 1;
  const planId = `${content.id}-${Date.now()}`;
  const tasks = Array.from({ length: totalDays }, (_, index) => ({
    id: `${planId}-${index}`,
    planId,
    dayIndex: index,
    scheduledDate: addDays(startDate, index),
    method: methodForDay(index, totalDays),
    done: false,
    result: "",
    completedAt: ""
  }));

  return {
    id: planId,
    contentId: content.id,
    title: content.title,
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

function getPlans() {
  const stored = wx.getStorageSync(STORAGE_KEY);
  const plans = Array.isArray(stored) ? stored : [];
  return rescheduleOverduePlans(plans);
}

function savePlans(plans) {
  wx.setStorageSync(STORAGE_KEY, plans);
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

function upsertPlan(plan) {
  const plans = getPlans();
  const active = plans.find((item) => item.contentId === plan.contentId && item.state !== "mastered");
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

function dueTasks(dateStr = todayDate()) {
  return getPlans()
    .filter((plan) => plan.state !== "mastered")
    .map((plan) => {
      const task = plan.tasks.find((item) => !item.done && item.scheduledDate <= dateStr);
      return task ? { plan, task } : null;
    })
    .filter(Boolean);
}

function taskCardFromPlan(plan, task) {
  const content = findContent(plan.contentId);
  const total = plan.totalDays || (plan.tasks ? plan.tasks.length : 1);
  return {
    id: plan.contentId,
    planId: plan.id,
    title: plan.title,
    category: content ? content.category : "经文片段",
    meta: `第 ${task.dayIndex + 1}/${total} 天 · ${task.method}`,
    body: content ? content.preview : "",
    taskId: task.id
  };
}

function getTodayReviews() {
  const tasks = dueTasks();
  return tasks.map(({ plan, task }) => taskCardFromPlan(plan, task));
}

function hasPlans() {
  return getPlans().length > 0;
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

function getProgressItems() {
  const plans = getPlans();
  if (!plans.length) {
    return {
      reviewing: progressItems.reviewing.map((item) => ({
        ...item,
        percent: item.total > 0 ? Math.round((item.current / item.total) * 100) : 0
      })),
      atRisk: progressItems.atRisk,
      mastered: progressItems.mastered.map((item) => ({
        ...item,
        percent: item.total > 0 ? Math.round((item.current / item.total) * 100) : 0
      }))
    };
  }

  return plans.reduce((acc, plan) => {
    const content = findContent(plan.contentId);
    const progress = planProgress(plan);
    const item = {
      id: plan.id,
      contentId: plan.contentId,
      title: plan.title,
      scene: content ? content.scene : "按计划修持",
      current: progress.current,
      total: progress.total,
      percent: progress.percent
    };

    if (plan.state === "mastered") {
      acc.mastered.push(item);
    } else {
      acc.reviewing.push(item);
    }
    return acc;
  }, { reviewing: [], atRisk: [], mastered: [] });
}

function completeTask(planId, result) {
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
  const mastered = doneCount >= total || result === "mastered";
  const nextPlan = {
    ...plan,
    tasks,
    currentDay: mastered ? total : Math.min(doneCount + 1, total),
    masteryScore: mastered ? 100 : Math.round((doneCount / total) * 100),
    state: mastered ? "mastered" : "reviewing",
    streakHits: result === "needsWork" ? plan.streakHits : (plan.streakHits || 0) + 1
  };

  plans[planIndex] = nextPlan;
  savePlans(plans);
  return nextPlan;
}

module.exports = {
  formatDate,
  todayDate,
  createMemoryPlan,
  getPlan,
  getPlans,
  getTodayReviews,
  hasPlans,
  getProgressItems,
  savePlans,
  upsertPlan,
  completeTask,
  firstOpenTask
};
