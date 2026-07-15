const test = require('node:test');
const assert = require('node:assert/strict');

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function loadProfile({
  subscriptionResult,
  loggedIn = true,
  apiAvailable = true,
  localWechatUser = null,
  loginSession = null
}) {
  const apiPath = require.resolve('../../common/api');
  const savedResults = [];
  const apiMock = {
    getNotificationSettingsApi: async () => [],
    getNotificationCapabilitiesApi: async () => ({ available: true, templates: [] }),
    getAuthUser: () => null,
    getCurrentUser: async () => ({ loggedIn, user: loggedIn ? { id: 'user-1' } : null }),
    isBackendEnabled: () => true,
    listNotificationJobsApi: async () => [],
    loginWithWechat: async () => loginSession,
    logout: async () => null,
    updateNotificationSettingApi: async (payload) => payload,
    saveWechatSubscriptionResultApi: async (payload) => {
      savedResults.push(payload);
      return {
        subscription: payload,
        setting: { channel: 'wechat_subscribe', enabled: payload.status === 'accept' }
      };
    }
  };
  require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: apiMock };

  const subscribeCalls = [];
  const toasts = [];
  let navigateBackCalls = 0;
  global.wx = {
    getStorageSync: (key) => key === 'oneMind.profile.local-wechat-user' ? localWechatUser : null,
    setStorageSync: () => {},
    showToast: (payload) => toasts.push(payload),
    navigateBack: () => { navigateBackCalls += 1; },
    requestSubscribeMessage: apiAvailable
      ? (options) => {
        subscribeCalls.push(options.tmplIds);
        options.success(subscriptionResult);
      }
      : undefined
  };
  let pageDefinition = null;
  global.Page = (definition) => { pageDefinition = definition; };
  delete require.cache[require.resolve('../../pages/profile/index.js')];
  require('../../pages/profile/index.js');

  const context = {
    data: {
      auth: { loggedIn },
      notificationSettings: [{
        channel: 'wechat_subscribe',
        enabled: false,
        quietHours: { start: '22:00', end: '07:00' }
      }],
      notificationCapabilities: {
        available: true,
        templates: [
          { key: 'review', templateId: 'tmpl-review', label: '复习提醒' },
          { key: 'recitation', templateId: 'tmpl-recitation', label: '读诵提醒' }
        ]
      }
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  return {
    pageDefinition,
    context,
    savedResults,
    subscribeCalls,
    toasts,
    getNavigateBackCalls: () => navigateBackCalls
  };
}

function mountPage(definition) {
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = (payload, callback) => {
    page.data = { ...page.data, ...payload };
    if (callback) callback();
  };
  return page;
}

test('wechat enable tap requests configured template ids and persists every result with idempotency keys', async () => {
  const harness = loadProfile({
    subscriptionResult: { 'tmpl-review': 'accept', 'tmpl-recitation': 'reject' }
  });

  harness.pageDefinition.toggleNotificationSetting.call(harness.context, {
    currentTarget: { dataset: { channel: 'wechat_subscribe' } }
  });
  assert.deepEqual(harness.subscribeCalls, [['tmpl-review', 'tmpl-recitation']]);

  await flushPromises();
  assert.equal(harness.savedResults.length, 2);
  assert.deepEqual(harness.savedResults.map((item) => [item.templateId, item.status]), [
    ['tmpl-review', 'accept'],
    ['tmpl-recitation', 'reject']
  ]);
  assert.equal(harness.savedResults.every((item) => item.idempotencyKey), true);
  assert.equal(harness.context.data.notificationSettings[0].enabled, true);
  assert.equal(harness.toasts.at(-1).title, '已开启微信提醒');
});

test('wechat enable remains off for missing login, rejection, or unavailable API with truthful copy', async () => {
  const unauthenticated = loadProfile({ subscriptionResult: {}, loggedIn: false });
  unauthenticated.pageDefinition.toggleNotificationSetting.call(unauthenticated.context, {
    currentTarget: { dataset: { channel: 'wechat_subscribe' } }
  });
  assert.equal(unauthenticated.subscribeCalls.length, 0);
  assert.equal(unauthenticated.toasts.at(-1).title, '请先登录后再开启微信提醒');

  const rejected = loadProfile({
    subscriptionResult: { 'tmpl-review': 'reject', 'tmpl-recitation': 'ban' }
  });
  rejected.pageDefinition.toggleNotificationSetting.call(rejected.context, {
    currentTarget: { dataset: { channel: 'wechat_subscribe' } }
  });
  await flushPromises();
  assert.equal(rejected.context.data.notificationSettings[0].enabled, false);
  assert.equal(rejected.toasts.at(-1).title, '订阅消息已被系统禁止，请在小程序设置中开启');

  const unavailable = loadProfile({ subscriptionResult: {}, apiAvailable: false });
  unavailable.pageDefinition.toggleNotificationSetting.call(unavailable.context, {
    currentTarget: { dataset: { channel: 'wechat_subscribe' } }
  });
  assert.equal(unavailable.context.data.notificationSettings[0].enabled, false);
  assert.equal(unavailable.toasts.at(-1).title, '当前微信版本不支持订阅消息');
});

test('assessment authorization entry opens settings and reuses saved profile without claiming login', async () => {
  const localWechatUser = {
    nickname: '本地修行者',
    avatarUrl: 'wxfile://saved-avatar'
  };
  const harness = loadProfile({
    subscriptionResult: {},
    loggedIn: false,
    localWechatUser
  });
  const page = mountPage(harness.pageDefinition);

  page.onLoad({ auth: '1' });
  const session = await page.refreshAuth();
  if (page.pendingAuthPrompt && !session.loggedIn) {
    page.pendingAuthPrompt = false;
    page.showWechatProfileSheet();
  }

  assert.equal(page.data.subTab, 'settings');
  assert.equal(page.data.auth.loggedIn, false);
  assert.equal(page.data.auth.statusText, '微信资料已保存，确认后完成登录');
  assert.equal(page.data.authProfileSheetVisible, true);
  assert.equal(page.data.authDraft.nickname, '本地修行者');
  assert.equal(page.data.authDraft.avatarUrl, 'wxfile://saved-avatar');
  assert.equal(page.returnAfterAuth, true);
});

test('successful assessment login returns to the assessment automatically', async () => {
  const user = {
    id: 'user-1',
    nickname: '已登录用户',
    avatarUrl: 'wxfile://signed-in-avatar'
  };
  const harness = loadProfile({
    subscriptionResult: {},
    loggedIn: false,
    loginSession: { token: 'signed-token', user }
  });
  const page = mountPage(harness.pageDefinition);
  page.onLoad({ auth: '1' });
  page.setData({
    authDraft: {
      avatarUrl: user.avatarUrl,
      nickname: user.nickname,
      saving: false
    }
  });

  page.confirmWechatLogin();
  await flushPromises();

  assert.equal(page.data.auth.loggedIn, true);
  assert.equal(page.data.authProfileSheetVisible, false);
  assert.equal(harness.getNavigateBackCalls(), 1);
  assert.equal(page.returnAfterAuth, false);
});
