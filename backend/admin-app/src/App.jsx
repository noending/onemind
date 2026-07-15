import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createAdminClient } from './api/client.js';
import { fetchAdminData, getRouteDataKeys, SEARCH_DATA_KEYS } from './app/data-loading.js';
import { routeFromHash, routeToHash } from './app/navigation.js';
import { buildAdminSearchIndex } from './app/search.js';
import AdminShell from './components/AdminShell.jsx';
import EntityEditor from './components/EntityEditor.jsx';
import LoginPage from './pages/LoginPage.jsx';

function lazyNamed(loader, exportName) {
  return lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

const OverviewPage = lazy(() => import('./pages/OverviewPage.jsx'));
const ContentsPage = lazyNamed(() => import('./pages/OperationsPages.jsx'), 'ContentsPage');
const FestivalsPage = lazyNamed(() => import('./pages/OperationsPages.jsx'), 'FestivalsPage');
const AssetsPage = lazyNamed(() => import('./pages/OperationsPages.jsx'), 'AssetsPage');
const UsersPage = lazyNamed(() => import('./pages/OperationsPages.jsx'), 'UsersPage');
const PlansPage = lazyNamed(() => import('./pages/OperationsPages.jsx'), 'PlansPage');
const PracticePage = lazyNamed(() => import('./pages/OperationsPages.jsx'), 'PracticePage');
const RecitationPage = lazyNamed(() => import('./pages/OperationsPages.jsx'), 'RecitationPage');
const ProductsPage = lazyNamed(() => import('./pages/CommercePages.jsx'), 'ProductsPage');
const OrdersPage = lazyNamed(() => import('./pages/CommercePages.jsx'), 'OrdersPage');
const NotificationsPage = lazyNamed(() => import('./pages/GovernancePages.jsx'), 'NotificationsPage');
const OrganizationsPage = lazyNamed(() => import('./pages/GovernancePages.jsx'), 'OrganizationsPage');
const AuditPage = lazyNamed(() => import('./pages/GovernancePages.jsx'), 'AuditPage');
const SettingsPage = lazyNamed(() => import('./pages/GovernancePages.jsx'), 'SettingsPage');

const TOKEN_KEY = 'oneMind.admin.token';
const SESSION_KEY = 'oneMind.admin.session';

const ROLE_PERMISSIONS = {
  super_admin: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'asset.publish', 'asset.access.manage', 'organization.member.manage', 'notification.dispatch', 'commerce.write', 'commerce.order.manage'],
  platform_ops: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'notification.dispatch', 'commerce.write', 'commerce.order.manage'],
  content_editor: ['admin.read', 'content.write', 'asset.write'],
  content_reviewer: ['admin.read', 'content.publish', 'asset.publish'],
  organization_admin: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'asset.publish', 'asset.access.manage', 'organization.member.manage', 'notification.dispatch', 'commerce.write', 'commerce.order.manage'],
  asset_maintainer: ['admin.read', 'asset.write'],
  readonly_member: ['admin.read']
};

const EMPTY_DATA = {
  overview: {},
  contents: [],
  festivals: [],
  assets: [],
  users: [],
  plans: [],
  practice: [],
  recitation: [],
  products: [],
  orders: [],
  notifications: [],
  organizations: [],
  audit: [],
  health: null
};

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  if (value === null || value === '') {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [session, setSession] = useState(() => readStorage(SESSION_KEY, null));
  const [routeId, setRouteId] = useState(() => routeFromHash(window.location.hash));
  const [data, setData] = useState(EMPTY_DATA);
  const [initializing, setInitializing] = useState(Boolean(token));
  const [syncing, setSyncing] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [message, setMessage] = useState(null);
  const [editor, setEditor] = useState(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const loadedKeysRef = useRef(new Set());
  const inFlightKeysRef = useRef(new Set());
  const syncCountRef = useRef(0);

  const client = useMemo(() => createAdminClient({
    getToken: () => token,
    onUnauthorized: () => clearSession('登录状态已失效，请重新登录。')
  }), [token]);
  const searchIndex = useMemo(() => buildAdminSearchIndex(data), [data]);

  useEffect(() => {
    const onHashChange = () => setRouteId(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.history.replaceState(null, '', routeToHash('overview'));
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!token) {
      loadedKeysRef.current = new Set();
      inFlightKeysRef.current = new Set();
      syncCountRef.current = 0;
      setSyncing(false);
      setInitializing(false);
      return;
    }
    let active = true;
    setInitializing(true);
    beginSync();
    Promise.all([
      client.get('/api/admin/session'),
      fetchAdminData({ client, keys: ['organizations', 'notifications'] })
    ]).then(([nextSession, bootstrap]) => {
      if (!active) return;
      setSession(nextSession);
      writeStorage(SESSION_KEY, nextSession);
      bootstrap.loadedKeys.forEach((key) => loadedKeysRef.current.add(key));
      setData((current) => ({ ...current, ...bootstrap.data }));
      if (bootstrap.failures.length) {
        showMessage(`部分基础数据未加载：${bootstrap.failures.map((item) => `${item.key}: ${item.message}`).join('；')}`, 'warning');
      }
    }).catch((error) => {
      if (active && error.statusCode !== 401) showMessage(error.message || '后台基础数据加载失败', 'error');
    }).finally(() => {
      endSync();
      if (active) setInitializing(false);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!token || initializing) return;
    loadDataKeys(getRouteDataKeys(routeId));
  }, [token, routeId, initializing]);

  function clearSession(reason = '') {
    setToken('');
    setSession(null);
    writeStorage(TOKEN_KEY, null);
    writeStorage(SESSION_KEY, null);
    setData(EMPTY_DATA);
    loadedKeysRef.current = new Set();
    inFlightKeysRef.current = new Set();
    syncCountRef.current = 0;
    setSyncing(false);
    if (reason) setLoginError(reason);
  }

  function navigate(nextRoute) {
    window.location.hash = routeToHash(nextRoute);
    setRouteId(nextRoute);
  }

  function can(permission) {
    if (!permission) return true;
    const permissions = session?.permissions?.length
      ? session.permissions
      : ROLE_PERMISSIONS[session?.role] || ROLE_PERMISSIONS.readonly_member;
    return permissions.includes(permission);
  }

  async function handleLogin(credentials) {
    setLoginLoading(true);
    setLoginError('');
    try {
      const anonymousClient = createAdminClient();
      const result = await anonymousClient.post('/api/admin/login', credentials);
      setToken(result.token);
      setSession(result.admin);
      writeStorage(TOKEN_KEY, result.token);
      writeStorage(SESSION_KEY, result.admin);
      navigate('overview');
    } catch (error) {
      setLoginError(error.message || '登录失败，请检查账号和密码。');
    } finally {
      setLoginLoading(false);
    }
  }

  function beginSync() {
    syncCountRef.current += 1;
    setSyncing(true);
  }

  function endSync() {
    syncCountRef.current = Math.max(0, syncCountRef.current - 1);
    if (syncCountRef.current === 0) setSyncing(false);
  }

  async function loadDataKeys(keys, { force = false } = {}) {
    const requestedKeys = [...new Set(keys || [])].filter((key) => (
      force || (!loadedKeysRef.current.has(key) && !inFlightKeysRef.current.has(key))
    ));
    if (!requestedKeys.length) return { data: {}, loadedKeys: [], failures: [] };
    requestedKeys.forEach((key) => inFlightKeysRef.current.add(key));
    beginSync();
    try {
      const result = await fetchAdminData({
        client,
        keys: requestedKeys,
        organizations: data.organizations
      });
      result.loadedKeys.forEach((key) => loadedKeysRef.current.add(key));
      if (Object.keys(result.data).length) setData((current) => ({ ...current, ...result.data }));
      if (result.failures.length) {
        showMessage(`部分数据未加载：${result.failures.map((item) => `${item.key}: ${item.message}`).join('；')}`, 'warning');
      }
      return result;
    } catch (error) {
      if (error.statusCode !== 401) showMessage(error.message || '后台数据加载失败', 'error');
      return { data: {}, loadedKeys: [], failures: [{ key: 'unknown', message: error.message, error }] };
    } finally {
      requestedKeys.forEach((key) => inFlightKeysRef.current.delete(key));
      endSync();
    }
  }

  function refreshCurrentView() {
    const keys = [...getRouteDataKeys(routeId)];
    if (!keys.includes('notifications')) keys.push('notifications');
    return loadDataKeys(keys, { force: true });
  }

  function showMessage(text, tone = 'success') {
    setMessage({ text, tone });
    window.setTimeout(() => setMessage(null), 3600);
  }

  async function submitEditor({ type, item, payload }) {
    setEditorSaving(true);
    try {
      if (type === 'content') {
        await (item ? client.put(`/api/admin/contents/${encodeURIComponent(item.id)}`, payload) : client.post('/api/admin/contents', payload));
      } else if (type === 'festival') {
        await (item ? client.put(`/api/admin/festivals/${encodeURIComponent(item.id)}`, payload) : client.post('/api/admin/festivals', payload));
      } else if (type === 'asset') {
        await (item ? client.put(`/api/admin/assets/${encodeURIComponent(item.id)}`, payload) : client.post('/api/admin/assets', payload));
      } else if (type === 'product') {
        await (item ? client.put(`/api/admin/products/${encodeURIComponent(item.id)}`, payload) : client.post('/api/admin/products', payload));
      } else if (type === 'member') {
        await client.post(`/api/organizations/${encodeURIComponent(payload.organizationId)}/members`, { userId: payload.userId, role: payload.role });
      }
      setEditor(null);
      showMessage(`${item ? '修改' : '新增'}已保存`);
      const changedKey = type === 'content' ? 'contents' : type === 'festival' ? 'festivals' : type === 'asset' ? 'assets' : type === 'product' ? 'products' : 'organizations';
      await loadDataKeys([...getRouteDataKeys(routeId), changedKey], { force: true });
    } catch (error) {
      showMessage(error.message || '保存失败', 'error');
    } finally {
      setEditorSaving(false);
    }
  }

  async function archive(kind, item) {
    const label = kind === 'content' ? '内容' : kind === 'festival' ? '专题' : kind === 'asset' ? '资产' : '商品';
    if (!window.confirm(`确认下架“${item.title || item.name}”${label}？`)) return;
    try {
      const paths = {
        content: `/api/admin/contents/${encodeURIComponent(item.id)}`,
        festival: `/api/admin/festivals/${encodeURIComponent(item.id)}`,
        asset: `/api/admin/assets/${encodeURIComponent(item.id)}`,
        product: `/api/admin/products/${encodeURIComponent(item.id)}`
      };
      await client.delete(paths[kind]);
      showMessage(`${label}已下架`);
      const changedKey = kind === 'content' ? 'contents' : kind === 'festival' ? 'festivals' : kind === 'asset' ? 'assets' : 'products';
      await loadDataKeys([...getRouteDataKeys(routeId), changedKey], { force: true });
    } catch (error) {
      showMessage(error.message || '操作失败', 'error');
    }
  }

  async function updateOrder(row, status) {
    try {
      await client.put(`/api/admin/orders/${encodeURIComponent(row.id)}/status`, { status });
      showMessage('订单状态已更新');
      await loadDataKeys([...getRouteDataKeys(routeId), 'orders'], { force: true });
    } catch (error) {
      showMessage(error.message || '订单更新失败', 'error');
    }
  }

  async function dispatchNotifications() {
    try {
      const result = await client.post('/api/admin/notification-jobs/dispatch');
      showMessage(`派发完成：成功 ${result.sent || 0}，失败 ${result.failed || 0}`);
      await loadDataKeys([...getRouteDataKeys(routeId), 'notifications'], { force: true });
    } catch (error) {
      showMessage(error.message || '提醒派发失败', 'error');
    }
  }

  function renderPage() {
    const visibleAssets = organizationId
      ? data.assets.filter((asset) => asset.organizationId === organizationId)
      : data.assets;
    const pages = {
      overview: <OverviewPage data={data} onNavigate={navigate} onCreateContent={() => setEditor({ type: 'content' })} />,
      contents: <ContentsPage rows={data.contents} canWrite={can('content.write')} onCreate={() => setEditor({ type: 'content' })} onEdit={(item) => setEditor({ type: 'content', item })} onArchive={(item) => archive('content', item)} />,
      festivals: <FestivalsPage rows={data.festivals} canWrite={can('content.write')} onCreate={() => setEditor({ type: 'festival' })} onEdit={(item) => setEditor({ type: 'festival', item })} onArchive={(item) => archive('festival', item)} />,
      assets: <AssetsPage rows={visibleAssets} canWrite={can('asset.write')} onCreate={() => setEditor({ type: 'asset' })} onEdit={(item) => setEditor({ type: 'asset', item })} onArchive={(item) => archive('asset', item)} />,
      users: <UsersPage rows={data.users} />,
      plans: <PlansPage rows={data.plans} />,
      practice: <PracticePage rows={data.practice} />,
      recitation: <RecitationPage rows={data.recitation} />,
      products: <ProductsPage rows={data.products} canWrite={can('commerce.write')} onCreate={() => setEditor({ type: 'product' })} onEdit={(item) => setEditor({ type: 'product', item })} onArchive={(item) => archive('product', item)} />,
      orders: <OrdersPage rows={data.orders} canManage={can('commerce.order.manage')} onUpdateStatus={updateOrder} />,
      notifications: <NotificationsPage rows={data.notifications} canDispatch={can('notification.dispatch')} onDispatch={dispatchNotifications} />,
      organizations: <OrganizationsPage rows={data.organizations} assets={data.assets} canManage={can('organization.member.manage')} onAddMember={(organization) => setEditor({ type: 'member', item: { organizationId: organization.id } })} />,
      audit: <AuditPage rows={data.audit} />,
      settings: <SettingsPage health={data.health} session={session} />
    };
    return pages[routeId] || pages.overview;
  }

  if (!token) return <LoginPage loading={loginLoading} error={loginError} onSubmit={handleLogin} />;
  if (initializing && !session) return <div className="app-loading">正在进入运营工作台…</div>;

  return (
    <>
      <AdminShell
        routeId={routeId}
        session={session}
        syncing={syncing}
        searchIndex={searchIndex}
        organizations={data.organizations}
        organizationId={organizationId}
        notificationCount={data.notifications.filter((item) => ['pending', 'failed'].includes(item.status)).length}
        onSearchActivate={() => loadDataKeys(SEARCH_DATA_KEYS)}
        onOrganizationChange={(nextOrganizationId) => {
          setOrganizationId(nextOrganizationId);
          if (routeId !== 'assets') navigate('assets');
        }}
        onNavigate={navigate}
        onRefresh={refreshCurrentView}
        onLogout={() => clearSession()}
      >
        <Suspense fallback={<div className="route-loading">正在加载当前模块…</div>}>
          {renderPage()}
        </Suspense>
      </AdminShell>
      {editor ? <EntityEditor editor={editor} organizations={data.organizations} loading={editorSaving} onClose={() => setEditor(null)} onSubmit={submitEditor} /> : null}
      {message ? <div className={`toast-message toast-${message.tone}`}>{message.text}</div> : null}
      {syncing ? <div className="sync-indicator">正在同步数据</div> : null}
    </>
  );
}
