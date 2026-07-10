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
