const SEND_ENDPOINT = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';
const INVALID_TOKEN_CODES = new Set([40001, 40014, 42001]);
const RETRYABLE_CODES = new Set([-1, 40001, 40014, 42001, 45009, 45011, 45047]);

function readPath(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => {
    if (value === null || value === undefined) return undefined;
    return value[key];
  }, source);
}

function buildTemplateData(job, fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([fieldName, payloadPath]) => {
    const normalizedPath = String(payloadPath || '').trim();
    const rootKey = normalizedPath.split('.')[0];
    const value = normalizedPath.startsWith('payload.') || Object.hasOwn(job || {}, rootKey)
      ? readPath(job, normalizedPath)
      : readPath((job && job.payload) || {}, normalizedPath);
    return [fieldName, { value: value === null || value === undefined ? '' : String(value) }];
  }));
}

function classifyProviderFailure(body = {}, response = {}) {
  const errorCode = Number(body.errcode);
  return {
    ok: false,
    retryable: response.status === 429 || response.status >= 500 || RETRYABLE_CODES.has(errorCode),
    error: body.errmsg || `WECHAT_SEND_FAILED_${Number.isFinite(errorCode) ? errorCode : response.status || 'UNKNOWN'}`,
    errorCode: Number.isFinite(errorCode) ? errorCode : null,
    providerResponse: body
  };
}

function createWechatSubscribeSender({ accessTokenProvider, fetch = globalThis.fetch } = {}) {
  if (!accessTokenProvider || typeof accessTokenProvider.getToken !== 'function') {
    throw new TypeError('accessTokenProvider.getToken is required');
  }

  async function sendOnce({ token, openid, job, template }) {
    if (typeof fetch !== 'function') {
      return { ok: false, retryable: true, error: 'WECHAT_FETCH_UNAVAILABLE', providerResponse: null };
    }
    const url = new URL(SEND_ENDPOINT);
    url.searchParams.set('access_token', token);
    const requestBody = {
      touser: openid,
      template_id: template.templateId,
      page: template.page,
      data: buildTemplateData(job, template.fields)
    };
    let response;
    try {
      response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
    } catch (error) {
      return { ok: false, retryable: true, error: error.message || 'WECHAT_SEND_NETWORK_ERROR', providerResponse: null };
    }
    let body;
    try {
      body = await response.json();
    } catch (error) {
      return { ok: false, retryable: true, error: 'WECHAT_SEND_INVALID_RESPONSE', providerResponse: null };
    }
    if (response.ok && Number(body.errcode) === 0) {
      return {
        ok: true,
        providerMessageId: body.msgid === undefined || body.msgid === null ? '' : String(body.msgid),
        providerResponse: body
      };
    }
    return classifyProviderFailure(body, response);
  }

  async function send({ openid, job, template }) {
    try {
      const token = await accessTokenProvider.getToken();
      const first = await sendOnce({ token, openid, job, template });
      if (!INVALID_TOKEN_CODES.has(Number(first.errorCode))) return first;
      const refreshedToken = await accessTokenProvider.getToken({ forceRefresh: true });
      return sendOnce({ token: refreshedToken, openid, job, template });
    } catch (error) {
      return {
        ok: false,
        retryable: error.retryable !== false,
        error: error.code || error.message || 'WECHAT_SEND_FAILED',
        providerResponse: error.providerResponse || null
      };
    }
  }

  return { send };
}

module.exports = {
  INVALID_TOKEN_CODES,
  SEND_ENDPOINT,
  buildTemplateData,
  createWechatSubscribeSender
};
