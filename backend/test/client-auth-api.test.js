const test = require('node:test');
const assert = require('node:assert/strict');

function loadApi(responseData) {
  const storage = new Map();
  global.wx = {
    getStorageSync(key) {
      return storage.get(key);
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    login(options) {
      options.success({ code: 'wechat-login-code' });
    },
    request(options) {
      options.success({ statusCode: 200, data: responseData });
    }
  };

  delete require.cache[require.resolve('../../common/api')];
  return { api: require('../../common/api'), storage };
}

test('wechat login persists a complete backend session', async () => {
  const user = { id: 'user-1', nickname: '修行者' };
  const { api, storage } = loadApi({
    data: {
      token: 'signed-token',
      refreshToken: 'signed-refresh-token',
      user
    }
  });

  const session = await api.loginWithWechat({ nickName: '修行者' });

  assert.equal(session.token, 'signed-token');
  assert.equal(storage.get('oneMind.auth.token'), 'signed-token');
  assert.equal(storage.get('oneMind.auth.refreshToken'), 'signed-refresh-token');
  assert.deepEqual(storage.get('oneMind.auth.user'), user);
});

test('wechat login rejects a response that only looks successful but has no token', async () => {
  const { api, storage } = loadApi({ data: { user: { id: 'user-1' } } });

  await assert.rejects(
    api.loginWithWechat({ nickName: '修行者' }),
    (error) => error.code === 'AUTH_SESSION_INVALID'
  );
  assert.equal(storage.get('oneMind.auth.token'), undefined);
});
