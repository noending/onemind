const STEPS = ['study', 'first_character', 'free_recall', 'check', 'grade'];
const ALLOWED_GRADES = ['again', 'good', 'easy'];

function cloneItem(item) {
  const cloned = {
    ...item,
    unit: item && item.unit && typeof item.unit === 'object' ? { ...item.unit } : item.unit
  };

  if (cloned.text === undefined && cloned.unit && cloned.unit.text !== undefined) {
    cloned.text = cloned.unit.text;
  }
  if (cloned.firstCharacterCue === undefined && cloned.unit && cloned.unit.firstCharacterCue !== undefined) {
    cloned.firstCharacterCue = cloned.unit.firstCharacterCue;
  }
  return cloned;
}

function requireTime(value, fallback) {
  const time = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(time) || time < 0) {
    throw new TypeError('INVALID_TIME');
  }
  return time;
}

function resolveStartAt(options = {}) {
  const configured = options.startAt ?? options.startedAt ?? options.at ?? options.now;
  return requireTime(configured, 0);
}

function createMetrics(startedAt) {
  return {
    startedAt,
    lastAt: startedAt,
    stepStartedAt: startedAt,
    stepTimes: {},
    revealAt: null,
    usedReveal: false,
    hintCount: 0,
    mistakeCount: 0,
    latencyMs: null,
    grade: null
  };
}

function cloneMetrics(metrics) {
  return {
    ...metrics,
    stepTimes: { ...metrics.stepTimes }
  };
}

function createPracticeSession(task, options = {}) {
  if (!task || !Array.isArray(task.items)) {
    throw new TypeError('TASK_ITEMS_REQUIRED');
  }

  const queue = task.items.map(cloneItem);
  const startedAt = resolveStartAt(options);

  return {
    taskId: task.id || null,
    steps: [...STEPS],
    stepIndex: 0,
    step: STEPS[0],
    queue,
    activeUnit: queue[0] || null,
    activeMetrics: queue[0] ? createMetrics(startedAt) : null,
    allowedGrades: [...ALLOWED_GRADES],
    results: [],
    lastResult: null,
    isComplete: queue.length === 0
  };
}

function activeStateOrThrow(state) {
  if (!state || state.isComplete || !state.activeUnit || !state.activeMetrics) {
    throw new Error('SESSION_COMPLETE');
  }
}

function actionTime(state, action) {
  return requireTime(action.at, state.activeMetrics.lastAt);
}

function withActiveMetrics(state, metrics, at) {
  return {
    ...state,
    activeMetrics: {
      ...metrics,
      lastAt: at,
      stepTimes: { ...metrics.stepTimes }
    },
    queue: [...state.queue],
    activeUnit: { ...state.activeUnit, unit: state.activeUnit.unit ? { ...state.activeUnit.unit } : state.activeUnit.unit }
  };
}

function advanceToNextStep(state, action) {
  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= STEPS.length) {
    throw new Error('INVALID_STEP');
  }

  const expectedStep = STEPS[nextIndex];
  if (action.step !== undefined && action.step !== expectedStep) {
    throw new Error('INVALID_STEP');
  }

  const at = actionTime(state, action);
  const metrics = cloneMetrics(state.activeMetrics);
  metrics.stepTimes[state.step] = at - metrics.stepStartedAt;
  metrics.stepStartedAt = at;

  return {
    ...state,
    stepIndex: nextIndex,
    step: expectedStep,
    activeMetrics: { ...metrics, lastAt: at },
    queue: [...state.queue],
    activeUnit: { ...state.activeUnit, unit: state.activeUnit.unit ? { ...state.activeUnit.unit } : state.activeUnit.unit }
  };
}

function reveal(state, action) {
  const at = actionTime(state, action);
  const metrics = cloneMetrics(state.activeMetrics);
  if (!metrics.usedReveal) {
    metrics.revealAt = at;
    metrics.usedReveal = true;
    metrics.hintCount += 1;
  }
  return withActiveMetrics(state, metrics, at);
}

function markMistake(state, action) {
  const at = actionTime(state, action);
  const metrics = cloneMetrics(state.activeMetrics);
  metrics.mistakeCount += 1;
  return withActiveMetrics(state, metrics, at);
}

function completeGrade(state, action) {
  if (!ALLOWED_GRADES.includes(action.grade)) {
    throw new Error('INVALID_GRADE');
  }

  const at = actionTime(state, action);
  const metrics = cloneMetrics(state.activeMetrics);
  metrics.latencyMs = at - metrics.startedAt;
  metrics.grade = action.grade;
  metrics.stepTimes[state.step] = at - metrics.stepStartedAt;

  const result = {
    ...state.activeUnit,
    ...metrics,
    stepTimes: { ...metrics.stepTimes }
  };
  const remaining = state.queue.slice(1).map(cloneItem);
  const nextQueue = action.grade === 'again' ? [...remaining, cloneItem(state.activeUnit)] : remaining;
  const isComplete = nextQueue.length === 0;

  if (isComplete) {
    return {
      ...state,
      stepIndex: 0,
      step: STEPS[0],
      queue: [],
      activeUnit: null,
      activeMetrics: null,
      results: [...state.results, result],
      lastResult: result,
      isComplete: true
    };
  }

  const nextActive = nextQueue[0];
  return {
    ...state,
    stepIndex: 0,
    step: STEPS[0],
    queue: nextQueue,
    activeUnit: nextActive,
    activeMetrics: createMetrics(at),
    results: [...state.results, result],
    lastResult: result,
    isComplete: false
  };
}

function advancePracticeStep(state, action) {
  activeStateOrThrow(state);
  if (!action || typeof action.type !== 'string') {
    throw new TypeError('INVALID_ACTION');
  }

  switch (action.type) {
    case 'advance':
    case 'step':
      return advanceToNextStep(state, action);
    case 'reveal':
      return reveal(state, action);
    case 'mark_mistake':
      return markMistake(state, action);
    case 'grade':
      return completeGrade(state, action);
    default:
      throw new Error('INVALID_ACTION');
  }
}

module.exports = {
  STEPS,
  ALLOWED_GRADES,
  createPracticeSession,
  advancePracticeStep
};
