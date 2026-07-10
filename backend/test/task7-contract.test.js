const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const store = require('../src/repositories/memoryStore');
const { createPracticeSession, advancePracticeStep } = require('../../common/practice-session');

function uniqueKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createAdaptivePlan(overrides = {}) {
  return store.createAdaptivePlan({
    userId: uniqueKey('task7-user'),
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    scopeType: 'full',
    targetDays: 14,
    dailyMinutes: 15,
    familiarityLevel: 'partial',
    date: '2026-07-10',
    idempotencyKey: uniqueKey('task7-plan'),
    ...overrides
  });
}

function makeRouteRequest(handleRequest, { method = 'GET', pathname, headers = {}, payload }) {
  return new Promise((resolve) => {
    const response = {
      writeHead(statusCode, responseHeaders) {
        this.statusCode = statusCode;
        this.headers = responseHeaders;
      },
      end(body) {
        resolve({ statusCode: this.statusCode, body: body ? JSON.parse(body) : null });
      }
    };
    handleRequest(
      { method, url: pathname, headers },
      response,
      payload === undefined ? '' : JSON.stringify(payload)
    ).catch((error) => resolve({ statusCode: error.statusCode || 500, body: { error: error.message } }));
  });
}

async function createRouteSession(handleRequest) {
  const response = await makeRouteRequest(handleRequest, {
    method: 'POST',
    pathname: '/api/auth/wechat/login',
    payload: { code: uniqueKey('task7-route-login'), userInfo: { nickName: 'Task 7' } }
  });
  assert.equal(response.statusCode, 200);
  return response.body.data;
}

function loadPracticePage({ initialPlan, syncedPlan, backendEnabled = true, task }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../pages/practice/index.js'), 'utf8');
  let currentPlan = initialPlan || null;
  let page;
  const calls = { ensureLogin: 0, getToday: 0, sync: 0 };
  const content = {
    id: 'great-compassion-opening',
    title: '大悲咒',
    category: '经文片段',
    lengthTier: 'long',
    planDays: 14,
    segments: [],
    pinyinSegments: []
  };
  const api = {
    ensureLogin() {
      calls.ensureLogin += 1;
      return Promise.resolve({ loggedIn: true });
    },
    getTodayStudyTaskApi() {
      calls.getToday += 1;
      return Promise.resolve(task);
    },
    getCachedContents: () => [],
    getLocalContents: () => [content],
    isBackendEnabled: () => backendEnabled
  };
  const memory = {
    createPlanWithFallback: () => Promise.resolve(null),
    getPlan: () => currentPlan,
    firstOpenTask: () => null,
    completeTaskWithFallback: () => Promise.resolve(null),
    growthStageFromScore: () => '初见',
    syncPlansFromBackend: () => {
      calls.sync += 1;
      currentPlan = syncedPlan || currentPlan;
      return Promise.resolve(currentPlan ? [currentPlan] : []);
    }
  };
  const sandbox = {
    Date,
    Math,
    Array,
    String,
    Number,
    Boolean,
    Promise,
    wx: {
      getWindowInfo: () => ({ statusBarHeight: 20 }),
      getMenuButtonBoundingClientRect: () => ({ top: 20 }),
      showToast() {},
      navigateTo() {},
      navigateBack() {},
      redirectTo() {}
    },
    require(request) {
      if (request === '../../common/content') return { contents: [content], findContent: () => content };
      if (request === '../../common/api') return api;
      if (request === '../../common/memory') return memory;
      if (request === '../../common/practice-session') return { createPracticeSession, advancePracticeStep };
      throw new Error(`Unexpected module: ${request}`);
    },
    Page(definition) {
      page = definition;
    }
  };
  vm.runInNewContext(source, sandbox, { filename: 'pages/practice/index.js' });
  const instance = {
    ...page,
    data: structuredClone(page.data),
    setData(next) {
      Object.assign(this.data, next);
    }
  };
  return { instance, calls };
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('daily task exposes approved unit snapshots that start a practice session, including weak retries', () => {
  const plan = createAdaptivePlan();
  const task = store.getTodayStudyTask(plan.userId, plan.id, '2026-07-10');
  const structure = store.getContentStructure('great-compassion-opening', 'great-compassion-v1');
  const expected = structure.sections.flatMap((section) => section.units)
    .find((unit) => unit.id === task.items[0].memoryUnitId);

  assert.deepEqual(task.items[0].unit, {
    id: expected.id,
    text: expected.text,
    firstCharacterCue: expected.firstCharacterCue
  });
  assert.equal(createPracticeSession(task).activeUnit.text, expected.text);
  assert.equal(task.items.every((item) => item.unit && item.unit.text), true);

  const completed = store.completeStudyTaskItem({
    userId: plan.userId,
    itemId: task.items[0].id,
    grade: 'again',
    reviewedAt: '2026-07-10T08:00:00.000Z',
    idempotencyKey: uniqueKey('task7-weak')
  });
  const retry = completed.task.items.find((item) => item.taskType === 'weak_review' && item.status === 'pending');
  assert.deepEqual(retry.unit, task.items[0].unit);
});

test('memory completion normalizes and persists adaptive metrics in the returned state', () => {
  const plan = createAdaptivePlan();
  const completion = store.completeStudyTaskItem({
    userId: plan.userId,
    itemId: plan.task.items[0].id,
    grade: 'good',
    reviewedAt: '2026-07-10T08:00:00.000Z',
    latencyMs: -8,
    mistakeCount: '2.9',
    hintCount: 'not-a-number',
    idempotencyKey: uniqueKey('task7-metrics')
  });

  assert.deepEqual(
    {
      lastLatencyMs: completion.state.lastLatencyMs,
      mistakeCount: completion.state.mistakeCount,
      hintCount: completion.state.hintCount
    },
    { lastLatencyMs: 0, mistakeCount: 2, hintCount: 0 }
  );
});

test('completion route forwards normalized metrics into the persisted adaptive state', async () => {
  const storeModulePath = require.resolve('../src/repositories/store');
  require.cache[storeModulePath] = {
    id: storeModulePath,
    filename: storeModulePath,
    loaded: true,
    exports: { ...store, getStoreMode: () => 'memory' }
  };
  delete require.cache[require.resolve('../src/routes')];
  const { handleRequest } = require('../src/routes');
  const session = await createRouteSession(handleRequest);
  const created = await makeRouteRequest(handleRequest, {
    method: 'POST',
    pathname: '/api/memory-plans',
    headers: { authorization: `Bearer ${session.token}`, 'idempotency-key': uniqueKey('task7-route-plan') },
    payload: {
      contentId: 'great-compassion-opening',
      contentVersionId: 'great-compassion-v1',
      scopeType: 'full',
      targetDays: 14,
      dailyMinutes: 15,
      familiarityLevel: 'partial',
      date: '2026-07-10'
    }
  });
  const completed = await makeRouteRequest(handleRequest, {
    method: 'POST',
    pathname: `/api/study-task-items/${encodeURIComponent(created.body.data.task.items[0].id)}/complete`,
    headers: { authorization: `Bearer ${session.token}`, 'idempotency-key': uniqueKey('task7-route-complete') },
    payload: {
      grade: 'good',
      reviewedAt: '2026-07-10T08:00:00.000Z',
      latencyMs: -4,
      mistakeCount: 3.8,
      hintCount: -2
    }
  });

  assert.equal(completed.statusCode, 200);
  assert.deepEqual(
    {
      lastLatencyMs: completed.body.data.state.lastLatencyMs,
      mistakeCount: completed.body.data.state.mistakeCount,
      hintCount: completed.body.data.state.hintCount
    },
    { lastLatencyMs: 0, mistakeCount: 3, hintCount: 0 }
  );
});

test('practice keeps local legacy plans off adaptive APIs and recognizes synced adaptive plans', async () => {
  const legacy = { id: 'legacy-plan', contentId: 'great-compassion-opening', tasks: [] };
  const legacyPage = loadPracticePage({ initialPlan: legacy });
  legacyPage.instance.onLoad({ planId: legacy.id });
  await flushAsyncWork();
  assert.deepEqual(legacyPage.calls, { ensureLogin: 0, getToday: 0, sync: 0 });

  const adaptive = {
    id: 'adaptive-plan',
    contentId: 'great-compassion-opening',
    contentVersionId: 'great-compassion-v1',
    adaptiveStatus: 'active',
    tasks: []
  };
  const adaptivePage = loadPracticePage({
    syncedPlan: adaptive,
    task: {
      id: 'today',
      items: [{
        id: 'item-1',
        memoryUnitId: 'unit-1',
        status: 'pending',
        unit: { id: 'unit-1', text: '南无喝啰怛那哆啰夜耶', firstCharacterCue: '南' }
      }]
    }
  });
  adaptivePage.instance.onLoad({ planId: adaptive.id });
  await flushAsyncWork();
  assert.deepEqual(adaptivePage.calls, { ensureLogin: 1, getToday: 1, sync: 1 });
  assert.equal(adaptivePage.instance.data.adaptiveMode, true);
});

test('practice reveal ignores study, check, and grade phases without adding hints', () => {
  const page = loadPracticePage({}).instance;
  let session = createPracticeSession({
    id: 'today',
    items: [{
      id: 'item-1',
      memoryUnitId: 'unit-1',
      status: 'pending',
      unit: { id: 'unit-1', text: '南无喝啰怛那哆啰夜耶', firstCharacterCue: '南' }
    }]
  }, { startAt: 0 });
  const phases = ['study', 'check', 'grade'];

  phases.forEach((phase) => {
    while (session.step !== phase) session = advancePracticeStep(session, { type: 'advance', at: session.activeMetrics.lastAt + 1 });
    page.data.adaptiveSession = session;
    page.data.adaptiveSubmitting = false;
    page.revealAdaptiveAnswer();
    assert.equal(page.data.adaptiveSession.activeMetrics.hintCount, 0);
  });
});
