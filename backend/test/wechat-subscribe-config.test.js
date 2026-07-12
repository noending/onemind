const test = require('node:test');
const assert = require('node:assert/strict');

function loadConfigModule() {
  try {
    return require('../src/services/wechatSubscribeConfig');
  } catch (error) {
    return null;
  }
}

test('subscribe template config parses capabilities and configurable job type aliases', () => {
  const configModule = loadConfigModule();
  assert.ok(configModule, 'wechatSubscribeConfig service must exist');

  const config = configModule.parseWechatSubscribeTemplates(JSON.stringify({
    review: {
      templateId: 'tmpl-review',
      label: '复习提醒',
      page: 'pages/practice/index',
      fields: {
        thing1: 'payload.title',
        time2: 'scheduledAt'
      },
      aliases: ['memory_review']
    },
    recitation: {
      templateId: 'tmpl-recitation',
      label: '读诵提醒',
      page: 'pages/recitation/index',
      fields: { thing1: 'payload.title' },
      aliases: ['chant']
    }
  }));

  assert.deepEqual(configModule.toPublicCapabilities(config), {
    provider: 'wechat_subscribe',
    available: true,
    templates: [
      { key: 'review', templateId: 'tmpl-review', label: '复习提醒' },
      { key: 'recitation', templateId: 'tmpl-recitation', label: '读诵提醒' }
    ]
  });
  assert.equal(configModule.resolveTemplateForJobType(config, 'memory_review').key, 'review');
  assert.equal(configModule.resolveTemplateForJobType(config, 'chant').key, 'recitation');
});

test('missing config is explicitly unavailable and malformed secrets are never exposed', () => {
  const configModule = loadConfigModule();
  assert.ok(configModule, 'wechatSubscribeConfig service must exist');

  assert.deepEqual(configModule.toPublicCapabilities(configModule.parseWechatSubscribeTemplates('')), {
    provider: 'wechat_subscribe',
    available: false,
    templates: [],
    error: 'WECHAT_SUBSCRIBE_NOT_CONFIGURED'
  });
  assert.throws(
    () => configModule.parseWechatSubscribeTemplates('{"review":{"templateId":"tmpl"}}'),
    { code: 'WECHAT_SUBSCRIBE_CONFIG_INVALID' }
  );
});
