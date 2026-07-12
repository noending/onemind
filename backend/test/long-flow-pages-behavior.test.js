const test = require('node:test');
const assert = require('node:assert/strict');

const PLAN_STORAGE_KEY = 'oneMind.memoryAssessmentRecommendation';

function loadPage(modulePath) {
  const previousPage = global.Page;
  let definition;
  global.Page = (pageDefinition) => {
    definition = pageDefinition;
  };
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
  global.Page = previousPage;
  return definition;
}

function mountPage(definition) {
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = (patch) => Object.assign(page.data, patch);
  return page;
}

function planStorage(unitCount = 84, recommendedTargetDays = 14) {
  return {
    recommendation: {
      unitCount,
      dailyMinutes: 15,
      ...(recommendedTargetDays === undefined ? {} : { recommendedTargetDays }),
      familiarityLevel: 'partial'
    },
    assessmentContext: {
      assessmentId: 'assessment-84',
      contentId: 'great-compassion-opening',
      versionId: 'great-compassion-v1',
      scopeType: 'full',
      scopeId: null,
      unitCount
    }
  };
}

test('legacy migration retry preserves legacyPlanId through assessment back to plan setup', async () => {
  const legacyPlanId = 'legacy-long-plan-1';
  const stored = planStorage();
  stored.assessmentContext.legacyPlanId = legacyPlanId;
  let retryUrl = '';
  global.wx = {
    getStorageSync(key) {
      return key === PLAN_STORAGE_KEY ? stored : null;
    },
    redirectTo({ url }) { retryUrl = url; }
  };
  const setupPage = mountPage(loadPage('../../pages/plan-setup/index.js'));
  setupPage.onLoad({
    assessmentId: 'assessment-84',
    contentId: 'great-compassion-opening',
    versionId: 'great-compassion-v1',
    legacyPlanId
  });
  setupPage.retryAssessment();

  assert.match(retryUrl, /legacyPlanId=legacy-long-plan-1/);
  const retryOptions = Object.fromEntries(new URL(`https://local.test${retryUrl}`).searchParams.entries());

  const api = require('../../common/api');
  const originalRecommend = api.recommendMemoryPlanApi;
  let nextStorage = null;
  let nextSetupUrl = '';
  api.recommendMemoryPlanApi = () => Promise.resolve({
    unitCount: 1,
    dailyMinutes: 15,
    recommendedTargetDays: 14,
    familiarityLevel: 'partial'
  });
  try {
    global.wx = {
      setStorageSync(key, value) {
        if (key === PLAN_STORAGE_KEY) nextStorage = value;
      },
      redirectTo({ url }) { nextSetupUrl = url; }
    };
    const assessmentPage = mountPage(loadPage('../../pages/assessment/index.js'));
    assessmentPage.loadStructure = () => {};
    assessmentPage.onLoad(retryOptions);
    assessmentPage.stopTimer = () => {};
    assessmentPage.setData({
      structure: {
        sections: [{
          id: 'section-1',
          reviewStatus: 'approved',
          units: [{ id: 'unit-1', text: '南无', firstCharacterCue: '南' }]
        }]
      },
      assessment: { id: 'assessment-retry' },
      quizItems: [{ memoryUnitId: 'unit-1' }],
      answers: [{ memoryUnitId: 'unit-1', result: 'know', revealed: false, latencyMs: 100 }]
    });
    assessmentPage.finishAssessment(false);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(assessmentPage.data.legacyPlanId, legacyPlanId);
    assert.equal(nextStorage.assessmentContext.legacyPlanId, legacyPlanId);
    assert.match(nextSetupUrl, /legacyPlanId=legacy-long-plan-1/);

    const nextOptions = Object.fromEntries(new URL(`https://local.test${nextSetupUrl}`).searchParams.entries());
    global.wx = { getStorageSync: () => nextStorage };
    const nextSetupPage = mountPage(loadPage('../../pages/plan-setup/index.js'));
    nextSetupPage.onLoad(nextOptions);
    assert.equal(nextSetupPage.data.legacyPlanId, legacyPlanId);
    assert.equal(nextSetupPage.data.assessmentContext.legacyPlanId, legacyPlanId);
  } finally {
    api.recommendMemoryPlanApi = originalRecommend;
  }
});

test('plan setup computes the 84-unit 14-day workload during its first onLoad', () => {
  global.wx = {
    getStorageSync(key) {
      return key === PLAN_STORAGE_KEY ? planStorage() : null;
    }
  };
  const page = mountPage(loadPage('../../pages/plan-setup/index.js'));

  page.onLoad({
    assessmentId: 'assessment-84',
    contentId: 'great-compassion-opening',
    versionId: 'great-compassion-v1'
  });

  assert.equal(page.data.workload.newUnitsPerDay, 6);
});

test('plan setup preserves temporary custom input and normalizes it on blur', () => {
  global.wx = {
    getStorageSync(key) {
      return key === PLAN_STORAGE_KEY ? planStorage() : null;
    }
  };
  const page = mountPage(loadPage('../../pages/plan-setup/index.js'));
  page.onLoad({
    assessmentId: 'assessment-84',
    contentId: 'great-compassion-opening',
    versionId: 'great-compassion-v1'
  });

  page.setCustomDays({ detail: { value: '1' } });
  assert.equal(page.data.customDays, '1');
  page.setCustomDays({ detail: { value: '14' } });
  assert.equal(page.data.customDays, '14');
  assert.equal(page.data.targetDays, 14);

  page.setCustomDays({ detail: { value: '120' } });
  assert.equal(page.data.customDays, '120');
  page.normalizeCustomDays();
  assert.equal(page.data.customDays, '84');
  assert.equal(page.data.targetDays, 84);
});

test('clearing a custom schedule restores a valid recommended fixed period before creation', async () => {
  const api = require('../../common/api');
  const originalEnsureLogin = api.ensureLogin;
  const originalCreatePlan = api.createMemoryPlanApi;
  const cases = [
    { recommendedTargetDays: 7, expectedTargetDays: 7 },
    { recommendedTargetDays: undefined, expectedTargetDays: 14 }
  ];

  try {
    api.ensureLogin = () => Promise.resolve({ loggedIn: true });
    for (const item of cases) {
      let payload;
      api.createMemoryPlanApi = (nextPayload) => {
        payload = nextPayload;
        return Promise.resolve({ id: `plan-${item.expectedTargetDays}` });
      };
      global.wx = {
        getStorageSync(key) {
          return key === PLAN_STORAGE_KEY ? planStorage(84, item.recommendedTargetDays) : null;
        },
        redirectTo() {}
      };
      const page = mountPage(loadPage('../../pages/plan-setup/index.js'));
      page.onLoad({
        assessmentId: 'assessment-84',
        contentId: 'great-compassion-opening',
        versionId: 'great-compassion-v1'
      });

      page.setCustomDays({ detail: { value: '21' } });
      page.normalizeCustomDays();
      assert.equal(page.data.targetDays, 21);
      page.setCustomDays({ detail: { value: '' } });
      assert.equal(page.data.customDays, '');
      assert.equal(page.data.targetDays, item.expectedTargetDays);
      assert.equal(page.data.workload.newUnitsPerDay, Math.ceil(84 / item.expectedTargetDays));
      assert.equal(page.data.targetDays, page.data.cards.find((card) => card.targetDays === item.expectedTargetDays).targetDays);

      page.createPlan();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(payload.targetDays, item.expectedTargetDays);
    }
  } finally {
    api.ensureLogin = originalEnsureLogin;
    api.createMemoryPlanApi = originalCreatePlan;
  }
});

test('assessment resumes the interrupted action after authorization returns', async () => {
  global.wx = {};
  const api = require('../../common/api');
  const originalEnsureLogin = api.ensureLogin;
  api.ensureLogin = () => Promise.resolve({ loggedIn: true });
  try {
    const page = mountPage(loadPage('../../pages/assessment/index.js'));
    let resumedStart = 0;
    let resumedTimedOut = null;
    page.startAssessment = () => { resumedStart += 1; };
    page.finishAssessment = (timedOut) => { resumedTimedOut = timedOut; };

    page.setData({ authRequired: true, error: '请先授权', errorStage: 'start' });
    await page.onShow();
    assert.equal(resumedStart, 1);
    assert.equal(page.data.authRequired, false);
    assert.equal(page.data.error, '');

    page.setData({ authRequired: true, error: '请先授权', errorStage: 'submit', pendingTimedOut: true });
    await page.onShow();
    assert.equal(resumedTimedOut, true);
  } finally {
    api.ensureLogin = originalEnsureLogin;
  }
});
