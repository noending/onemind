function parseJsonSafe(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

export function createAdminClient({
  fetchImpl = globalThis.fetch,
  getToken = () => '',
  onUnauthorized = () => {}
} = {}) {
  async function request(path, { method = 'GET', payload, query, headers = {} } = {}) {
    const url = query
      ? `${path}?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value !== null && value !== undefined)).toString()}`
      : path;
    const token = getToken();
    const response = await fetchImpl(url, {
      method,
      headers: {
        ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
    });
    const json = parseJsonSafe(await response.text());

    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      const error = new Error(json.message || json.error || `${method} ${path} 请求失败`);
      error.statusCode = response.status;
      error.response = json;
      throw error;
    }

    return Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  }

  return {
    request,
    get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
    post: (path, payload, options = {}) => request(path, { ...options, method: 'POST', payload }),
    put: (path, payload, options = {}) => request(path, { ...options, method: 'PUT', payload }),
    delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' })
  };
}
