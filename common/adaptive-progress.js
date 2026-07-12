function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isAdaptivePlan(plan = {}) {
  return Boolean(
    plan.contentVersionId
    || plan.adaptiveStatus
    || Array.isArray(plan.itemStates)
  );
}

function planLengthTier(plan = {}) {
  return plan.lengthTier
    || plan.tier
    || (plan.contentSnapshot && plan.contentSnapshot.lengthTier)
    || "";
}

function buildAdaptiveTaskCard(task = {}) {
  const taskId = task.taskId || task.id || "";
  const newUnitCount = numberOrZero(task.newUnitCount);
  const reviewUnitCount = numberOrZero(task.reviewUnitCount);
  const weakUnitCount = numberOrZero(task.weakUnitCount);
  const estimatedMinutes = numberOrZero(task.estimatedMinutes);

  return {
    ...task,
    taskId,
    newUnitCount,
    reviewUnitCount,
    weakUnitCount,
    estimatedMinutes,
    isAdaptive: true,
    meta: `新学 ${newUnitCount} · 复习 ${reviewUnitCount} · 薄弱 ${weakUnitCount} · 约 ${estimatedMinutes} 分钟`
  };
}

function withLegacyMigrationFlag(plan = {}) {
  return {
    ...plan,
    migrationRequired: planLengthTier(plan) === "long" && !isAdaptivePlan(plan)
  };
}

function summarizeAdaptiveProgress(states, dateStr) {
  const items = Array.isArray(states) ? states : [];
  const today = String(dateStr || "").slice(0, 10);
  const stableUnitCount = items.filter((item) => item && item.phase === "stable").length;
  const dueDates = items
    .map((item) => String(item && item.dueAt || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const dueTodayCount = today
    ? dueDates.filter((dueAt) => dueAt <= today).length
    : 0;
  const weakUnitCount = items.filter((item) => Boolean(
    item
    && (
      item.lastGrade === "again"
      || item.needsSameSessionRetry
    )
  )).length;
  const totalUnitCount = items.length;

  return {
    stableUnitCount,
    totalUnitCount,
    dueTodayCount,
    weakUnitCount,
    nextReviewDate: dueDates[0] || "",
    percent: totalUnitCount ? Math.round((stableUnitCount / totalUnitCount) * 100) : 0
  };
}

module.exports = {
  buildAdaptiveTaskCard,
  isAdaptivePlan,
  summarizeAdaptiveProgress,
  withLegacyMigrationFlag
};
