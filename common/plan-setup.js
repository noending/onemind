const {
  normalizeTargetDays,
  recommendPlan
} = require('./adaptive-memory');

const FIXED_TARGET_DAYS = [7, 14, 28];

function isReviewedSection(section) {
  if (!section || typeof section !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(section, 'reviewStatus')) {
    return section.reviewStatus === 'approved';
  }
  if (Object.prototype.hasOwnProperty.call(section, 'reviewed')) {
    return Boolean(section.reviewed);
  }
  if (Object.prototype.hasOwnProperty.call(section, 'isReviewed')) {
    return Boolean(section.isReviewed);
  }
  return true;
}

function getUnitCount(section) {
  return Array.isArray(section && section.units) ? section.units.length : 0;
}

function buildScopeOptions(structure = {}) {
  const sections = Array.isArray(structure.sections) ? structure.sections : [];
  const reviewedSections = sections.filter(isReviewedSection);
  const fullUnitCount = reviewedSections.reduce((total, section) => total + getUnitCount(section), 0);

  return [
    {
      scopeType: 'full',
      scopeId: null,
      title: 'Full text',
      unitCount: fullUnitCount
    },
    ...reviewedSections.map((section) => ({
      scopeType: 'section',
      scopeId: section.id,
      title: section.title || String(section.id || 'Section'),
      unitCount: getUnitCount(section)
    }))
  ];
}

function resolveRecommendedTargetDays(recommendation, context) {
  const hasRecommendedTargetDays = recommendation.recommendedTargetDays !== undefined
    && recommendation.recommendedTargetDays !== null;
  const hasTargetDays = recommendation.targetDays !== undefined
    && recommendation.targetDays !== null;
  if (hasRecommendedTargetDays) return normalizeTargetDays(recommendation.recommendedTargetDays);
  if (hasTargetDays) return normalizeTargetDays(recommendation.targetDays);
  return recommendPlan(context).targetDays;
}

function buildRecommendationCards(recommendation = {}) {
  const totalUnits = Math.max(1, Number(recommendation.unitCount || recommendation.totalUnits || 1));
  const dailyMinutes = recommendation.dailyMinutes;
  const familiarityLevel = recommendation.familiarityLevel;
  const context = { unitCount: totalUnits, dailyMinutes, familiarityLevel };
  const recommendedTargetDays = resolveRecommendedTargetDays(recommendation, context);

  const fixedCards = FIXED_TARGET_DAYS.map((targetDays) => {
    const plan = recommendPlan({ ...context, targetDays });
    return {
      targetDays,
      newUnitsPerDay: plan.newUnitsPerDay,
      estimatedReviewUnits: Math.min(totalUnits, plan.newUnitsPerDay * 2),
      estimatedMinutes: plan.estimatedMinutes,
      intensity: plan.intensity,
      isRecommended: targetDays === recommendedTargetDays
    };
  });

  return [
    ...fixedCards,
    {
      targetDays: 'custom',
      newUnitsPerDay: null,
      estimatedReviewUnits: null,
      estimatedMinutes: null,
      intensity: null,
      isRecommended: false
    }
  ];
}

module.exports = {
  buildScopeOptions,
  buildRecommendationCards
};
