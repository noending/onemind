const TOKEN_ENDPOINT = 'https://api.weixin.qq.com/cgi-bin/token';

function tokenError(code, message, providerResponse) {
  const error = new Error(message || code);
  error.code = code;
  error.providerResponse = providerResponse || null;
  error.retryable = true;
  return error;
}

function createWechatAccessTokenProvider({
  appId = process.env.WECHAT_APP_ID || '',
  appSecret = process.env.WECHAT_APP_SECRET || '',
  fetch = globalThis.fetch,
  now = Date.now,
  expirySkewMs = 60_000,
  requestTimeoutMs = 10_000
} = {}) {
  let cachedToken = '';
  let expiresAt = 0;
  let inFlight = null;

  async function requestToken() {
    if (!String(appId).trim() || !String(appSecret).trim()) {
      const error = tokenError('WECHAT_CREDENTIALS_MISSING', 'WECHAT_APP_ID and WECHAT_APP_SECRET are required');
      error.retryable = false;
      throw error;
    }
    if (typeof fetch !== 'function') throw tokenError('WECHAT_FETCH_UNAVAILABLE', 'fetch is unavailable');
    const url = new URL(TOKEN_ENDPOINT);
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', appSecret);

    let response;
    let body;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, Number(requestTimeoutMs || 10_000)));
    try {
      response = await fetch(url.toString(), { method: 'GET', signal: controller.signal });
      body = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw tokenError('WECHAT_TOKEN_TIMEOUT', 'WeChat token request timed out');
      if (response) throw tokenError('WECHAT_TOKEN_INVALID_RESPONSE', 'WeChat token response is not JSON');
      throw tokenError('WECHAT_TOKEN_NETWORK_ERROR', error.message);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || !body.access_token) {
      throw tokenError('WECHAT_TOKEN_FAILED', body.errmsg || `WeChat token HTTP ${response.status}`, body);
    }

    const expiresInMs = Math.max(1, Number(body.expires_in || 7200)) * 1000;
    const effectiveSkew = Math.min(Math.max(0, Number(expirySkewMs || 0)), Math.max(0, expiresInMs - 1));
    cachedToken = String(body.access_token);
    expiresAt = Number(now()) + expiresInMs - effectiveSkew;
    return cachedToken;
  }

  async function getToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && cachedToken && Number(now()) < expiresAt) return cachedToken;
    if (inFlight) return inFlight;
    if (forceRefresh) {
      cachedToken = '';
      expiresAt = 0;
    }
    inFlight = requestToken().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function invalidate() {
    cachedToken = '';
    expiresAt = 0;
  }

  return { getToken, invalidate };
}

module.exports = {
  TOKEN_ENDPOINT,
  createWechatAccessTokenProvider
};
