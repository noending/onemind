const {
  addOrganizationMember,
  archiveAsset,
  archiveContent,
  createNotificationJob,
  createRecitationSession,
  createAsset,
  createContent,
  createPlan,
  dispatchNotificationJobs,
  completeTask,
  findAdminByCredentials,
  getAdminById,
  getContent,
  getDashboard,
  getGrowthOverview,
  getNotificationSettings,
  getStoreMode,
  getUserById,
  listAuditLogs,
  listContents,
  listFestivals,
  listNotificationJobs,
  listOrganizationAssets,
  listOrganizations,
  listPlans,
  listRecitationGoals,
  listTodayFocus,
  loginByWechatCode,
  upsertNotificationSetting,
  upsertRecitationGoal,
  updateAsset,
  updateContent,
  updateAssetAccess
} = require('./repositories/store');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ADMIN_DIR = path.resolve(__dirname, '../admin');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'magic';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Noending5@';
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'oneMind-local-admin';
const USER_TOKEN_SECRET = process.env.USER_TOKEN_SECRET || 'oneMind-local-user';
const ADMIN_TOKEN_EXPIRE_SECONDS = Number(process.env.ADMIN_TOKEN_EXPIRE_SECONDS || 60 * 60 * 24 * 7);
const USER_TOKEN_EXPIRE_SECONDS = Number(process.env.USER_TOKEN_EXPIRE_SECONDS || 60 * 60 * 24 * 30);
const DEMO_USER_ID = process.env.DEMO_USER_ID || 'demo-user';
const WECHAT_LOGIN_MODE = process.env.WECHAT_LOGIN_MODE || 'mock';
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';

const ROLE_PERMISSIONS = {
  super_admin: [
    'admin.read',
    'content.write',
    'content.publish',
    'asset.write',
    'asset.publish',
    'asset.access.manage',
    'organization.member.manage'
  ],
  platform_ops: [
    'admin.read',
    'content.write',
    'content.publish',
    'asset.write'
  ],
  content_editor: [
    'admin.read',
    'content.write',
    'asset.write'
  ],
  content_reviewer: [
    'admin.read',
    'content.publish',
    'asset.publish'
  ],
  organization_admin: [
    'admin.read',
    'content.write',
    'content.publish',
    'asset.write',
    'asset.publish',
    'asset.access.manage',
    'organization.member.manage'
  ],
  asset_maintainer: [
    'admin.read',
    'asset.write'
  ],
  readonly_member: [
    'admin.read'
  ]
};

async function handleRequest(req, res, body) {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && (pathname === '/' || pathname === '/admin' || pathname === '/admin/')) {
    return sendFile(res, path.join(ADMIN_DIR, 'index.html'), 'text/html; charset=utf-8');
  }

  if (req.method === 'GET' && pathname.startsWith('/admin/')) {
    const resolvedFile = resolveAdminFile(pathname);
    if (resolvedFile) {
      return sendFile(res, resolvedFile, contentTypeForFile(resolvedFile));
    }
    if (!path.extname(pathname)) {
      return sendFile(res, path.join(ADMIN_DIR, 'index.html'), 'text/html; charset=utf-8');
    }
    return sendJson(res, 404, { error: 'NOT_FOUND' });
  }

  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'oneMind backend',
      phase: 'phase-3-phase-4-skeleton',
      storeMode: getStoreMode()
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const payload = parseJsonBody(body);
    const admin = resolveAdminCredentials(payload);
    if (!admin) {
      return sendJson(res, 401, { error: 'INVALID_CREDENTIALS' });
    }
    return sendJson(res, 200, {
      data: {
        token: createSignedToken(
          { sub: admin.id, username: admin.username, role: admin.role },
          ADMIN_TOKEN_SECRET,
          ADMIN_TOKEN_EXPIRE_SECONDS,
          'adm'
        ),
        admin: toAdminProfile(admin)
      }
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/wechat/login') {
    const payload = parseJsonBody(body);
    const userPayload = await resolveWechatLoginPayload(payload);
    const user = loginByWechatCode
      ? loginByWechatCode(userPayload)
      : { id: DEMO_USER_ID, nickname: '微信用户', avatarUrl: '', platform: 'wechat', status: 'active' };
    return sendJson(res, 200, {
      data: {
        token: createSignedToken(
          { sub: user.id, platform: user.platform || 'wechat' },
          USER_TOKEN_SECRET,
          USER_TOKEN_EXPIRE_SECONDS,
          'usr'
        ),
        user
      }
    });
  }

  const adminSession = resolveAdminSession(req);
  const userSession = resolveUserSession(req);

  if (req.method === 'GET' && pathname === '/api/admin/session') {
    if (!adminSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, { data: adminSession });
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, { data: userSession });
  }

  if (req.method === 'GET' && pathname === '/api/notification-settings') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, {
      data: getNotificationSettings(userSession.id)
    });
  }

  if (req.method === 'PUT' && pathname === '/api/notification-settings') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    const payload = parseJsonBody(body);
    return sendJson(res, 200, {
      data: upsertNotificationSetting({
        userId: userSession.id,
        channel: payload.channel,
        enabled: payload.enabled,
        quietHours: payload.quietHours
      })
    });
  }

  if (req.method === 'POST' && pathname === '/api/notification-jobs') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    const payload = parseJsonBody(body);
    return sendJson(res, 201, {
      data: createNotificationJob({
        userId: userSession.id,
        taskId: payload.taskId,
        channel: payload.channel,
        scheduledAt: payload.scheduledAt,
        payload: payload.payload
      })
    });
  }

  if (req.method === 'GET' && pathname === '/api/notification-jobs') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, {
      data: listNotificationJobs({
        userId: userSession.id,
        limit: requestUrl.searchParams.get('limit')
      })
    });
  }

  if (requiresAdminAuth(req.method, pathname)) {
    if (!adminSession) {
      return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    }
    const permission = getRequiredPermission(req.method, pathname);
    if (permission && !hasAdminPermission(adminSession.role, permission)) {
      return sendJson(res, 403, { error: 'FORBIDDEN', message: `Missing permission: ${permission}` });
    }
  }

  if (req.method === 'GET' && pathname === '/api/admin/overview') {
    return sendJson(res, 200, {
      data: {
        ...(getDashboard ? getDashboard() : {
          userCount: 0,
          contentCount: listContents({}).length,
          planCount: listPlans(DEMO_USER_ID).length,
          completedTaskCount: 0,
          assetCount: 0,
          organizationCount: listOrganizations().length,
          auditLogCount: listAuditLogs({}).length,
          recentPlans: [],
          recentAuditLogs: listAuditLogs({ limit: 6 })
        }),
        currentAdmin: adminSession || null
      }
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/contents') {
    return sendJson(res, 201, {
      data: createContent(parseJsonBody(body))
    });
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/admin/contents/')) {
    const contentId = decodeURIComponent(pathname.replace('/api/admin/contents/', ''));
    return sendJson(res, 200, {
      data: updateContent(contentId, parseJsonBody(body))
    });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/contents/')) {
    const contentId = decodeURIComponent(pathname.replace('/api/admin/contents/', ''));
    return sendJson(res, 200, {
      data: archiveContent(contentId)
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/assets') {
    return sendJson(res, 201, {
      data: createAsset(parseJsonBody(body))
    });
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/admin/assets/')) {
    const assetId = decodeURIComponent(pathname.replace('/api/admin/assets/', ''));
    return sendJson(res, 200, {
      data: updateAsset(assetId, parseJsonBody(body))
    });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/assets/')) {
    const assetId = decodeURIComponent(pathname.replace('/api/admin/assets/', ''));
    return sendJson(res, 200, {
      data: archiveAsset(assetId)
    });
  }

  if (req.method === 'GET' && pathname === '/api/contents') {
    return sendJson(res, 200, {
      data: listContents({
        type: requestUrl.searchParams.get('type')
      })
    });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/contents/')) {
    const contentId = decodeURIComponent(pathname.replace('/api/contents/', ''));
    const content = getContent(contentId);
    if (!content) {
      return sendJson(res, 404, { error: 'CONTENT_NOT_FOUND' });
    }
    return sendJson(res, 200, { data: content });
  }

  if (req.method === 'GET' && pathname === '/api/festivals') {
    return sendJson(res, 200, {
      data: listFestivals()
    });
  }

  if (req.method === 'GET' && pathname === '/api/memory-plans') {
    return sendJson(res, 200, {
      data: listPlans(userSession?.id || requestUrl.searchParams.get('userId') || DEMO_USER_ID)
    });
  }

  if (req.method === 'POST' && pathname === '/api/memory-plans') {
    const payload = parseJsonBody(body);
    const result = createPlan({
      userId: userSession?.id || payload.userId || DEMO_USER_ID,
      contentId: payload.contentId,
      startDate: payload.startDate,
      mode: payload.mode || 'scientific'
    });
    return sendJson(res, result.isNew ? 201 : 200, {
      data: result.plan,
      meta: {
        isNew: result.isNew
      }
    });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/review-tasks/') && pathname.endsWith('/complete')) {
    const taskId = decodeURIComponent(pathname.replace('/api/review-tasks/', '').replace('/complete', ''));
    const payload = parseJsonBody(body);
    return sendJson(res, 200, {
      data: completeTask({
        taskId,
        result: payload.result || 'stronger',
        selfRating: payload.selfRating || '',
        latencyBand: payload.latencyBand || '',
        mistakeCount: payload.mistakeCount || 0,
        note: payload.note || ''
      })
    });
  }

  if (req.method === 'GET' && pathname === '/api/today-focus') {
    return sendJson(res, 200, {
      data: listTodayFocus(userSession?.id || requestUrl.searchParams.get('userId') || DEMO_USER_ID)
    });
  }

  if (req.method === 'GET' && pathname === '/api/growth-overview') {
    return sendJson(res, 200, {
      data: getGrowthOverview(userSession?.id || requestUrl.searchParams.get('userId') || DEMO_USER_ID)
    });
  }

  if (req.method === 'GET' && pathname === '/api/recitation-goals') {
    return sendJson(res, 200, {
      data: listRecitationGoals(userSession?.id || requestUrl.searchParams.get('userId') || DEMO_USER_ID)
    });
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/recitation-goals/')) {
    const contentId = decodeURIComponent(pathname.replace('/api/recitation-goals/', ''));
    const payload = parseJsonBody(body);
    return sendJson(res, 200, {
      data: upsertRecitationGoal({
        userId: userSession?.id || payload.userId || DEMO_USER_ID,
        contentId,
        goalType: payload.goalType || 'daily',
        preferredPeriod: payload.preferredPeriod || 'morning',
        dailyTargetCount: payload.dailyTargetCount || 1
      })
    });
  }

  if (req.method === 'POST' && pathname === '/api/recitation-sessions') {
    const payload = parseJsonBody(body);
    return sendJson(res, 201, {
      data: createRecitationSession({
        userId: userSession?.id || payload.userId || DEMO_USER_ID,
        contentId: payload.contentId,
        goalId: payload.goalId || null,
        sessionType: payload.sessionType || 'free',
        period: payload.period || 'morning',
        roundCount: payload.roundCount || 1,
        durationSeconds: payload.durationSeconds || 0,
        completed: payload.completed !== false,
        note: payload.note || ''
      })
    });
  }

  if (req.method === 'GET' && pathname === '/api/organizations') {
    return sendJson(res, 200, {
      data: listOrganizations()
    });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/organizations/') && pathname.endsWith('/assets')) {
    const organizationId = decodeURIComponent(pathname.replace('/api/organizations/', '').replace('/assets', ''));
    return sendJson(res, 200, {
      data: listOrganizationAssets(organizationId, {
        accessLevel: requestUrl.searchParams.get('accessLevel')
      })
    });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/organizations/') && pathname.endsWith('/members')) {
    const organizationId = decodeURIComponent(pathname.replace('/api/organizations/', '').replace('/members', ''));
    const payload = parseJsonBody(body);
    return sendJson(res, 201, {
      data: addOrganizationMember({
        organizationId,
        userId: payload.userId,
        role: payload.role
      })
    });
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/assets/') && pathname.endsWith('/access')) {
    const assetId = decodeURIComponent(pathname.replace('/api/assets/', '').replace('/access', ''));
    const payload = parseJsonBody(body);
    return sendJson(res, 200, {
      data: updateAssetAccess({
        assetId,
        accessLevel: payload.accessLevel
      })
    });
  }

  if (req.method === 'GET' && pathname === '/api/audit-logs') {
    return sendJson(res, 200, {
      data: listAuditLogs({
        organizationId: requestUrl.searchParams.get('organizationId'),
        limit: requestUrl.searchParams.get('limit')
      })
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/notification-jobs/dispatch') {
    return sendJson(res, 200, {
      data: dispatchNotificationJobs({
        dueBefore: requestUrl.searchParams.get('dueBefore') || new Date().toISOString(),
        limit: requestUrl.searchParams.get('limit') || 20
      })
    });
  }

  return sendJson(res, 404, {
    error: 'NOT_FOUND'
  });
}

function parseJsonBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (error) {
    error.statusCode = 400;
    error.message = 'Invalid JSON body';
    throw error;
  }
}

function sendJson(res, statusCode, payload) {
  const responseBody = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(responseBody)
  });
  res.end(responseBody);
}

function sendFile(res, filePath, contentType) {
  if (!filePath.startsWith(ADMIN_DIR) || !fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: 'NOT_FOUND' });
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length
  });
  res.end(body);
}

function resolveAdminFile(pathname) {
  const assetPath = pathname.replace(/^\/admin\//, '');
  const resolvedPath = path.resolve(ADMIN_DIR, assetPath);
  if (!resolvedPath.startsWith(ADMIN_DIR)) return null;
  if (!fs.existsSync(resolvedPath)) return null;
  if (fs.statSync(resolvedPath).isDirectory()) {
    const indexPath = path.join(resolvedPath, 'index.html');
    return fs.existsSync(indexPath) ? indexPath : null;
  }
  return resolvedPath;
}

function contentTypeForFile(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function resolveAdminCredentials(payload = {}) {
  if (typeof findAdminByCredentials === 'function') {
    const admin = findAdminByCredentials(payload);
    if (admin) return admin;
  }

  if (payload.username === ADMIN_USERNAME && payload.password === ADMIN_PASSWORD) {
    return {
      id: 'local-admin',
      username: ADMIN_USERNAME,
      name: '本地管理员',
      role: 'super_admin',
      status: 'active'
    };
  }

  return null;
}

async function resolveWechatLoginPayload(payload = {}) {
  const loginMode = String(WECHAT_LOGIN_MODE || 'mock').toLowerCase();
  if (loginMode === 'mock') {
    return payload;
  }

  const code = String(payload.code || '').trim();
  if (!code) {
    const error = new Error('WeChat login code is required');
    error.statusCode = 400;
    throw error;
  }

  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
    if (loginMode === 'hybrid') return payload;
    const error = new Error('WECHAT_APP_ID or WECHAT_APP_SECRET is not configured');
    error.statusCode = 500;
    throw error;
  }

  try {
    const session = await fetchWechatCode2Session(code);
    return {
      ...payload,
      wechatOpenid: session.openid,
      unionid: session.unionid || ''
    };
  } catch (error) {
    if (loginMode === 'hybrid') return payload;
    error.statusCode = error.statusCode || 502;
    throw error;
  }
}

function fetchWechatCode2Session(code) {
  const query = new URLSearchParams({
    appid: WECHAT_APP_ID,
    secret: WECHAT_APP_SECRET,
    js_code: code,
    grant_type: 'authorization_code'
  });
  const url = `https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`;

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (parsed.openid) {
            resolve(parsed);
            return;
          }
          const error = new Error(parsed.errmsg || 'WECHAT_CODE2SESSION_FAILED');
          error.statusCode = 502;
          reject(error);
        } catch (error) {
          error.statusCode = 502;
          reject(error);
        }
      });
    }).on('error', (error) => {
      error.statusCode = 502;
      reject(error);
    });
  });
}

function requiresAdminAuth(method, pathname) {
  if (pathname === '/api/admin/login') return false;
  if (pathname.startsWith('/api/admin/')) return true;
  if (method === 'PUT' && pathname.startsWith('/api/assets/') && pathname.endsWith('/access')) return true;
  if (method === 'POST' && pathname.startsWith('/api/organizations/') && pathname.endsWith('/members')) return true;
  return false;
}

function getRequiredPermission(method, pathname) {
  if (pathname.startsWith('/api/admin/')) {
    if (pathname === '/api/admin/overview' || pathname === '/api/admin/session') return 'admin.read';
    if (pathname === '/api/admin/notification-jobs/dispatch' && method === 'POST') return 'admin.read';
    if (pathname === '/api/admin/contents' && method === 'POST') return 'content.write';
    if (pathname.startsWith('/api/admin/contents/') && method === 'PUT') return 'content.write';
    if (pathname.startsWith('/api/admin/contents/') && method === 'DELETE') return 'content.publish';
    if (pathname === '/api/admin/assets' && method === 'POST') return 'asset.write';
    if (pathname.startsWith('/api/admin/assets/') && method === 'PUT') return 'asset.write';
    if (pathname.startsWith('/api/admin/assets/') && method === 'DELETE') return 'asset.publish';
    return 'admin.read';
  }
  if (method === 'PUT' && pathname.startsWith('/api/assets/') && pathname.endsWith('/access')) return 'asset.access.manage';
  if (method === 'POST' && pathname.startsWith('/api/organizations/') && pathname.endsWith('/members')) return 'organization.member.manage';
  return null;
}

function hasAdminPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.readonly_member;
  return permissions.includes(permission);
}

function resolveAdminSession(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const parsed = verifySignedToken(token, ADMIN_TOKEN_SECRET, 'adm');
  if (parsed && parsed.sub) {
    const dbAdmin = typeof getAdminById === 'function' ? getAdminById(parsed.sub) : null;
    if (dbAdmin) return toAdminProfile(dbAdmin);
    return toAdminProfile({
      id: parsed.sub,
      username: parsed.username || ADMIN_USERNAME,
      role: parsed.role || 'super_admin',
      name: parsed.name || '本地管理员'
    });
  }

  if (timingSafeEqual(token, createLegacyAdminToken())) {
    return toAdminProfile({
      id: 'local-admin',
      username: ADMIN_USERNAME,
      role: 'super_admin',
      name: '本地管理员'
    });
  }

  return null;
}

function resolveUserSession(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const parsed = verifySignedToken(token, USER_TOKEN_SECRET, 'usr');
  if (!parsed || !parsed.sub) return null;

  const user = typeof getUserById === 'function' ? getUserById(parsed.sub) : null;
  if (user) return user;

  return {
    id: parsed.sub,
    nickname: '微信用户',
    avatarUrl: '',
    platform: parsed.platform || 'wechat',
    status: 'active'
  };
}

function createLegacyAdminToken() {
  return crypto
    .createHash('sha256')
    .update(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:${ADMIN_TOKEN_SECRET}`)
    .digest('hex');
}

function createSignedToken(payload, secret, expiresInSeconds, prefix) {
  const exp = Math.floor(Date.now() / 1000) + Number(expiresInSeconds || 3600);
  const body = base64urlEncode(JSON.stringify({ ...payload, exp }));
  const signature = signTokenBody(prefix, body, secret);
  return `${prefix}.${body}.${signature}`;
}

function verifySignedToken(token, secret, prefix) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [currentPrefix, body, signature] = parts;
  if (currentPrefix !== prefix) return null;
  const expectedSignature = signTokenBody(prefix, body, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  let payload = null;
  try {
    payload = JSON.parse(base64urlDecode(body));
  } catch (error) {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function signTokenBody(prefix, body, secret) {
  return crypto
    .createHmac('sha256', String(secret || ''))
    .update(`${prefix}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlEncode(value) {
  return Buffer.from(String(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecode(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  return token || '';
}

function toAdminProfile(admin = {}) {
  return {
    id: admin.id || 'local-admin',
    username: admin.username || ADMIN_USERNAME,
    role: admin.role || 'super_admin',
    name: admin.name || admin.username || '管理员',
    status: admin.status || 'active'
  };
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  handleRequest,
  sendJson
};
