import { useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'oneMind.admin.token';

const ROLE_PERMISSIONS = {
  super_admin: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'asset.publish', 'asset.access.manage', 'organization.member.manage'],
  platform_ops: ['admin.read', 'content.write', 'content.publish', 'asset.write'],
  content_editor: ['admin.read', 'content.write', 'asset.write'],
  content_reviewer: ['admin.read', 'content.publish', 'asset.publish'],
  organization_admin: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'asset.publish', 'asset.access.manage', 'organization.member.manage'],
  asset_maintainer: ['admin.read', 'asset.write'],
  readonly_member: ['admin.read']
};

const METRIC_LABELS = {
  userCount: '用户',
  contentCount: '内容',
  planCount: '计划',
  completedTaskCount: '已完成任务',
  practiceSessionCount: '训练',
  recitationSessionCount: '读诵',
  assetCount: '资产',
  organizationCount: '组织',
  auditLogCount: '审计'
};

const CONTENT_TYPE_OPTIONS = [
  ['mantra', '短咒'],
  ['verse', '短偈'],
  ['sutra_segment', '经文片段'],
  ['ritual', '仪轨片段'],
  ['teaching', '上师开示']
];

const ACCESS_LEVEL_OPTIONS = [
  ['public', '公开'],
  ['registered', '登录可见'],
  ['member', '组织成员'],
  ['restricted', '指定人员'],
  ['private', '私密']
];

const MEMBER_ROLE_OPTIONS = [
  ['readonly_member', '只读成员'],
  ['asset_maintainer', '资料维护人'],
  ['organization_admin', '组织管理员']
];

const EMPTY_CONTENT_FORM = {
  title: '',
  type: 'mantra',
  body: '',
  planDays: '3',
  lengthTier: 'short',
  defaultMode: 'scientific',
  supportedModes: 'scientific,playful',
  recommendedRecitationTime: '',
  recitationTheme: '',
  supportsRecitation: true,
  scene: ''
};

const EMPTY_ASSET_FORM = {
  title: '',
  type: 'audio',
  url: '',
  accessLevel: 'public',
  copyrightStatus: ''
};

const EMPTY_MEMBER_FORM = {
  userId: '',
  role: 'readonly_member'
};

function parseJsonSafe(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

async function request(path, { token = '', method = 'GET', payload } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });

  const text = await response.text();
  const json = parseJsonSafe(text);

  if (!response.ok) {
    const error = new Error(
      json.message ||
      json.error ||
      (response.status === 401 ? '登录状态已失效，请重新登录。' : `${method} ${path} 失败`)
    );
    error.statusCode = response.status;
    throw error;
  }

  return json;
}

function formatDateTime(value) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}

function normalizeSupportedModes(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toContentPayload(form) {
  return {
    title: form.title.trim(),
    type: form.type,
    body: form.body.trim(),
    planDays: Number(form.planDays || 1),
    lengthTier: form.lengthTier,
    defaultMode: form.defaultMode,
    supportedModes: normalizeSupportedModes(form.supportedModes),
    recommendedRecitationTime: form.recommendedRecitationTime.trim(),
    recitationTheme: form.recitationTheme.trim(),
    supportsRecitation: Boolean(form.supportsRecitation),
    scene: form.scene.trim(),
    segments: form.body.trim()
  };
}

function toAssetPayload(form) {
  return {
    title: form.title.trim(),
    type: form.type,
    url: form.url.trim(),
    accessLevel: form.accessLevel,
    copyrightStatus: form.copyrightStatus.trim()
  };
}

function buildRoleText(session) {
  if (!session) return '角色：未登录';
  return `角色：${session.role || 'readonly_member'} · ${session.username || ''}`;
}

function Panel({ title, desc, actions, className = '', children }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {desc ? <p>{desc}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [health, setHealth] = useState(null);
  const [session, setSession] = useState(null);
  const [overview, setOverview] = useState(null);
  const [contents, setContents] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [assets, setAssets] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loginForm, setLoginForm] = useState({ username: 'magic', password: '' });
  const [contentForm, setContentForm] = useState(EMPTY_CONTENT_FORM);
  const [editContentForm, setEditContentForm] = useState({ id: '', ...EMPTY_CONTENT_FORM });
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET_FORM);
  const [editAssetForm, setEditAssetForm] = useState({ id: '', ...EMPTY_ASSET_FORM });
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER_FORM);
  const [selectedContentId, setSelectedContentId] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [message, setMessage] = useState('');
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const permissions = useMemo(() => {
    const role = session?.role || 'readonly_member';
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.readonly_member;
  }, [session]);

  const primaryOrganization = organizations[0] || null;

  const selectedContent = useMemo(
    () => contents.find((item) => item.id === selectedContentId) || null,
    [contents, selectedContentId]
  );

  const selectedAsset = useMemo(
    () => assets.find((item) => item.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const recentPlans = overview?.recentPlans || [];
  const recentRecitations = overview?.recentRecitations || [];
  const recentAuditLogs = overview?.recentAuditLogs || auditLogs || [];

  function can(permission) {
    return permissions.includes(permission);
  }

  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadAdmin(token);
      } finally {
        if (active) setInitializing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedContent) return;
    setEditContentForm({
      id: selectedContent.id,
      title: selectedContent.title || '',
      type: selectedContent.type || 'mantra',
      body: selectedContent.preview || selectedContent.body || '',
      planDays: String(selectedContent.planDays || 1),
      lengthTier: selectedContent.lengthTier || 'short',
      defaultMode: selectedContent.defaultMode || 'scientific',
      supportedModes: Array.isArray(selectedContent.supportedModes) ? selectedContent.supportedModes.join(',') : 'scientific',
      recommendedRecitationTime: selectedContent.recommendedRecitationTime || '',
      recitationTheme: selectedContent.recitationTheme || '',
      supportsRecitation: selectedContent.supportsRecitation !== false,
      scene: selectedContent.scene || ''
    });
  }, [selectedContent]);

  useEffect(() => {
    if (!selectedAsset) return;
    setEditAssetForm({
      id: selectedAsset.id,
      title: selectedAsset.title || '',
      type: selectedAsset.type || 'audio',
      url: selectedAsset.url || '',
      accessLevel: selectedAsset.accessLevel || 'public',
      copyrightStatus: selectedAsset.copyrightStatus || ''
    });
  }, [selectedAsset]);

  async function loadAdmin(activeToken = token) {
    setLoading(true);
    setErrorText('');
    try {
      const nextHealth = await request('/health');
      setHealth(nextHealth);

      if (!activeToken) {
        setSession(null);
        setOverview(null);
        setContents([]);
        setOrganizations([]);
        setAssets([]);
        setAuditLogs([]);
        return;
      }

      const [sessionResponse, overviewResponse, contentsResponse, organizationsResponse, auditResponse] = await Promise.all([
        request('/api/admin/session', { token: activeToken }),
        request('/api/admin/overview', { token: activeToken }),
        request('/api/contents', { token: activeToken }),
        request('/api/organizations', { token: activeToken }),
        request('/api/audit-logs', { token: activeToken })
      ]);

      const nextSession = sessionResponse.data || null;
      const nextOverview = overviewResponse.data || null;
      const nextContents = contentsResponse.data || [];
      const nextOrganizations = organizationsResponse.data || [];
      const nextAuditLogs = auditResponse.data || [];
      const organizationId = nextOrganizations[0]?.id;
      const assetsResponse = organizationId
        ? await request(`/api/organizations/${organizationId}/assets`, { token: activeToken })
        : { data: [] };

      setSession(nextSession);
      setOverview(nextOverview);
      setContents(nextContents);
      setOrganizations(nextOrganizations);
      setAssets(assetsResponse.data || []);
      setAuditLogs(nextAuditLogs);
    } catch (error) {
      if (error.statusCode === 401) {
        setToken('');
        setSession(null);
      }
      setErrorText(error.message || '后台加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setErrorText('');
    setLoading(true);
    try {
      const response = await request('/api/admin/login', {
        method: 'POST',
        payload: loginForm
      });
      const nextToken = response.data?.token || '';
      setToken(nextToken);
      setMessage('登录成功，已载入后台数据。');
      await loadAdmin(nextToken);
    } catch (error) {
      setErrorText(error.message || '账号或密码不正确');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setToken('');
    setSession(null);
    setOverview(null);
    setContents([]);
    setOrganizations([]);
    setAssets([]);
    setAuditLogs([]);
    setMessage('已退出管理后台。');
  }

  async function mutate(path, { method = 'POST', payload, successMessage } = {}) {
    setLoading(true);
    setErrorText('');
    try {
      await request(path, { method, payload, token });
      setMessage(successMessage || '操作成功');
      await loadAdmin(token);
    } catch (error) {
      setErrorText(error.message || '操作失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateContent(event) {
    event.preventDefault();
    await mutate('/api/admin/contents', {
      method: 'POST',
      payload: toContentPayload(contentForm),
      successMessage: '内容已保存。'
    });
    setContentForm(EMPTY_CONTENT_FORM);
  }

  async function handleUpdateContent(event) {
    event.preventDefault();
    if (!editContentForm.id) return;
    await mutate(`/api/admin/contents/${editContentForm.id}`, {
      method: 'PUT',
      payload: toContentPayload(editContentForm),
      successMessage: '内容已更新。'
    });
  }

  async function handleArchiveContent(item) {
    if (!window.confirm(`确认下架「${item.title}」？`)) return;
    await mutate(`/api/admin/contents/${item.id}`, {
      method: 'DELETE',
      payload: {},
      successMessage: `已下架：${item.title}`
    });
  }

  async function handleCreateAsset(event) {
    event.preventDefault();
    await mutate('/api/admin/assets', {
      method: 'POST',
      payload: toAssetPayload(assetForm),
      successMessage: '资产已保存。'
    });
    setAssetForm(EMPTY_ASSET_FORM);
  }

  async function handleUpdateAsset(event) {
    event.preventDefault();
    if (!editAssetForm.id) return;
    await mutate(`/api/admin/assets/${editAssetForm.id}`, {
      method: 'PUT',
      payload: toAssetPayload(editAssetForm),
      successMessage: '资产已更新。'
    });
  }

  async function handleArchiveAsset(item) {
    if (!window.confirm(`确认下架资产「${item.title}」？`)) return;
    await mutate(`/api/admin/assets/${item.id}`, {
      method: 'DELETE',
      payload: {},
      successMessage: `已下架资产：${item.title}`
    });
  }

  async function handleChangeAssetAccess(assetId, accessLevel) {
    await mutate(`/api/assets/${assetId}/access`, {
      method: 'PUT',
      payload: { accessLevel },
      successMessage: '资产访问级别已更新。'
    });
  }

  async function handleAddMember(event) {
    event.preventDefault();
    if (!primaryOrganization) return;
    await mutate(`/api/organizations/${primaryOrganization.id}/members`, {
      method: 'POST',
      payload: memberForm,
      successMessage: '组织成员已添加。'
    });
    setMemberForm(EMPTY_MEMBER_FORM);
  }

  async function handleDispatchNotifications() {
    await mutate('/api/admin/notification-jobs/dispatch', {
      method: 'POST',
      payload: {},
      successMessage: '提醒派发已执行。'
    });
  }

  const storeModeText = health?.storeMode === 'postgres' ? 'PostgreSQL 已连接' : '内存模式';

  return (
    <main className="shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="brand">一念法藏 · Admin</p>
          <h1>数字法藏管理台</h1>
          <p className="lead">使用 React + Vite 重构后台视图层，继续复用现有 Node.js API、权限与数据模型。</p>
          <div className="hero-tags">
            <span className="hero-tag">{storeModeText}</span>
            <span className="hero-tag">{health?.phase || '后台加载中'}</span>
            {session ? <span className="hero-tag accent">{session.role}</span> : null}
          </div>
        </div>
        <div className="status-card">
          <div>
            <strong>{storeModeText}</strong>
            <small>{health?.phase || '正在检查服务状态'}</small>
            <small>{buildRoleText(session)}</small>
          </div>
          <div className="status-actions">
            <button type="button" className="ghost-button" onClick={() => loadAdmin()}>
              刷新
            </button>
            <button type="button" className="ghost-button" onClick={handleLogout} disabled={!token}>
              退出
            </button>
          </div>
        </div>
      </header>

      {message ? <div className="message success">{message}</div> : null}
      {errorText ? <div className="message error">{errorText}</div> : null}

      {!token ? (
        <section className="login-panel active">
          <form className="login-card" onSubmit={handleLogin}>
            <h2>管理后台登录</h2>
            <p>继续使用现有管理员体系，只更换前端框架与交互组织方式。</p>
            <input
              name="username"
              value={loginForm.username}
              placeholder="用户名"
              onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
              required
            />
            <input
              name="password"
              value={loginForm.password}
              type="password"
              placeholder="密码"
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? '登录中...' : '进入后台'}
            </button>
            <small>默认本地账号为 `magic / Noending5@`。</small>
          </form>
        </section>
      ) : null}

      {token ? (
        <>
          <section className="metric-grid">
            {Object.keys(METRIC_LABELS).map((key) => (
              <div key={key} className="metric">
                <strong>{overview?.[key] || 0}</strong>
                <span>{METRIC_LABELS[key]}</span>
              </div>
            ))}
          </section>

          <section className="panel-grid">
            <Panel
              className="span-7"
              title="内容库"
              desc="公开内容、默认训练模式与计划天数"
              actions={<span className="panel-kicker">{contents.length} 条内容</span>}
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>标题</th>
                      <th>类型</th>
                      <th>模式</th>
                      <th>天数</th>
                      <th>访问</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contents.map((item) => (
                      <tr key={item.id} className={selectedContentId === item.id ? 'row-active' : ''}>
                        <td>{item.title}</td>
                        <td><span className="chip">{item.type}</span></td>
                        <td>{Array.isArray(item.supportedModes) ? item.supportedModes.join(' / ') : item.defaultMode || 'scientific'}</td>
                        <td>{item.planDays}</td>
                        <td>{item.accessLevel}</td>
                        <td>
                          <div className="table-actions">
                            {can('content.write') ? (
                              <button type="button" className="mini-button" onClick={() => setSelectedContentId(item.id)}>
                                编辑
                              </button>
                            ) : null}
                            {can('content.publish') ? (
                              <button type="button" className="mini-button danger" onClick={() => handleArchiveContent(item)}>
                                下架
                              </button>
                            ) : null}
                            {!can('content.write') && !can('content.publish') ? <span className="chip">只读</span> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              className="span-5"
              title="组织资产"
              desc={primaryOrganization ? `当前组织：${primaryOrganization.name}` : '暂无组织'}
              actions={<span className="panel-kicker">{assets.length} 项资产</span>}
            >
              <div className="asset-list">
                {assets.length ? assets.map((asset) => (
                  <div key={asset.id} className={`asset-card ${selectedAssetId === asset.id ? 'asset-card-active' : ''}`}>
                    <div className="asset-head">
                      <strong>{asset.title}</strong>
                      <select
                        value={asset.accessLevel}
                        disabled={!can('asset.access.manage')}
                        onChange={(event) => handleChangeAssetAccess(asset.id, event.target.value)}
                      >
                        {ACCESS_LEVEL_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <span>{asset.type} · {asset.accessLevel} · {asset.copyrightStatus || '未标注版权'}</span>
                    <div className="asset-actions">
                      {can('asset.write') ? (
                        <button type="button" className="mini-button" onClick={() => setSelectedAssetId(asset.id)}>
                          编辑
                        </button>
                      ) : null}
                      {can('asset.publish') ? (
                        <button type="button" className="mini-button danger" onClick={() => handleArchiveAsset(asset)}>
                          下架
                        </button>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="empty-panel">创建组织资产后会显示在这里。</div>
                )}
              </div>
            </Panel>
          </section>

          <section className="panel-grid">
            <Panel className="span-4" title="新增内容" desc="经咒、短偈、经文片段">
              <form className="form-stack" onSubmit={handleCreateContent}>
                <input value={contentForm.title} placeholder="标题" onChange={(e) => setContentForm((p) => ({ ...p, title: e.target.value }))} required />
                <select value={contentForm.type} onChange={(e) => setContentForm((p) => ({ ...p, type: e.target.value }))}>
                  {CONTENT_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <textarea rows="4" value={contentForm.body} placeholder="正文，用空格或换行分段" onChange={(e) => setContentForm((p) => ({ ...p, body: e.target.value }))} required />
                <div className="form-grid">
                  <input type="number" min="1" max="30" value={contentForm.planDays} onChange={(e) => setContentForm((p) => ({ ...p, planDays: e.target.value }))} />
                  <select value={contentForm.lengthTier} onChange={(e) => setContentForm((p) => ({ ...p, lengthTier: e.target.value }))}>
                    <option value="short">短</option>
                    <option value="medium">中</option>
                    <option value="long">长</option>
                  </select>
                </div>
                <div className="form-grid">
                  <select value={contentForm.defaultMode} onChange={(e) => setContentForm((p) => ({ ...p, defaultMode: e.target.value }))}>
                    <option value="scientific">默认科学背诵</option>
                    <option value="playful">默认趣味背诵</option>
                  </select>
                  <input value={contentForm.supportedModes} placeholder="支持模式：scientific,playful" onChange={(e) => setContentForm((p) => ({ ...p, supportedModes: e.target.value }))} />
                </div>
                <div className="form-grid">
                  <input value={contentForm.recommendedRecitationTime} placeholder="读诵时段" onChange={(e) => setContentForm((p) => ({ ...p, recommendedRecitationTime: e.target.value }))} />
                  <input value={contentForm.recitationTheme} placeholder="读诵主题" onChange={(e) => setContentForm((p) => ({ ...p, recitationTheme: e.target.value }))} />
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={contentForm.supportsRecitation} onChange={(e) => setContentForm((p) => ({ ...p, supportsRecitation: e.target.checked }))} />
                  <span>支持日常读诵</span>
                </label>
                <input value={contentForm.scene} placeholder="场景，例如：晨课静坐" onChange={(e) => setContentForm((p) => ({ ...p, scene: e.target.value }))} />
                <button type="submit" disabled={!can('content.write') || loading}>保存内容</button>
              </form>
            </Panel>

            <Panel className="span-4" title="编辑内容" desc={selectedContent ? `当前：${selectedContent.title}` : '从内容库点击“编辑”后加载'}>
              <form className="form-stack" onSubmit={handleUpdateContent}>
                <input value={editContentForm.title} placeholder="标题" onChange={(e) => setEditContentForm((p) => ({ ...p, title: e.target.value }))} required />
                <select value={editContentForm.type} onChange={(e) => setEditContentForm((p) => ({ ...p, type: e.target.value }))}>
                  {CONTENT_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <textarea rows="4" value={editContentForm.body} placeholder="正文" onChange={(e) => setEditContentForm((p) => ({ ...p, body: e.target.value }))} required />
                <div className="form-grid">
                  <input type="number" min="1" max="30" value={editContentForm.planDays} onChange={(e) => setEditContentForm((p) => ({ ...p, planDays: e.target.value }))} />
                  <select value={editContentForm.lengthTier} onChange={(e) => setEditContentForm((p) => ({ ...p, lengthTier: e.target.value }))}>
                    <option value="short">短</option>
                    <option value="medium">中</option>
                    <option value="long">长</option>
                  </select>
                </div>
                <div className="form-grid">
                  <select value={editContentForm.defaultMode} onChange={(e) => setEditContentForm((p) => ({ ...p, defaultMode: e.target.value }))}>
                    <option value="scientific">默认科学背诵</option>
                    <option value="playful">默认趣味背诵</option>
                  </select>
                  <input value={editContentForm.supportedModes} placeholder="支持模式" onChange={(e) => setEditContentForm((p) => ({ ...p, supportedModes: e.target.value }))} />
                </div>
                <div className="form-grid">
                  <input value={editContentForm.recommendedRecitationTime} placeholder="读诵时段" onChange={(e) => setEditContentForm((p) => ({ ...p, recommendedRecitationTime: e.target.value }))} />
                  <input value={editContentForm.recitationTheme} placeholder="读诵主题" onChange={(e) => setEditContentForm((p) => ({ ...p, recitationTheme: e.target.value }))} />
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={editContentForm.supportsRecitation} onChange={(e) => setEditContentForm((p) => ({ ...p, supportsRecitation: e.target.checked }))} />
                  <span>支持日常读诵</span>
                </label>
                <input value={editContentForm.scene} placeholder="场景" onChange={(e) => setEditContentForm((p) => ({ ...p, scene: e.target.value }))} />
                <button type="submit" disabled={!can('content.write') || !editContentForm.id || loading}>保存修改</button>
              </form>
            </Panel>

            <Panel className="span-4" title="新增资产" desc="音频、唐卡、文档等资料登记">
              <form className="form-stack" onSubmit={handleCreateAsset}>
                <input value={assetForm.title} placeholder="资产标题" onChange={(e) => setAssetForm((p) => ({ ...p, title: e.target.value }))} required />
                <select value={assetForm.type} onChange={(e) => setAssetForm((p) => ({ ...p, type: e.target.value }))}>
                  <option value="audio">音频</option>
                  <option value="image">图片 / 唐卡</option>
                  <option value="document">文档</option>
                  <option value="pdf">PDF</option>
                  <option value="other">其他</option>
                </select>
                <input value={assetForm.url} placeholder="storage:// 或 https:// 地址" onChange={(e) => setAssetForm((p) => ({ ...p, url: e.target.value }))} required />
                <select value={assetForm.accessLevel} onChange={(e) => setAssetForm((p) => ({ ...p, accessLevel: e.target.value }))}>
                  {ACCESS_LEVEL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="submit" disabled={!can('asset.write') || loading}>保存资产</button>
              </form>
            </Panel>

            <Panel className="span-4" title="编辑资产" desc={selectedAsset ? `当前：${selectedAsset.title}` : '从组织资产点击“编辑”后加载'}>
              <form className="form-stack" onSubmit={handleUpdateAsset}>
                <input value={editAssetForm.title} placeholder="资产标题" onChange={(e) => setEditAssetForm((p) => ({ ...p, title: e.target.value }))} required />
                <select value={editAssetForm.type} onChange={(e) => setEditAssetForm((p) => ({ ...p, type: e.target.value }))}>
                  <option value="audio">音频</option>
                  <option value="image">图片 / 唐卡</option>
                  <option value="document">文档</option>
                  <option value="pdf">PDF</option>
                  <option value="other">其他</option>
                </select>
                <input value={editAssetForm.url} placeholder="storage:// 或 https:// 地址" onChange={(e) => setEditAssetForm((p) => ({ ...p, url: e.target.value }))} required />
                <select value={editAssetForm.accessLevel} onChange={(e) => setEditAssetForm((p) => ({ ...p, accessLevel: e.target.value }))}>
                  {ACCESS_LEVEL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input value={editAssetForm.copyrightStatus} placeholder="版权状态" onChange={(e) => setEditAssetForm((p) => ({ ...p, copyrightStatus: e.target.value }))} />
                <button type="submit" disabled={!can('asset.write') || !editAssetForm.id || loading}>保存资产修改</button>
              </form>
            </Panel>

            <Panel className="span-4" title="组织成员" desc={primaryOrganization ? `添加到 ${primaryOrganization.name}` : '暂无组织'}>
              <form className="form-stack" onSubmit={handleAddMember}>
                <input value={memberForm.userId} placeholder="用户 UUID" onChange={(e) => setMemberForm((p) => ({ ...p, userId: e.target.value }))} required />
                <select value={memberForm.role} onChange={(e) => setMemberForm((p) => ({ ...p, role: e.target.value }))}>
                  {MEMBER_ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="submit" disabled={!can('organization.member.manage') || loading}>添加成员</button>
              </form>
            </Panel>
          </section>

          <section className="panel-grid">
            <Panel
              className="span-4"
              title="复习计划"
              desc="最近创建的用户记忆计划"
              actions={<button type="button" onClick={handleDispatchNotifications} disabled={!can('admin.read') || loading}>派发提醒</button>}
            >
              <div className="timeline">
                {recentPlans.length ? recentPlans.map((plan) => (
                  <div key={plan.id} className="event">
                    <strong>{plan.title}</strong>
                    <span>{plan.mode || 'scientific'} · {plan.state} · 掌握度 {plan.masteryScore}%</span>
                  </div>
                )) : <div className="empty-panel">暂无计划</div>}
              </div>
            </Panel>

            <Panel className="span-4" title="最近读诵" desc="前台完成的日常读诵记录">
              <div className="timeline">
                {recentRecitations.length ? recentRecitations.map((item) => (
                  <div key={item.id} className="event">
                    <strong>{item.title}</strong>
                    <span>{item.period || 'morning'} · {item.roundCount || 1} 轮 · {formatDateTime(item.createdAt)}</span>
                  </div>
                )) : <div className="empty-panel">暂无读诵</div>}
              </div>
            </Panel>

            <Panel className="span-4" title="审计日志" desc="权限和资产操作留痕">
              <div className="timeline">
                {recentAuditLogs.length ? recentAuditLogs.map((log) => (
                  <div key={log.id} className="event">
                    <strong>{log.action}</strong>
                    <span>{log.targetType || 'unknown'} · {formatDateTime(log.createdAt)}</span>
                  </div>
                )) : <div className="empty-panel">暂无审计日志</div>}
              </div>
            </Panel>
          </section>
        </>
      ) : null}

      {(loading || initializing) ? <div className="loading-mask">正在同步后台数据...</div> : null}
    </main>
  );
}

export default App;
