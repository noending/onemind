const ROUTE_DATA_KEYS = {
  overview: ['overview', 'contents', 'plans', 'orders', 'notifications'],
  contents: ['contents'],
  festivals: ['festivals'],
  assets: ['assets'],
  users: ['users'],
  plans: ['plans'],
  practice: ['practice'],
  recitation: ['recitation'],
  products: ['products'],
  orders: ['orders'],
  notifications: ['notifications'],
  organizations: ['organizations', 'assets'],
  audit: ['audit'],
  settings: ['health']
};

export const SEARCH_DATA_KEYS = ['contents', 'users', 'products', 'orders'];

const DATA_LOADERS = {
  overview: ({ client }) => client.get('/api/admin/overview'),
  contents: ({ client }) => client.get('/api/admin/contents'),
  festivals: ({ client }) => client.get('/api/admin/festivals'),
  users: ({ client }) => client.get('/api/admin/users'),
  plans: ({ client }) => client.get('/api/admin/plans'),
  practice: ({ client }) => client.get('/api/admin/practice-sessions'),
  recitation: ({ client }) => client.get('/api/admin/recitation-sessions'),
  products: ({ client }) => client.get('/api/admin/products'),
  orders: ({ client }) => client.get('/api/admin/orders'),
  notifications: ({ client }) => client.get('/api/admin/notification-jobs', { query: { limit: 50 } }),
  organizations: ({ client }) => client.get('/api/organizations'),
  audit: ({ client }) => client.get('/api/audit-logs', { query: { limit: 80 } }),
  health: ({ client }) => client.get('/health'),
  assets: async ({ client, organizations = [] }) => {
    const groups = await Promise.all((organizations || []).map(async (organization) => {
      const assets = await client.get(`/api/organizations/${encodeURIComponent(organization.id)}/assets`);
      return (Array.isArray(assets) ? assets : []).map((asset) => ({
        ...asset,
        organizationId: asset.organizationId || organization.id,
        organizationName: organization.name
      }));
    }));
    return groups.flat();
  }
};

export function getRouteDataKeys(routeId) {
  return [...(ROUTE_DATA_KEYS[routeId] || ROUTE_DATA_KEYS.overview)];
}

export async function fetchAdminData({ client, keys, organizations = [] }) {
  const uniqueKeys = [...new Set(keys || [])].filter((key) => DATA_LOADERS[key]);
  const settled = await Promise.allSettled(uniqueKeys.map((key) => (
    DATA_LOADERS[key]({ client, organizations })
  )));
  const data = {};
  const loadedKeys = [];
  const failures = [];

  settled.forEach((result, index) => {
    const key = uniqueKeys[index];
    if (result.status === 'fulfilled') {
      data[key] = result.value;
      loadedKeys.push(key);
      return;
    }
    failures.push({ key, message: result.reason?.message || '加载失败', error: result.reason });
  });

  return { data, loadedKeys, failures };
}
