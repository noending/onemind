const state = {
  token: localStorage.getItem('oneMind.admin.token') || '',
  session: null,
  overview: null,
  contents: [],
  organizations: [],
  assets: [],
  auditLogs: []
};

const ROLE_PERMISSIONS = {
  super_admin: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'asset.publish', 'asset.access.manage', 'organization.member.manage'],
  platform_ops: ['admin.read', 'content.write', 'content.publish', 'asset.write'],
  content_editor: ['admin.read', 'content.write', 'asset.write'],
  content_reviewer: ['admin.read', 'content.publish', 'asset.publish'],
  organization_admin: ['admin.read', 'content.write', 'content.publish', 'asset.write', 'asset.publish', 'asset.access.manage', 'organization.member.manage'],
  asset_maintainer: ['admin.read', 'asset.write'],
  readonly_member: ['admin.read']
};

const labels = {
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

async function api(path) {
  const response = await fetch(path, {
    headers: authHeaders()
  });
  if (response.status === 401) {
    showLogin('请先登录管理后台。');
    throw new Error('UNAUTHORIZED');
  }
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

async function apiMutation(path, payload, method = 'POST') {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders()
    },
    body: JSON.stringify(payload)
  });
  if (response.status === 401) {
    showLogin('登录状态已失效，请重新登录。');
    throw new Error('UNAUTHORIZED');
  }
  if (response.status === 403) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.message || 'FORBIDDEN');
  }
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

async function login(username, password) {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) throw new Error('账号或密码不正确');
  const json = await response.json();
  state.token = json.data.token;
  localStorage.setItem('oneMind.admin.token', state.token);
  hideLogin();
  await loadAdmin();
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function loadAdmin() {
  if (!state.token) {
    showLogin('请登录后查看管理数据。');
    return;
  }

  const [health, session, overview, contents, organizations, auditLogs] = await Promise.all([
    api('/health'),
    api('/api/admin/session'),
    api('/api/admin/overview'),
    api('/api/contents'),
    api('/api/organizations'),
    api('/api/audit-logs')
  ]);

  state.session = session.data || null;
  state.overview = overview.data;
  state.contents = contents.data || [];
  state.organizations = organizations.data || [];
  state.auditLogs = auditLogs.data || [];

  const organizationId = state.organizations[0] && state.organizations[0].id;
  if (organizationId) {
    const assets = await api(`/api/organizations/${organizationId}/assets`);
    state.assets = assets.data || [];
  }

  renderHealth(health);
  applyPermissionGuards();
  renderMetrics();
  renderContents();
  renderAssets();
  renderPlans();
  renderRecitations();
  renderAudits();
}

function renderHealth(health) {
  document.querySelector('#storeMode').textContent = health.storeMode === 'postgres'
    ? 'PostgreSQL 已连接'
    : '内存模式';
  document.querySelector('#healthText').textContent = health.phase || '后台运行中';
  const roleText = state.session
    ? `角色：${state.session.role || 'readonly_member'} · ${state.session.username || ''}`
    : '角色：未登录';
  document.querySelector('#adminRoleText').textContent = roleText;
}

function renderMetrics() {
  const keys = Object.keys(labels);
  document.querySelector('#metrics').innerHTML = keys.map((key) => `
    <div class="metric">
      <strong>${state.overview[key] || 0}</strong>
      <span>${labels[key]}</span>
    </div>
  `).join('');
}

function renderContents() {
  const canContentWrite = can('content.write');
  const canContentPublish = can('content.publish');
  document.querySelector('#contentRows').innerHTML = state.contents.map((item) => `
    <tr>
      <td>${escapeHtml(item.title)}</td>
      <td><span class="chip">${escapeHtml(item.type)}</span></td>
      <td>${escapeHtml(Array.isArray(item.supportedModes) ? item.supportedModes.join(' / ') : item.defaultMode || 'scientific')}</td>
      <td>${item.planDays}</td>
      <td>${escapeHtml(item.accessLevel)}</td>
      <td>
        <div class="table-actions">
          ${canContentWrite ? `<button class="mini-button edit-content" data-content-id="${escapeHtml(item.id)}" type="button">编辑</button>` : ''}
          ${canContentPublish ? `<button class="mini-button danger archive-content" data-content-id="${escapeHtml(item.id)}" type="button">下架</button>` : ''}
          ${!canContentWrite && !canContentPublish ? '<span class="chip">只读</span>' : ''}
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.edit-content').forEach((button) => {
    button.addEventListener('click', () => {
      const content = state.contents.find((item) => item.id === button.dataset.contentId);
      if (!content) return;
      fillEditForm(content);
    });
  });

  document.querySelectorAll('.archive-content').forEach((button) => {
    button.addEventListener('click', async () => {
      const content = state.contents.find((item) => item.id === button.dataset.contentId);
      if (!content) return;
      if (!confirm(`确认下架「${content.title}」？`)) return;
      await apiMutation(`/api/admin/contents/${content.id}`, {}, 'DELETE');
      setActionMessage(`已下架：${content.title}`);
      await loadAdmin();
    });
  });
}

function renderAssets() {
  const canAssetWrite = can('asset.write');
  const canAssetPublish = can('asset.publish');
  const canManageAssetAccess = can('asset.access.manage');
  document.querySelector('#assetRows').innerHTML = state.assets.map((asset) => `
    <div class="asset">
      <div class="asset-head">
        <strong>${escapeHtml(asset.title)}</strong>
        <select data-asset-id="${escapeHtml(asset.id)}" class="asset-access" ${canManageAssetAccess ? '' : 'disabled'}>
          ${renderAccessOptions(asset.accessLevel)}
        </select>
      </div>
      <span>${escapeHtml(asset.type)} · ${escapeHtml(asset.accessLevel)} · ${escapeHtml(asset.copyrightStatus || '未标注版权')}</span>
      <div class="asset-actions">
        ${canAssetWrite ? `<button class="mini-button edit-asset" data-asset-id="${escapeHtml(asset.id)}" type="button">编辑</button>` : ''}
        ${canAssetPublish ? `<button class="mini-button danger archive-asset" data-asset-id="${escapeHtml(asset.id)}" type="button">下架</button>` : ''}
        ${!canAssetWrite && !canAssetPublish ? '<span class="chip">只读</span>' : ''}
      </div>
    </div>
  `).join('') || '<div class="asset"><strong>暂无资产</strong><span>创建组织资产后会出现在这里</span></div>';

  if (canManageAssetAccess) {
    document.querySelectorAll('.asset-access').forEach((select) => {
      select.addEventListener('change', async (event) => {
        const assetId = event.currentTarget.dataset.assetId;
        const accessLevel = event.currentTarget.value;
        await apiMutation(`/api/assets/${assetId}/access`, { accessLevel }, 'PUT');
        setActionMessage('资产访问级别已更新');
        await loadAdmin();
      });
    });
  }

  document.querySelectorAll('.edit-asset').forEach((button) => {
    button.addEventListener('click', () => {
      const asset = state.assets.find((item) => item.id === button.dataset.assetId);
      if (!asset) return;
      fillAssetForm(asset);
    });
  });

  document.querySelectorAll('.archive-asset').forEach((button) => {
    button.addEventListener('click', async () => {
      const asset = state.assets.find((item) => item.id === button.dataset.assetId);
      if (!asset) return;
      if (!confirm(`确认下架资产「${asset.title}」？`)) return;
      await apiMutation(`/api/admin/assets/${asset.id}`, {}, 'DELETE');
      setActionMessage(`已下架资产：${asset.title}`);
      await loadAdmin();
    });
  });
}

function renderPlans() {
  const plans = (state.overview.recentPlans || []);
  document.querySelector('#planRows').innerHTML = plans.map((plan) => `
    <div class="event">
      <strong>${escapeHtml(plan.title)}</strong>
      <span>${escapeHtml(plan.mode || 'scientific')} · ${escapeHtml(plan.state)} · 掌握度 ${plan.masteryScore}%</span>
    </div>
  `).join('') || '<div class="event"><strong>暂无计划</strong><span>前台创建记忆计划后会同步到数据库</span></div>';
}

function renderRecitations() {
  const rows = (state.overview.recentRecitations || []);
  document.querySelector('#recitationRows').innerHTML = rows.map((item) => `
    <div class="event">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.period || 'morning')} · ${item.roundCount || 1} 轮</span>
    </div>
  `).join('') || '<div class="event"><strong>暂无读诵</strong><span>前台完成日常读诵后会显示在这里</span></div>';
}

function renderAudits() {
  const logs = (state.overview.recentAuditLogs || state.auditLogs || []);
  document.querySelector('#auditRows').innerHTML = logs.map((log) => `
    <div class="event">
      <strong>${escapeHtml(log.action)}</strong>
      <span>${escapeHtml(log.targetType || '')} · ${formatDate(log.createdAt)}</span>
    </div>
  `).join('') || '<div class="event"><strong>暂无审计</strong><span>权限和资产操作会在这里留痕</span></div>';
}

function formatDate(value) {
  if (!value) return '未记录时间';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderAccessOptions(current) {
  const options = [
    ['public', '公开'],
    ['registered', '登录可见'],
    ['member', '组织成员'],
    ['restricted', '指定人员'],
    ['private', '私密']
  ];
  return options.map(([value, label]) => (
    `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`
  )).join('');
}

function setActionMessage(message) {
  document.querySelector('#actionMessage').textContent = message;
}

function showLogin(message) {
  document.querySelector('#loginPanel').classList.add('active');
  document.querySelector('#loginMessage').textContent = message || '请输入管理员账号。';
  state.session = null;
  document.querySelector('#adminRoleText').textContent = '角色：未登录';
}

function hideLogin() {
  document.querySelector('#loginPanel').classList.remove('active');
}

function formDataToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function contentFormPayload(form) {
  const payload = formDataToObject(form);
  payload.planDays = Number(payload.planDays || 1);
  payload.segments = payload.body;
  payload.supportedModes = String(payload.supportedModes || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  payload.supportsRecitation = form.elements.supportsRecitation.checked;
  return payload;
}

function fillEditForm(content) {
  const form = document.querySelector('#editContentForm');
  form.elements.id.value = content.id;
  form.elements.title.value = content.title || '';
  form.elements.type.value = content.type || 'mantra';
  form.elements.body.value = content.preview || '';
  form.elements.planDays.value = content.planDays || 1;
  form.elements.lengthTier.value = content.lengthTier || 'short';
  form.elements.defaultMode.value = content.defaultMode || 'scientific';
  form.elements.supportedModes.value = Array.isArray(content.supportedModes) ? content.supportedModes.join(',') : 'scientific';
  form.elements.recommendedRecitationTime.value = content.recommendedRecitationTime || '';
  form.elements.recitationTheme.value = content.recitationTheme || '';
  form.elements.supportsRecitation.checked = content.supportsRecitation !== false;
  form.elements.scene.value = content.scene || '';
  setActionMessage(`正在编辑：${content.title}`);
}

function fillAssetForm(asset) {
  const form = document.querySelector('#editAssetForm');
  form.elements.id.value = asset.id;
  form.elements.title.value = asset.title || '';
  form.elements.type.value = asset.type || 'document';
  form.elements.url.value = asset.url || '';
  form.elements.accessLevel.value = asset.accessLevel || 'private';
  form.elements.copyrightStatus.value = asset.copyrightStatus || '';
  setActionMessage(`正在编辑资产：${asset.title}`);
}

function applyPermissionGuards() {
  document.querySelectorAll('[data-permission]').forEach((node) => {
    const permission = node.dataset.permission;
    node.classList.toggle('is-hidden', !can(permission));
  });
}

function can(permission) {
  if (!state.session) return false;
  const role = state.session.role || 'readonly_member';
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.readonly_member;
  return permissions.includes(permission);
}

document.querySelector('#contentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!can('content.write')) {
    setActionMessage('当前角色无内容编辑权限');
    return;
  }
  const payload = contentFormPayload(event.currentTarget);
  await apiMutation('/api/admin/contents', payload);
  event.currentTarget.reset();
  setActionMessage('内容已保存，并写入数据库');
  await loadAdmin();
});

document.querySelector('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = formDataToObject(event.currentTarget);
  try {
    await login(payload.username, payload.password);
  } catch (error) {
    showLogin(error.message);
  }
});

document.querySelector('#logoutButton').addEventListener('click', () => {
  state.token = '';
  localStorage.removeItem('oneMind.admin.token');
  showLogin('已退出，请重新登录。');
});

document.querySelector('#assetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!can('asset.write')) {
    setActionMessage('当前角色无资产编辑权限');
    return;
  }
  const payload = formDataToObject(event.currentTarget);
  await apiMutation('/api/admin/assets', payload);
  event.currentTarget.reset();
  setActionMessage('资产已保存，并写入数据库');
  await loadAdmin();
});

document.querySelector('#editContentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!can('content.write')) {
    setActionMessage('当前角色无内容编辑权限');
    return;
  }
  const payload = contentFormPayload(event.currentTarget);
  const contentId = payload.id;
  delete payload.id;
  await apiMutation(`/api/admin/contents/${contentId}`, payload, 'PUT');
  event.currentTarget.reset();
  setActionMessage('内容已更新，并写入审计日志');
  await loadAdmin();
});

document.querySelector('#editAssetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!can('asset.write')) {
    setActionMessage('当前角色无资产编辑权限');
    return;
  }
  const payload = formDataToObject(event.currentTarget);
  const assetId = payload.id;
  delete payload.id;
  await apiMutation(`/api/admin/assets/${assetId}`, payload, 'PUT');
  event.currentTarget.reset();
  setActionMessage('资产已更新，并写入审计日志');
  await loadAdmin();
});

document.querySelector('#memberForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!can('organization.member.manage')) {
    setActionMessage('当前角色无组织成员管理权限');
    return;
  }
  const organizationId = state.organizations[0] && state.organizations[0].id;
  if (!organizationId) throw new Error('No organization available');
  const payload = formDataToObject(event.currentTarget);
  await apiMutation(`/api/organizations/${organizationId}/members`, payload);
  event.currentTarget.reset();
  setActionMessage('组织成员已添加');
  await loadAdmin();
});

document.querySelector('#refreshButton').addEventListener('click', loadAdmin);

document.querySelector('#dispatchNotificationsButton').addEventListener('click', async () => {
  if (!can('admin.read')) {
    setActionMessage('当前角色无提醒派发权限');
    return;
  }
  try {
    const response = await apiMutation('/api/admin/notification-jobs/dispatch', {}, 'POST');
    const count = response.data && typeof response.data.dispatchedCount === 'number'
      ? response.data.dispatchedCount
      : 0;
    setActionMessage(`提醒派发完成：${count} 条`);
  } catch (error) {
    setActionMessage(`提醒派发失败：${error.message}`);
  }
});

loadAdmin().catch((error) => {
  document.querySelector('#healthText').textContent = error.message;
});
