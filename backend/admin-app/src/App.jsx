import { useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'oneMind.admin.token';

const ROLE_PERMISSIONS = {
  super_admin: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'asset.publish', 'asset.access.manage', 'organization.member.manage', 'notification.dispatch'],
  platform_ops: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'notification.dispatch'],
  content_editor: ['admin.read', 'content.write', 'asset.write'],
  content_reviewer: ['admin.read', 'content.publish', 'asset.publish'],
  organization_admin: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'asset.publish', 'asset.access.manage', 'organization.member.manage', 'notification.dispatch'],
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

const TIME_RANGE_OPTIONS = [
  ['7d', '最近 7 天'],
  ['30d', '最近 30 天'],
  ['custom', '自定义']
];

const FILTER_CONTENT_TYPE_OPTIONS = [
  ['', '全部内容类型'],
  ...CONTENT_TYPE_OPTIONS
];

const FILTER_MODE_OPTIONS = [
  ['', '全部模式'],
  ['scientific', '科学背诵'],
  ['playful', '趣味背诵']
];

const MODE_LABELS = {
  scientific: '科学背诵',
  playful: '趣味背诵'
};

const PUBLISH_STATUS_OPTIONS = [
  ['draft', '草稿'],
  ['published', '已发布'],
  ['archived', '已归档']
];

const REVIEW_STATUS_OPTIONS = [
  ['draft', '待处理'],
  ['reviewing', '审核中'],
  ['approved', '已通过'],
  ['rejected', '已驳回']
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
  scene: '',
  publishStatus: 'draft',
  reviewStatus: 'draft',
  sourceNote: '',
  versionNote: ''
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

const EMPTY_FESTIVAL_FORM = {
  name: '',
  lunarDate: '',
  solarDate: '',
  relatedFigure: '',
  description: '',
  publishStatus: 'draft',
  recommendedContentIds: []
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

function formatJobStatus(status) {
  const key = String(status || '').trim();
  if (key === 'sent') return '已发送';
  if (key === 'failed') return '失败';
  if (key === 'cancelled') return '已取消';
  return '待发送';
}

function formatModeLabel(mode) {
  return MODE_LABELS[String(mode || '').trim()] || '未绑定模式';
}

function formatPercent(value, total) {
  if (!total) return '0%';
  return `${Math.round((Number(value || 0) / Number(total || 1)) * 100)}%`;
}

function formatStatusLabel(value, options) {
  return options.find(([key]) => key === value)?.[1] || value || '未设置';
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
    publishStatus: form.publishStatus,
    reviewStatus: form.reviewStatus,
    sourceNote: form.sourceNote.trim(),
    versionNote: form.versionNote.trim(),
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

function toFestivalPayload(form) {
  return {
    name: form.name.trim(),
    lunarDate: form.lunarDate.trim(),
    solarDate: form.solarDate.trim(),
    relatedFigure: form.relatedFigure.trim(),
    description: form.description.trim(),
    publishStatus: form.publishStatus,
    recommendedContentIds: Array.isArray(form.recommendedContentIds) ? form.recommendedContentIds : []
  };
}

function buildRoleText(session) {
  if (!session) return '角色：未登录';
  return `角色：${session.role || 'readonly_member'} · ${session.username || ''}`;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function getPresetDateRange(preset) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  const days = preset === '7d' ? 6 : 29;
  start.setDate(start.getDate() - days);
  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end)
  };
}

function createDefaultAdminFilters() {
  return {
    preset: '30d',
    organizationId: '',
    contentType: '',
    mode: '',
    ...getPresetDateRange('30d')
  };
}

function toBoundaryIso(dateValue, endOfDay = false) {
  const value = String(dateValue || '').trim();
  if (!value) return '';
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function buildQueryPath(path, query = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function formatFilterSummary(filters) {
  if (!filters?.startDate || !filters?.endDate) return '时间区间未设置';
  const labels = [`${filters.startDate} 至 ${filters.endDate}`];
  if (filters.organizationId) labels.push('已选组织');
  if (filters.contentType) labels.push(`类型 ${filters.contentType}`);
  if (filters.mode) labels.push(filters.mode === 'playful' ? '趣味背诵' : '科学背诵');
  return labels.join(' · ');
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
  const [adminFilters, setAdminFilters] = useState(() => createDefaultAdminFilters());
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [health, setHealth] = useState(null);
  const [session, setSession] = useState(null);
  const [overview, setOverview] = useState(null);
  const [contents, setContents] = useState([]);
  const [festivals, setFestivals] = useState([]);
  const [contentVersions, setContentVersions] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [assets, setAssets] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [notificationJobs, setNotificationJobs] = useState([]);
  const [loginForm, setLoginForm] = useState({ username: 'magic', password: '' });
  const [contentForm, setContentForm] = useState(EMPTY_CONTENT_FORM);
  const [festivalForm, setFestivalForm] = useState(EMPTY_FESTIVAL_FORM);
  const [editContentForm, setEditContentForm] = useState({ id: '', ...EMPTY_CONTENT_FORM });
  const [editFestivalForm, setEditFestivalForm] = useState({ id: '', ...EMPTY_FESTIVAL_FORM });
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET_FORM);
  const [editAssetForm, setEditAssetForm] = useState({ id: '', ...EMPTY_ASSET_FORM });
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER_FORM);
  const [selectedContentId, setSelectedContentId] = useState('');
  const [selectedFestivalId, setSelectedFestivalId] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [message, setMessage] = useState('');
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const permissions = useMemo(() => {
    const role = session?.role || 'readonly_member';
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.readonly_member;
  }, [session]);

  const selectedOrganization = useMemo(() => {
    if (!adminFilters.organizationId) return null;
    return organizations.find((item) => item.id === adminFilters.organizationId) || null;
  }, [organizations, adminFilters.organizationId]);

  const organizationNameMap = useMemo(
    () => Object.fromEntries(organizations.map((item) => [item.id, item.name])),
    [organizations]
  );

  const selectedContent = useMemo(
    () => contents.find((item) => item.id === selectedContentId) || null,
    [contents, selectedContentId]
  );

  const selectedFestival = useMemo(
    () => festivals.find((item) => item.id === selectedFestivalId) || null,
    [festivals, selectedFestivalId]
  );

  const selectedAsset = useMemo(
    () => assets.find((item) => item.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const contentTitleMap = useMemo(
    () => Object.fromEntries(contents.map((item) => [item.id, item.title])),
    [contents]
  );

  const recentPlans = overview?.recentPlans || [];
  const recentRecitations = overview?.recentRecitations || [];
  const recentAuditLogs = overview?.recentAuditLogs || auditLogs || [];
  const practiceTrend = overview?.practiceTrend || [];
  const recitationTrend = overview?.recitationTrend || [];
  const recentDispatches = overview?.recentDispatches || [];
  const modeDistribution = overview?.modeDistribution || { scientific: 0, playful: 0, total: 0 };
  const practiceTrendMax = Math.max(...practiceTrend.map((item) => Number(item.count || 0)), 1);
  const recitationTrendMax = Math.max(...recitationTrend.map((item) => Number(item.count || 0)), 1);
  const filterSummary = useMemo(() => formatFilterSummary(adminFilters), [adminFilters]);

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
      scene: selectedContent.scene || '',
      publishStatus: selectedContent.publishStatus || 'draft',
      reviewStatus: selectedContent.reviewStatus || 'draft',
      sourceNote: selectedContent.sourceNote || '',
      versionNote: selectedContent.versionNote || ''
    });
  }, [selectedContent]);

  useEffect(() => {
    if (!selectedFestival) return;
    setEditFestivalForm({
      id: selectedFestival.id,
      name: selectedFestival.name || '',
      lunarDate: selectedFestival.lunarDate || '',
      solarDate: selectedFestival.solarDate || '',
      relatedFigure: selectedFestival.relatedFigure || '',
      description: selectedFestival.description || '',
      publishStatus: selectedFestival.publishStatus || 'draft',
      recommendedContentIds: Array.isArray(selectedFestival.recommendedContentIds)
        ? selectedFestival.recommendedContentIds
        : []
    });
  }, [selectedFestival]);

  useEffect(() => {
    let active = true;
    if (!token || !selectedContentId) {
      setContentVersions([]);
      return () => {
        active = false;
      };
    }

    (async () => {
      try {
        const response = await request(`/api/admin/contents/${selectedContentId}/versions`, { token });
        if (active) setContentVersions(response.data || []);
      } catch (error) {
        if (active) setContentVersions([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [token, selectedContentId]);

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

  async function loadAdmin(activeToken = token, filters = adminFilters) {
    setLoading(true);
    setErrorText('');
    try {
      const nextHealth = await request('/health');
      setHealth(nextHealth);

      if (!activeToken) {
        setSession(null);
        setOverview(null);
        setContents([]);
        setFestivals([]);
        setContentVersions([]);
        setOrganizations([]);
        setAssets([]);
        setAuditLogs([]);
        setNotificationJobs([]);
        return;
      }

      const timeQuery = {
        startAt: toBoundaryIso(filters.startDate, false),
        endAt: toBoundaryIso(filters.endDate, true),
        organizationId: filters.organizationId,
        type: filters.contentType,
        mode: filters.mode
      };

      const [sessionResponse, overviewResponse, contentsResponse, festivalsResponse, organizationsResponse, auditResponse, notificationJobsResponse] = await Promise.all([
        request('/api/admin/session', { token: activeToken }),
        request(buildQueryPath('/api/admin/overview', timeQuery), { token: activeToken }),
        request(buildQueryPath('/api/admin/contents', timeQuery), { token: activeToken }),
        request('/api/admin/festivals', { token: activeToken }),
        request('/api/organizations', { token: activeToken }),
        request(buildQueryPath('/api/audit-logs', { ...timeQuery, limit: 50 }), { token: activeToken }),
        request(buildQueryPath('/api/admin/notification-jobs', { ...timeQuery, limit: 12 }), { token: activeToken })
      ]);

      const nextSession = sessionResponse.data || null;
      const nextOverview = overviewResponse.data || null;
      const nextContents = contentsResponse.data || [];
      const nextFestivals = festivalsResponse.data || [];
      const nextOrganizations = organizationsResponse.data || [];
      const nextAuditLogs = auditResponse.data || [];
      const nextNotificationJobs = notificationJobsResponse.data || [];
      const assetOrganizationIds = filters.organizationId
        ? [filters.organizationId]
        : nextOrganizations.map((item) => item.id);
      const assetResponses = await Promise.all(
        assetOrganizationIds.map((organizationId) => request(`/api/organizations/${organizationId}/assets`, { token: activeToken }))
      );
      const nextAssets = assetResponses.flatMap((response) => response.data || []);

      setSession(nextSession);
      setOverview(nextOverview);
      setContents(nextContents);
      setFestivals(nextFestivals);
      setOrganizations(nextOrganizations);
      setAssets(nextAssets);
      setAuditLogs(nextAuditLogs);
      setNotificationJobs(nextNotificationJobs);
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

  function handleRangePresetChange(event) {
    const nextPreset = event.target.value;
    setAdminFilters((prev) => ({
      preset: nextPreset,
      ...(nextPreset === 'custom'
        ? { startDate: prev.startDate, endDate: prev.endDate }
        : getPresetDateRange(nextPreset))
    }));
  }

  async function handleApplyFilters() {
    await loadAdmin(token, adminFilters);
    setMessage(`后台筛选已更新：${formatFilterSummary(adminFilters)}`);
  }

  async function handleResetFilters() {
    const nextFilters = createDefaultAdminFilters();
    setAdminFilters(nextFilters);
    await loadAdmin(token, nextFilters);
    setMessage(`已恢复默认时间区间：${formatFilterSummary(nextFilters)}`);
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
    setFestivals([]);
    setContentVersions([]);
    setOrganizations([]);
    setAssets([]);
    setAuditLogs([]);
    setNotificationJobs([]);
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
      payload: {
        ...toContentPayload(contentForm),
        ...(adminFilters.organizationId ? { organizationId: adminFilters.organizationId } : {})
      },
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

  async function handleCopyContentVersion(item) {
    setLoading(true);
    setErrorText('');
    try {
      const response = await request(`/api/admin/contents/${item.id}/copy-version`, {
        method: 'POST',
        token,
        payload: {
          versionNote: `基于 ${item.title} 复制新版本`
        }
      });
      const cloned = response.data || null;
      await loadAdmin(token);
      if (cloned?.id) {
        setSelectedContentId(cloned.id);
      }
      setMessage(`已从「${item.title}」复制出新的草稿版本。`);
    } catch (error) {
      setErrorText(error.message || '复制新版本失败');
    } finally {
      setLoading(false);
    }
  }

  function attachFestivalContent(setter, contentId) {
    if (!contentId) return;
    setter((prev) => {
      const current = Array.isArray(prev.recommendedContentIds) ? prev.recommendedContentIds : [];
      if (current.includes(contentId)) return prev;
      return {
        ...prev,
        recommendedContentIds: [...current, contentId]
      };
    });
  }

  function detachFestivalContent(setter, contentId) {
    setter((prev) => ({
      ...prev,
      recommendedContentIds: (prev.recommendedContentIds || []).filter((item) => item !== contentId)
    }));
  }

  function moveFestivalContent(setter, contentId, direction) {
    setter((prev) => {
      const current = [...(prev.recommendedContentIds || [])];
      const index = current.indexOf(contentId);
      if (index < 0) return prev;
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return prev;
      const swap = current[nextIndex];
      current[nextIndex] = current[index];
      current[index] = swap;
      return {
        ...prev,
        recommendedContentIds: current
      };
    });
  }

  async function handleCreateFestival(event) {
    event.preventDefault();
    await mutate('/api/admin/festivals', {
      method: 'POST',
      payload: toFestivalPayload(festivalForm),
      successMessage: '节日专题已保存。'
    });
    setFestivalForm(EMPTY_FESTIVAL_FORM);
  }

  async function handleUpdateFestival(event) {
    event.preventDefault();
    if (!editFestivalForm.id) return;
    await mutate(`/api/admin/festivals/${editFestivalForm.id}`, {
      method: 'PUT',
      payload: toFestivalPayload(editFestivalForm),
      successMessage: '节日专题已更新。'
    });
  }

  async function handleArchiveFestival(item) {
    if (!window.confirm(`确认归档节日专题「${item.name}」？`)) return;
    await mutate(`/api/admin/festivals/${item.id}`, {
      method: 'DELETE',
      payload: {},
      successMessage: `已归档节日专题：${item.name}`
    });
  }

  async function handleCreateAsset(event) {
    event.preventDefault();
    await mutate('/api/admin/assets', {
      method: 'POST',
      payload: {
        ...toAssetPayload(assetForm),
        ...(adminFilters.organizationId ? { organizationId: adminFilters.organizationId } : {})
      },
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
    if (!selectedOrganization) return;
    await mutate(`/api/organizations/${selectedOrganization.id}/members`, {
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
          <Panel
            title="运营筛选"
            desc="当前会联动概览指标、内容库、组织资产、最近计划、最近读诵和审计日志。"
            actions={<span className="panel-kicker">{filterSummary}</span>}
          >
            <div className="filter-toolbar">
              <label className="field-stack">
                <span>组织</span>
                <select
                  value={adminFilters.organizationId}
                  onChange={(event) => setAdminFilters((prev) => ({ ...prev, organizationId: event.target.value }))}
                >
                  <option value="">全部组织</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label className="field-stack">
                <span>内容类型</span>
                <select
                  value={adminFilters.contentType}
                  onChange={(event) => setAdminFilters((prev) => ({ ...prev, contentType: event.target.value }))}
                >
                  {FILTER_CONTENT_TYPE_OPTIONS.map(([value, label]) => (
                    <option key={value || 'all'} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="field-stack">
                <span>训练模式</span>
                <select
                  value={adminFilters.mode}
                  onChange={(event) => setAdminFilters((prev) => ({ ...prev, mode: event.target.value }))}
                >
                  {FILTER_MODE_OPTIONS.map(([value, label]) => (
                    <option key={value || 'all'} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="field-stack">
                <span>时间区间</span>
                <select value={adminFilters.preset} onChange={handleRangePresetChange}>
                  {TIME_RANGE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="field-stack">
                <span>开始日期</span>
                <input
                  type="date"
                  value={adminFilters.startDate}
                  onChange={(event) => setAdminFilters((prev) => ({
                    ...prev,
                    preset: 'custom',
                    startDate: event.target.value
                  }))}
                />
              </label>
              <label className="field-stack">
                <span>结束日期</span>
                <input
                  type="date"
                  value={adminFilters.endDate}
                  onChange={(event) => setAdminFilters((prev) => ({
                    ...prev,
                    preset: 'custom',
                    endDate: event.target.value
                  }))}
                />
              </label>
              <div className="filter-actions">
                <button type="button" className="ghost-button" onClick={handleResetFilters} disabled={loading}>
                  恢复默认
                </button>
                <button type="button" onClick={handleApplyFilters} disabled={loading || !token}>
                  应用筛选
                </button>
              </div>
            </div>
          </Panel>

          <section className="metric-grid">
            {Object.keys(METRIC_LABELS).map((key) => (
              <div key={key} className="metric">
                <strong>{overview?.[key] || 0}</strong>
                <span>{METRIC_LABELS[key]}</span>
              </div>
            ))}
          </section>

          <section className="panel-grid">
            <Panel className="span-4" title="训练趋势" desc="按当前筛选区间展示最近 7 个自然日的训练与读诵量。">
              <div className="trend-stack">
                <div className="trend-section">
                  <div className="trend-title">
                    <strong>训练</strong>
                    <span>{overview?.practiceSessionCount || 0} 次</span>
                  </div>
                  {practiceTrend.length ? practiceTrend.map((item) => (
                    <div key={`practice-${item.day}`} className="trend-row">
                      <span>{item.label}</span>
                      <div className="trend-bar-track">
                        <div
                          className="trend-bar-fill trend-bar-fill-red"
                          style={{ width: item.count ? `${Math.max(12, (item.count / practiceTrendMax) * 100)}%` : '0%' }}
                        />
                      </div>
                      <strong>{item.count}</strong>
                    </div>
                  )) : <div className="empty-panel">当前区间暂无训练记录</div>}
                </div>
                <div className="trend-section">
                  <div className="trend-title">
                    <strong>读诵</strong>
                    <span>{overview?.recitationSessionCount || 0} 次</span>
                  </div>
                  {recitationTrend.length ? recitationTrend.map((item) => (
                    <div key={`recitation-${item.day}`} className="trend-row">
                      <span>{item.label}</span>
                      <div className="trend-bar-track">
                        <div
                          className="trend-bar-fill trend-bar-fill-gold"
                          style={{ width: item.count ? `${Math.max(12, (item.count / recitationTrendMax) * 100)}%` : '0%' }}
                        />
                      </div>
                      <strong>{item.count}</strong>
                    </div>
                  )) : <div className="empty-panel">当前区间暂无读诵记录</div>}
                </div>
              </div>
            </Panel>

            <Panel className="span-4" title="模式占比" desc="按当前筛选结果统计科学 / 趣味计划分布。">
              <div className="split-stack">
                <div className="split-bar">
                  <div
                    className="split-bar-segment split-bar-scientific"
                    style={{ width: `${Math.max(0, Number(modeDistribution.scientific || 0) / Math.max(Number(modeDistribution.total || 1), 1) * 100)}%` }}
                  />
                  <div
                    className="split-bar-segment split-bar-playful"
                    style={{ width: `${Math.max(0, Number(modeDistribution.playful || 0) / Math.max(Number(modeDistribution.total || 1), 1) * 100)}%` }}
                  />
                </div>
                <div className="split-metrics">
                  <div className="split-metric">
                    <strong>{modeDistribution.scientific || 0}</strong>
                    <span>科学背诵 · {formatPercent(modeDistribution.scientific, modeDistribution.total)}</span>
                  </div>
                  <div className="split-metric">
                    <strong>{modeDistribution.playful || 0}</strong>
                    <span>趣味背诵 · {formatPercent(modeDistribution.playful, modeDistribution.total)}</span>
                  </div>
                </div>
                <div className="empty-panel">
                  当前计划总数 {modeDistribution.total || 0}，可结合顶部组织 / 类型 / 模式筛选做运营观察。
                </div>
              </div>
            </Panel>

            <Panel className="span-4" title="最近派发" desc="仅展示已发送提醒，便于核对派发结果。">
              <div className="timeline">
                {recentDispatches.length ? recentDispatches.map((job) => (
                  <div key={job.id} className="event">
                    <strong>{job.title || job.payload?.title || '未绑定内容'}</strong>
                    <span>{job.userNickname || job.userId} · {formatModeLabel(job.mode)} · {job.channel}</span>
                    <span>计划时间 {formatDateTime(job.scheduledAt)}</span>
                    <span>发送时间 {formatDateTime(job.sentAt)}</span>
                  </div>
                )) : <div className="empty-panel">当前区间暂无已发送提醒</div>}
              </div>
            </Panel>
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
                      <th>状态</th>
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
                        <td>{formatStatusLabel(item.publishStatus, PUBLISH_STATUS_OPTIONS)} / {formatStatusLabel(item.reviewStatus, REVIEW_STATUS_OPTIONS)}</td>
                        <td>{item.planDays}</td>
                        <td>{item.accessLevel}</td>
                        <td>
                          <div className="table-actions">
                            {can('content.write') ? (
                              <button type="button" className="mini-button" onClick={() => setSelectedContentId(item.id)}>
                                编辑
                              </button>
                            ) : null}
                            {can('content.write') ? (
                              <button type="button" className="mini-button" onClick={() => handleCopyContentVersion(item)}>
                                复制新版本
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
              desc={adminFilters.organizationId ? (selectedOrganization ? `当前组织：${selectedOrganization.name}` : '所选组织不存在') : '当前组织：全部组织'}
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
                    <span>
                      {asset.type}
                      {' · '}
                      {asset.accessLevel}
                      {' · '}
                      {asset.copyrightStatus || '未标注版权'}
                      {!adminFilters.organizationId && asset.organizationId ? ` · ${organizationNameMap[asset.organizationId] || '未知组织'}` : ''}
                    </span>
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

            <Panel
              className="span-12"
              title="节日专题"
              desc="维护首页节日卡说明、发布状态与推荐内容顺序。"
              actions={<span className="panel-kicker">{festivals.length} 个专题</span>}
            >
              <div className="asset-list">
                {festivals.length ? festivals.map((festival) => (
                  <div key={festival.id} className={`asset-card ${selectedFestivalId === festival.id ? 'asset-card-active' : ''}`}>
                    <div className="asset-head">
                      <strong>{festival.name}</strong>
                      <span className="chip">{formatStatusLabel(festival.publishStatus, PUBLISH_STATUS_OPTIONS)}</span>
                    </div>
                    <span>
                      {(festival.lunarDate || '未设日期')}
                      {festival.relatedFigure ? ` · ${festival.relatedFigure}` : ''}
                      {festival.recommendedContentIds?.length ? ` · 推荐 ${festival.recommendedContentIds.length} 条内容` : ' · 暂无推荐内容'}
                    </span>
                    <div className="festival-linked-list">
                      {(festival.recommendedContentIds || []).length ? festival.recommendedContentIds.map((contentId, index) => (
                        <span key={`${festival.id}-${contentId}`} className="chip">
                          {index + 1}. {contentTitleMap[contentId] || contentId}
                        </span>
                      )) : <span className="chip">未配置专题内容</span>}
                    </div>
                    <div className="asset-actions">
                      {can('content.write') ? (
                        <button type="button" className="mini-button" onClick={() => setSelectedFestivalId(festival.id)}>
                          编辑
                        </button>
                      ) : null}
                      {can('content.publish') ? (
                        <button type="button" className="mini-button danger" onClick={() => handleArchiveFestival(festival)}>
                          归档
                        </button>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="empty-panel">创建节日专题后，这里会展示首页可运营的专题列表。</div>
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
                  <select value={contentForm.publishStatus} onChange={(e) => setContentForm((p) => ({ ...p, publishStatus: e.target.value }))}>
                    {PUBLISH_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select value={contentForm.reviewStatus} onChange={(e) => setContentForm((p) => ({ ...p, reviewStatus: e.target.value }))}>
                    {REVIEW_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <input value={contentForm.recommendedRecitationTime} placeholder="读诵时段" onChange={(e) => setContentForm((p) => ({ ...p, recommendedRecitationTime: e.target.value }))} />
                  <input value={contentForm.recitationTheme} placeholder="读诵主题" onChange={(e) => setContentForm((p) => ({ ...p, recitationTheme: e.target.value }))} />
                </div>
                <div className="form-grid">
                  <input value={contentForm.sourceNote} placeholder="来源说明" onChange={(e) => setContentForm((p) => ({ ...p, sourceNote: e.target.value }))} />
                  <input value={contentForm.versionNote} placeholder="版本说明" onChange={(e) => setContentForm((p) => ({ ...p, versionNote: e.target.value }))} />
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={contentForm.supportsRecitation} onChange={(e) => setContentForm((p) => ({ ...p, supportsRecitation: e.target.checked }))} />
                  <span>支持日常读诵</span>
                </label>
                <input value={contentForm.scene} placeholder="场景，例如：晨课静坐" onChange={(e) => setContentForm((p) => ({ ...p, scene: e.target.value }))} />
                <button type="submit" disabled={!can('content.write') || loading}>保存内容</button>
              </form>
            </Panel>

            <Panel
              className="span-4"
              title="编辑内容"
              desc={selectedContent
                ? `当前：${selectedContent.title}${selectedContent.sourceVersionNo ? ` · 源版本 v${selectedContent.sourceVersionNo}` : ''}`
                : '从内容库点击“编辑”后加载'}
            >
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
                  <select value={editContentForm.publishStatus} onChange={(e) => setEditContentForm((p) => ({ ...p, publishStatus: e.target.value }))}>
                    {PUBLISH_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select value={editContentForm.reviewStatus} onChange={(e) => setEditContentForm((p) => ({ ...p, reviewStatus: e.target.value }))}>
                    {REVIEW_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <input value={editContentForm.recommendedRecitationTime} placeholder="读诵时段" onChange={(e) => setEditContentForm((p) => ({ ...p, recommendedRecitationTime: e.target.value }))} />
                  <input value={editContentForm.recitationTheme} placeholder="读诵主题" onChange={(e) => setEditContentForm((p) => ({ ...p, recitationTheme: e.target.value }))} />
                </div>
                <div className="form-grid">
                  <input value={editContentForm.sourceNote} placeholder="来源说明" onChange={(e) => setEditContentForm((p) => ({ ...p, sourceNote: e.target.value }))} />
                  <input value={editContentForm.versionNote} placeholder="版本说明" onChange={(e) => setEditContentForm((p) => ({ ...p, versionNote: e.target.value }))} />
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={editContentForm.supportsRecitation} onChange={(e) => setEditContentForm((p) => ({ ...p, supportsRecitation: e.target.checked }))} />
                  <span>支持日常读诵</span>
                </label>
                <input value={editContentForm.scene} placeholder="场景" onChange={(e) => setEditContentForm((p) => ({ ...p, scene: e.target.value }))} />
                <button type="submit" disabled={!can('content.write') || !editContentForm.id || loading}>保存修改</button>
              </form>
            </Panel>

            <Panel
              className="span-4"
              title="版本痕迹"
              desc={selectedContent ? '已发布内容更新前会自动保存快照，也可手动复制新版本。' : '选择一条内容后查看版本快照'}
            >
              <div className="timeline">
                {selectedContent ? (
                  <>
                    <div className="event">
                      <strong>当前内容</strong>
                      <span>{formatStatusLabel(selectedContent.publishStatus, PUBLISH_STATUS_OPTIONS)} / {formatStatusLabel(selectedContent.reviewStatus, REVIEW_STATUS_OPTIONS)}</span>
                      <span>{selectedContent.sourceVersionNo ? `源自版本 v${selectedContent.sourceVersionNo}` : '当前为主内容或首次创建版本'}</span>
                      <span>{selectedContent.versionNote || '未填写版本说明'}</span>
                    </div>
                    {contentVersions.length ? contentVersions.map((version) => (
                      <div key={version.id} className="event">
                        <strong>v{version.versionNo}</strong>
                        <span>{version.snapshotJson?.title || selectedContent.title}</span>
                        <span>{version.changeNote || '未填写快照说明'}</span>
                        <span>{formatDateTime(version.createdAt)}</span>
                      </div>
                    )) : <div className="empty-panel">当前内容还没有历史快照</div>}
                  </>
                ) : <div className="empty-panel">请选择一条内容后查看版本痕迹</div>}
              </div>
            </Panel>

            <Panel className="span-4" title="新增节日专题" desc="维护首页节日卡与内容库专题筛选来源。">
              <form className="form-stack" onSubmit={handleCreateFestival}>
                <input value={festivalForm.name} placeholder="专题标题" onChange={(e) => setFestivalForm((p) => ({ ...p, name: e.target.value }))} required />
                <div className="form-grid">
                  <input value={festivalForm.lunarDate} placeholder="农历日期" onChange={(e) => setFestivalForm((p) => ({ ...p, lunarDate: e.target.value }))} />
                  <input type="date" value={festivalForm.solarDate} onChange={(e) => setFestivalForm((p) => ({ ...p, solarDate: e.target.value }))} />
                </div>
                <input value={festivalForm.relatedFigure} placeholder="相关圣者 / 主题" onChange={(e) => setFestivalForm((p) => ({ ...p, relatedFigure: e.target.value }))} />
                <textarea rows="4" value={festivalForm.description} placeholder="首页节日卡说明" onChange={(e) => setFestivalForm((p) => ({ ...p, description: e.target.value }))} required />
                <select value={festivalForm.publishStatus} onChange={(e) => setFestivalForm((p) => ({ ...p, publishStatus: e.target.value }))}>
                  {PUBLISH_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div className="festival-selector">
                  <div className="festival-selector-head">
                    <strong>推荐内容顺序</strong>
                    <span>{festivalForm.recommendedContentIds.length} 条</span>
                  </div>
                  <div className="festival-linked-list">
                    {festivalForm.recommendedContentIds.length ? festivalForm.recommendedContentIds.map((contentId, index) => (
                      <div key={`new-${contentId}`} className="festival-linked-item">
                        <span>{index + 1}. {contentTitleMap[contentId] || contentId}</span>
                        <div className="festival-linked-actions">
                          <button type="button" className="mini-button" onClick={() => moveFestivalContent(setFestivalForm, contentId, 'up')}>上移</button>
                          <button type="button" className="mini-button" onClick={() => moveFestivalContent(setFestivalForm, contentId, 'down')}>下移</button>
                          <button type="button" className="mini-button danger" onClick={() => detachFestivalContent(setFestivalForm, contentId)}>移除</button>
                        </div>
                      </div>
                    )) : <div className="empty-panel">先从下方内容列表中加入专题推荐。</div>}
                  </div>
                  <div className="festival-available-list">
                    {contents.map((item) => (
                      <button
                        key={`pick-${item.id}`}
                        type="button"
                        className="mini-button"
                        disabled={festivalForm.recommendedContentIds.includes(item.id)}
                        onClick={() => attachFestivalContent(setFestivalForm, item.id)}
                      >
                        {festivalForm.recommendedContentIds.includes(item.id) ? `已加入 · ${item.title}` : `加入 · ${item.title}`}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={!can('content.write') || loading}>保存专题</button>
              </form>
            </Panel>

            <Panel className="span-4" title="编辑节日专题" desc={selectedFestival ? `当前：${selectedFestival.name}` : '从上方节日专题列表点击“编辑”后加载'}>
              <form className="form-stack" onSubmit={handleUpdateFestival}>
                <input value={editFestivalForm.name} placeholder="专题标题" onChange={(e) => setEditFestivalForm((p) => ({ ...p, name: e.target.value }))} required />
                <div className="form-grid">
                  <input value={editFestivalForm.lunarDate} placeholder="农历日期" onChange={(e) => setEditFestivalForm((p) => ({ ...p, lunarDate: e.target.value }))} />
                  <input type="date" value={editFestivalForm.solarDate} onChange={(e) => setEditFestivalForm((p) => ({ ...p, solarDate: e.target.value }))} />
                </div>
                <input value={editFestivalForm.relatedFigure} placeholder="相关圣者 / 主题" onChange={(e) => setEditFestivalForm((p) => ({ ...p, relatedFigure: e.target.value }))} />
                <textarea rows="4" value={editFestivalForm.description} placeholder="首页节日卡说明" onChange={(e) => setEditFestivalForm((p) => ({ ...p, description: e.target.value }))} required />
                <select value={editFestivalForm.publishStatus} onChange={(e) => setEditFestivalForm((p) => ({ ...p, publishStatus: e.target.value }))}>
                  {PUBLISH_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div className="festival-selector">
                  <div className="festival-selector-head">
                    <strong>推荐内容顺序</strong>
                    <span>{editFestivalForm.recommendedContentIds.length} 条</span>
                  </div>
                  <div className="festival-linked-list">
                    {editFestivalForm.recommendedContentIds.length ? editFestivalForm.recommendedContentIds.map((contentId, index) => (
                      <div key={`edit-${contentId}`} className="festival-linked-item">
                        <span>{index + 1}. {contentTitleMap[contentId] || contentId}</span>
                        <div className="festival-linked-actions">
                          <button type="button" className="mini-button" onClick={() => moveFestivalContent(setEditFestivalForm, contentId, 'up')}>上移</button>
                          <button type="button" className="mini-button" onClick={() => moveFestivalContent(setEditFestivalForm, contentId, 'down')}>下移</button>
                          <button type="button" className="mini-button danger" onClick={() => detachFestivalContent(setEditFestivalForm, contentId)}>移除</button>
                        </div>
                      </div>
                    )) : <div className="empty-panel">当前专题还没有推荐内容。</div>}
                  </div>
                  <div className="festival-available-list">
                    {contents.map((item) => (
                      <button
                        key={`edit-pick-${item.id}`}
                        type="button"
                        className="mini-button"
                        disabled={editFestivalForm.recommendedContentIds.includes(item.id)}
                        onClick={() => attachFestivalContent(setEditFestivalForm, item.id)}
                      >
                        {editFestivalForm.recommendedContentIds.includes(item.id) ? `已加入 · ${item.title}` : `加入 · ${item.title}`}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={!can('content.write') || !editFestivalForm.id || loading}>保存专题修改</button>
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

            <Panel className="span-4" title="组织成员" desc={selectedOrganization ? `添加到 ${selectedOrganization.name}` : '请先在顶部筛选中选择一个组织'}>
              {selectedOrganization ? (
                <form className="form-stack" onSubmit={handleAddMember}>
                  <input value={memberForm.userId} placeholder="用户 UUID" onChange={(e) => setMemberForm((p) => ({ ...p, userId: e.target.value }))} required />
                  <select value={memberForm.role} onChange={(e) => setMemberForm((p) => ({ ...p, role: e.target.value }))}>
                    {MEMBER_ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="submit" disabled={!can('organization.member.manage') || loading}>添加成员</button>
                </form>
              ) : (
                <div className="empty-panel">未显式选中组织时，不再默认写入第一家组织。请先在“运营筛选”里选择目标组织。</div>
              )}
            </Panel>
          </section>

          <section className="panel-grid">
            <Panel
              className="span-4"
              title="提醒任务"
              desc="查看 pending / sent 状态，并可直接触发一次派发。"
              actions={<button type="button" onClick={handleDispatchNotifications} disabled={!can('notification.dispatch') || loading}>派发提醒</button>}
            >
              <div className="timeline">
                {notificationJobs.length ? notificationJobs.map((job) => (
                  <div key={job.id} className="event">
                    <strong>{job.title || job.payload?.title || '未绑定内容'}</strong>
                    <span>{formatJobStatus(job.status)} · {job.channel} · {job.mode || '未绑定模式'}</span>
                    <span>{job.userNickname || job.userId} · 计划时间 {formatDateTime(job.scheduledAt)}</span>
                    <span>{job.sentAt ? `发送时间 ${formatDateTime(job.sentAt)}` : '尚未发送'}</span>
                  </div>
                )) : <div className="empty-panel">暂无提醒任务</div>}
              </div>
            </Panel>

            <Panel className="span-4" title="复习计划" desc="最近创建的用户记忆计划">
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
