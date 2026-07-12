const { businessDate } = require('./business-date');

const TARGET_DAY_MIN = 3;
const TARGET_DAY_MAX = 84;
const DEFAULT_TARGET_DAYS = {
  new: 28,
  partial: 14,
  familiar: 7
};
const INTERVAL_BY_GRADE = { again: 1, good: 3, easy: 7 };
const REVIEW_MINUTES = 0.5;
const NEW_MINUTES = 1.5;

function normalizeTargetDays(value) {
  const parsed = Math.round(Number(value || 14));
  return Math.max(TARGET_DAY_MIN, Math.min(TARGET_DAY_MAX, parsed));
}

function recommendPlan({ unitCount, familiarityLevel = 'new', dailyMinutes = 15, targetDays } = {}) {
  const totalUnits = Math.max(1, Number(unitCount || 1));
  const recommendedDays = DEFAULT_TARGET_DAYS[familiarityLevel] || DEFAULT_TARGET_DAYS.new;
  const normalizedDays = normalizeTargetDays(targetDays || recommendedDays);
  const newUnitsPerDay = Math.max(1, Math.ceil(totalUnits / normalizedDays));
  const estimatedMinutes = Math.max(5, Math.ceil(newUnitsPerDay * 1.5 + Math.min(totalUnits, newUnitsPerDay * 2) * 0.5));
  const intensity = estimatedMinutes > Number(dailyMinutes || 15) ? 'high' : normalizedDays <= 7 ? 'high' : normalizedDays <= 14 ? 'standard' : 'steady';

  return {
    targetDays: normalizedDays,
    newUnitsPerDay,
    estimatedMinutes,
    dailyMinutes: Math.max(5, Number(dailyMinutes || 15)),
    intensity,
    disclaimer: `${normalizedDays} 天用于完成首轮学习，之后仍会继续长期复习。`
  };
}

function allocateDailyUnits({ states = [], date, dailyMinutes = 15, targetDays = 14 } = {}) {
  const dueStates = states
    .filter((state) => state.dueAt && state.dueAt <= date)
    .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)));
  const dueIds = new Set(dueStates.map((state) => state.memoryUnitId));
  const weakStates = states.filter((state) => state.lastGrade === 'again' && !dueIds.has(state.memoryUnitId));
  const newStates = states.filter((state) => state.phase === 'new');
  const normalizedDays = normalizeTargetDays(targetDays);
  const parsedBudget = Number(dailyMinutes);
  const dailyBudget = Number.isFinite(parsedBudget) ? Math.max(0, parsedBudget) : 15;
  let remainingMinutes = dailyBudget;

  function takeWithinBudget(items, cost, limit = items.length) {
    const affordable = Math.max(0, Math.floor((remainingMinutes + Number.EPSILON) / cost));
    const selected = items.slice(0, Math.min(items.length, limit, affordable));
    remainingMinutes -= selected.length * cost;
    return selected;
  }

  let selectedDue = takeWithinBudget(dueStates, REVIEW_MINUTES);
  let selectedWeak = takeWithinBudget(weakStates, REVIEW_MINUTES);
  const targetNewCount = Math.ceil(newStates.length / normalizedDays);
  let selectedNew = takeWithinBudget(newStates, NEW_MINUTES, targetNewCount);
  let minimumItemException = false;

  if (!selectedDue.length && !selectedWeak.length && !selectedNew.length) {
    const firstDue = dueStates[0];
    const firstWeak = weakStates[0];
    const firstNew = newStates[0];
    if (firstDue) selectedDue = [firstDue];
    else if (firstWeak) selectedWeak = [firstWeak];
    else if (firstNew) selectedNew = [firstNew];
    minimumItemException = Boolean(firstDue || firstWeak || firstNew);
  }

  const newUnitCount = selectedNew.length;
  const items = [
    ...selectedDue.map((state) => ({ ...state, taskType: 'due_review' })),
    ...selectedWeak.map((state) => ({ ...state, taskType: 'weak_review' })),
    ...selectedNew.map((state) => ({ ...state, taskType: 'new' }))
  ];
  const estimatedMinutes = selectedDue.length * REVIEW_MINUTES
    + selectedWeak.length * REVIEW_MINUTES
    + selectedNew.length * NEW_MINUTES;

  return {
    items,
    newUnitCount,
    reviewUnitCount: selectedDue.length,
    weakUnitCount: selectedWeak.length,
    estimatedMinutes,
    minimumItemException
  };
}

function naturalDate(value) {
  return value ? businessDate(value) : null;
}

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function applyReviewGrade(state = {}, review = {}) {
  const next = { ...state };
  const grade = review.grade;
  const reviewedDate = naturalDate(review.reviewedAt);
  const previousReviewedDate = naturalDate(state.lastReviewedAt);
  const isSuccessful = grade === 'good' || grade === 'easy';
  const isCleanRecall = isSuccessful
    && Number(review.hintCount || 0) === 0
    && Number(review.mistakeCount || 0) === 0;
  const crossDaySuccess = isCleanRecall && previousReviewedDate && reviewedDate && reviewedDate > previousReviewedDate;
  const successfulRecallCount = Number(state.successfulRecallCount || 0) + (isSuccessful ? 1 : 0);
  const crossDaySuccessCount = Number(state.crossDaySuccessCount || 0) + (crossDaySuccess ? 1 : 0);
  const interval = INTERVAL_BY_GRADE[grade] || INTERVAL_BY_GRADE.good;

  next.lastGrade = grade;
  next.lastReviewedAt = review.reviewedAt;
  next.successfulRecallCount = successfulRecallCount;
  next.crossDaySuccessCount = crossDaySuccessCount;
  next.lapseCount = Number(state.lapseCount || 0) + (grade === 'again' ? 1 : 0);
  next.needsSameSessionRetry = grade === 'again';
  next.dueAt = addDays(reviewedDate, interval);
  next.phase = grade === 'again'
    ? 'learning'
    : crossDaySuccessCount >= 1
      ? 'stable'
      : state.phase;

  return next;
}

function isInitialComplete(states = []) {
  return states.length > 0 && states.every((state) => state.phase === 'stable');
}

module.exports = {
  normalizeTargetDays,
  recommendPlan,
  allocateDailyUnits,
  applyReviewGrade,
  isInitialComplete
};
