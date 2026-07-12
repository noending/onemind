const {
  addOrganizationMember,
  archiveAsset,
  archiveContent,
  archiveFestival,
  archiveLegacyPlan,
  createNotificationJob,
  createMemoryAssessment,
  createRecitationSession,
  createAsset,
  createContent,
  createFestival,
  copyContentAsNewVersion,
  createAdaptivePlan,
  createPlan,
  claimDueNotificationJobs,
  completeTask,
  findAdminByCredentials,
  getAdminById,
  getContent,
  getContentStructure,
  getDashboard,
  getGrowthOverview,
  getTodayStudyTask,
  getNotificationSettings,
  getNotificationDeliveryTarget,
  getStoreMode,
  getUserById,
  listAdminContents,
  listAdminFestivals,
  listAuditLogs,
  listContentVersions,
  listContents,
  listFestivals,
  listNotificationJobs,
  isNotificationChannelEnabled,
  listOrganizationAssets,
  listOrganizations,
  listPlans,
  listRecitationGoals,
  listTodayFocus,
  loginByWechatCode,
  recommendMemoryPlan,
  updateUserProfile,
  upsertNotificationSetting,
  upsertRecitationGoal,
  updateAsset,
  updateContent,
  updateFestival,
  updateAssetAccess,
  recordNotificationJobFailure,
  recordNotificationJobSuccess,
  reserveNotificationSubscription,
  saveNotificationSubscriptionResult,
  completeStudyTaskItem
} = require('./repositories/store');
const {
  findTemplateById,
  isWechatProviderReady,
  isWechatServerOpenid,
  parseWechatSubscribeTemplates,
  toPublicCapabilities
} = require('./services/wechatSubscribeConfig');
const { createWechatAccessTokenProvider } = require('./services/wechatAccessToken');
const { createWechatSubscribeSender } = require('./services/wechatSubscribeSender');
const { createNotificationDispatcher } = require('./services/notificationDispatcher');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ADMIN_DIR = path.resolve(__dirname, '../admin');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'magic';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Noending5@';
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'oneMind-local-admin';
const USER_TOKEN_SECRET = process.env.USER_TOKEN_SECRET || 'oneMind-local-user';
const USER_REFRESH_TOKEN_SECRET = process.env.USER_REFRESH_TOKEN_SECRET || `${USER_TOKEN_SECRET}:refresh`;
const ADMIN_TOKEN_EXPIRE_SECONDS = Number(process.env.ADMIN_TOKEN_EXPIRE_SECONDS || 60 * 60 * 24 * 7);
const USER_TOKEN_EXPIRE_SECONDS = Number(process.env.USER_TOKEN_EXPIRE_SECONDS || 60 * 60 * 24 * 30);
const USER_REFRESH_EXPIRE_SECONDS = Number(process.env.USER_REFRESH_EXPIRE_SECONDS || 60 * 60 * 24 * 90);
const DEMO_USER_ID = process.env.DEMO_USER_ID || 'demo-user';
const WECHAT_LOGIN_MODE = process.env.WECHAT_LOGIN_MODE || 'mock';
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';
const WECHAT_SUBSCRIBE_CONFIG = parseWechatSubscribeTemplates();
const wechatAccessTokenProvider = createWechatAccessTokenProvider({
  appId: WECHAT_APP_ID,
  appSecret: WECHAT_APP_SECRET
});
const wechatSubscribeSender = createWechatSubscribeSender({
  accessTokenProvider: wechatAccessTokenProvider
});
const notificationDispatcher = createNotificationDispatcher({
  repository: {
    claimDueNotificationJobs,
    getNotificationDeliveryTarget,
    isNotificationChannelEnabled,
    recordNotificationJobFailure,
    recordNotificationJobSuccess,
    reserveNotificationSubscription
  },
  sender: wechatSubscribeSender,
  templateConfig: WECHAT_SUBSCRIBE_CONFIG,
  providerReady: isWechatProviderReady(WECHAT_SUBSCRIBE_CONFIG)
});

const ROLE_PERMISSIONS = {
  super_admin: [
    'admin.read',
    'content.write',
    'content.publish',
    'asset.write',
    'asset.publish',
    'asset.access.manage',
    'organization.member.manage',
    'notification.dispatch'
  ],
  platform_ops: [
    'admin.read',
    'content.write',
    'content.publish',
    'asset.write',
    'notification.dispatch'
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
    'organization.member.manage',
    'notification.dispatch'
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

  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { data: {} });
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

  if (req.method === 'GET' && pathname === '/api/notification-capabilities') {
    return sendJson(res, 200, {
      data: toPublicCapabilities(WECHAT_SUBSCRIBE_CONFIG)
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

  if (req.method === 'POST' && (pathname === '/api/auth/wechat/login' || pathname === '/auth/wechat-login')) {
    const payload = parseJsonBody(body);
    const userPayload = await resolveWechatLoginPayload(payload);
    const user = loginByWechatCode
      ? loginByWechatCode(userPayload)
      : { id: DEMO_USER_ID, nickname: '微信用户', avatarUrl: '', platform: 'wechat', status: 'active' };
    return sendJson(res, 200, {
      data: createUserSessionPayload(user)
    });
  }

  if (req.method === 'POST' && (pathname === '/api/auth/refresh-token' || pathname === '/auth/refresh-token')) {
    const payload = parseJsonBody(body);
    const refreshToken = String(payload.refreshToken || '').trim();
    const parsed = verifySignedToken(refreshToken, USER_REFRESH_TOKEN_SECRET, 'urf');
    if (!parsed || !parsed.sub) {
      return sendJson(res, 401, { error: 'INVALID_REFRESH_TOKEN' });
    }

    const user = typeof getUserById === 'function' ? getUserById(parsed.sub) : null;
    if (!user) {
      return sendJson(res, 401, { error: 'INVALID_REFRESH_TOKEN' });
    }

    return sendJson(res, 200, {
      data: createUserSessionPayload(user)
    });
  }

  if (req.method === 'POST' && (pathname === '/api/auth/logout' || pathname === '/auth/logout')) {
    return sendJson(res, 200, {
      data: {
        ok: true
      }
    });
  }

  const adminSession = resolveAdminSession(req);
  const userSession = resolveUserSession(req);

  if (req.method === 'GET' && pathname === '/api/admin/session') {
    if (!adminSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, { data: adminSession });
  }

  if (req.method === 'GET' && (pathname === '/api/auth/me' || pathname === '/auth/me')) {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, { data: userSession });
  }

  if (req.method === 'PUT' && (pathname === '/api/auth/profile' || pathname === '/auth/profile')) {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    const payload = parseJsonBody(body);
    const nextUser = typeof updateUserProfile === 'function'
      ? updateUserProfile(userSession.id, payload)
      : {
        ...userSession,
        nickname: payload.nickname || userSession.nickname,
        avatarUrl: payload.avatarUrl || userSession.avatarUrl || ''
      };
    return sendJson(res, 200, { data: nextUser });
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
    if (payload.channel === 'wechat_subscribe' && payload.enabled === true) {
      return sendJson(res, 409, { error: 'WECHAT_SUBSCRIPTION_ACCEPT_REQUIRED' });
    }
    return sendJson(res, 200, {
      data: upsertNotificationSetting({
        userId: userSession.id,
        channel: payload.channel,
        enabled: payload.enabled,
        quietHours: payload.quietHours
      })
    });
  }

  if (req.method === 'POST' && pathname === '/api/notification-subscriptions/wechat') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    const idempotencyKey = getIdempotencyKey(req);
    const payload = parseJsonBody(body);
    const template = findTemplateById(WECHAT_SUBSCRIBE_CONFIG, payload.templateId);
    if (!template) return sendJson(res, 400, { error: 'WECHAT_SUBSCRIBE_TEMPLATE_INVALID' });
    if (!['accept', 'reject', 'ban'].includes(String(payload.status || '').trim())) {
      return sendJson(res, 400, { error: 'WECHAT_SUBSCRIBE_STATUS_INVALID' });
    }
    if (!isWechatProviderReady(WECHAT_SUBSCRIBE_CONFIG)) {
      return sendJson(res, 503, { error: 'WECHAT_SUBSCRIBE_PROVIDER_NOT_READY' });
    }
    const target = getNotificationDeliveryTarget(userSession.id);
    if (!target || !isWechatServerOpenid(target.openid)) {
      return sendJson(res, 409, { error: 'WECHAT_REAL_LOGIN_REQUIRED' });
    }
    return sendJson(res, 200, {
      data: saveNotificationSubscriptionResult({
        userId: userSession.id,
        templateKey: template.key,
        templateId: template.templateId,
        status: payload.status,
        idempotencyKey
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
        startAt: requestUrl.searchParams.get('startAt'),
        endAt: requestUrl.searchParams.get('endAt'),
        status: requestUrl.searchParams.get('status'),
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
    const overviewFilters = {
      startAt: requestUrl.searchParams.get('startAt'),
      endAt: requestUrl.searchParams.get('endAt'),
      organizationId: requestUrl.searchParams.get('organizationId'),
      type: requestUrl.searchParams.get('type'),
      mode: requestUrl.searchParams.get('mode')
    };
    return sendJson(res, 200, {
      data: {
        ...(getDashboard ? getDashboard(overviewFilters) : {
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

  if (req.method === 'GET' && pathname === '/api/admin/contents') {
    return sendJson(res, 200, {
      data: listAdminContents({
        type: requestUrl.searchParams.get('type'),
        organizationId: requestUrl.searchParams.get('organizationId'),
        mode: requestUrl.searchParams.get('mode'),
        publishStatus: requestUrl.searchParams.get('publishStatus'),
        reviewStatus: requestUrl.searchParams.get('reviewStatus')
      })
    });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/admin/contents/') && pathname.endsWith('/versions')) {
    const contentId = decodeURIComponent(pathname.replace('/api/admin/contents/', '').replace('/versions', '').replace(/\/$/, ''));
    return sendJson(res, 200, {
      data: listContentVersions(contentId)
    });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/admin/contents/') && pathname.endsWith('/copy-version')) {
    const contentId = decodeURIComponent(pathname.replace('/api/admin/contents/', '').replace('/copy-version', '').replace(/\/$/, ''));
    return sendJson(res, 201, {
      data: copyContentAsNewVersion(contentId, parseJsonBody(body))
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

  if (req.method === 'GET' && pathname === '/api/admin/festivals') {
    return sendJson(res, 200, {
      data: listAdminFestivals()
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/festivals') {
    return sendJson(res, 201, {
      data: createFestival(parseJsonBody(body))
    });
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/admin/festivals/')) {
    const festivalId = decodeURIComponent(pathname.replace('/api/admin/festivals/', ''));
    return sendJson(res, 200, {
      data: updateFestival(festivalId, parseJsonBody(body))
    });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/admin/festivals/')) {
    const festivalId = decodeURIComponent(pathname.replace('/api/admin/festivals/', ''));
    return sendJson(res, 200, {
      data: archiveFestival(festivalId)
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
        type: requestUrl.searchParams.get('type'),
        organizationId: requestUrl.searchParams.get('organizationId'),
        mode: requestUrl.searchParams.get('mode')
      })
    });
  }

  const contentStructureMatch = pathname.match(/^\/api\/contents\/([^/]+)\/versions\/([^/]+)\/structure$/);
  if (req.method === 'GET' && contentStructureMatch) {
    try {
      return sendJson(res, 200, {
        data: getContentStructure(
          decodeURIComponent(contentStructureMatch[1]),
          decodeURIComponent(contentStructureMatch[2])
        )
      });
    } catch (error) {
      if (error.code === 'CONTENT_VERSION_NOT_FOUND' || error.code === 'CONTENT_VERSION_NOT_APPROVED') {
        return sendJson(res, error.statusCode, { error: error.code });
      }
      throw error;
    }
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

  if (req.method === 'POST' && pathname === '/api/memory-assessments') {
    if (!userSession) return sendJson(res, 401, { error: 'AUTH_REQUIRED' });
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
    if (!idempotencyKey) return sendJson(res, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
    if (idempotencyKey.length > 180) return sendJson(res, 400, { error: 'IDEMPOTENCY_KEY_INVALID' });
    const payload = parseJsonBody(body);
    return sendJson(res, 201, {
      data: createMemoryAssessment({
        contentId: payload.contentId,
        contentVersionId: payload.contentVersionId,
        scopeType: payload.scopeType || 'full',
        scopeId: payload.scopeId || null,
        userId: userSession.id,
        idempotencyKey
      })
    });
  }

  if (req.method === 'POST' && pathname === '/api/memory-plans/recommendation') {
    if (!userSession) return sendJson(res, 401, { error: 'AUTH_REQUIRED' });
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
    if (!idempotencyKey) return sendJson(res, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
    if (idempotencyKey.length > 180) return sendJson(res, 400, { error: 'IDEMPOTENCY_KEY_INVALID' });
    const payload = parseJsonBody(body);
    const assessmentId = String(payload.assessmentId || '').trim();
    if (!assessmentId) return sendJson(res, 400, { error: 'ASSESSMENT_ID_REQUIRED' });
    return sendJson(res, 200, {
      data: recommendMemoryPlan({
        assessmentId,
        answers: payload.answers,
        dailyMinutes: payload.dailyMinutes,
        targetDays: payload.targetDays,
        userId: userSession.id,
        idempotencyKey
      })
    });
  }

  if (req.method === 'GET' && pathname === '/api/memory-plans') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, {
      data: listPlans(userSession.id)
    });
  }

  if (req.method === 'POST' && pathname === '/api/memory-plans') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    const payload = parseJsonBody(body);
    if (isAdaptivePlanRequest(payload)) {
      const idempotencyKey = getIdempotencyKey(req);
      return sendJson(res, 201, {
        data: createAdaptivePlan({
          contentId: payload.contentId,
          contentVersionId: payload.contentVersionId,
          scopeType: payload.scopeType,
          scopeId: payload.scopeId,
          targetDays: payload.targetDays,
          dailyMinutes: payload.dailyMinutes,
          familiarityLevel: payload.familiarityLevel,
          strategy: payload.strategy,
          date: payload.date || payload.startDate,
          userId: userSession.id,
          idempotencyKey
        })
      });
    }
    const result = createPlan({
      userId: userSession.id,
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

  if (req.method === 'POST' && pathname.startsWith('/api/memory-plans/') && pathname.endsWith('/archive')) {
    if (!userSession) return sendJson(res, 401, { error: 'AUTH_REQUIRED' });
    const planId = decodeURIComponent(pathname.replace('/api/memory-plans/', '').replace('/archive', ''));
    const idempotencyKey = getIdempotencyKey(req);
    return sendJson(res, 200, {
      data: archiveLegacyPlan({
        userId: userSession.id,
        planId,
        idempotencyKey
      })
    });
  }

  if (req.method === 'GET' && pathname === '/api/study-tasks/today') {
    if (!userSession) return sendJson(res, 401, { error: 'AUTH_REQUIRED' });
    const planId = String(requestUrl.searchParams.get('planId') || '').trim();
    if (!planId) return sendJson(res, 400, { error: 'PLAN_ID_REQUIRED' });
    return sendJson(res, 200, {
      data: getTodayStudyTask(
        userSession.id,
        planId
      )
    });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/study-task-items/') && pathname.endsWith('/complete')) {
    if (!userSession) return sendJson(res, 401, { error: 'AUTH_REQUIRED' });
    const itemId = decodeURIComponent(pathname.replace('/api/study-task-items/', '').replace('/complete', ''));
    const idempotencyKey = getIdempotencyKey(req);
    const payload = parseJsonBody(body);
    return sendJson(res, 200, {
      data: completeStudyTaskItem({
        itemId,
        userId: userSession.id,
        grade: payload.grade,
        reviewedAt: new Date().toISOString(),
        latencyMs: payload.latencyMs,
        mistakeCount: payload.mistakeCount,
        hintCount: payload.hintCount,
        idempotencyKey
      })
    });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/review-tasks/') && pathname.endsWith('/complete')) {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    const taskId = decodeURIComponent(pathname.replace('/api/review-tasks/', '').replace('/complete', ''));
    const payload = parseJsonBody(body);
    return sendJson(res, 200, {
      data: completeTask({
        taskId,
        userId: userSession.id,
        result: payload.result || 'stronger',
        selfRating: payload.selfRating || '',
        latencyBand: payload.latencyBand || '',
        mistakeCount: payload.mistakeCount || 0,
        note: payload.note || ''
      })
    });
  }

  if (req.method === 'GET' && pathname === '/api/today-focus') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, {
      data: listTodayFocus(userSession.id)
    });
  }

  if (req.method === 'GET' && pathname === '/api/growth-overview') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, {
      data: getGrowthOverview(userSession.id)
    });
  }

  if (req.method === 'GET' && pathname === '/api/recitation-goals') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return sendJson(res, 200, {
      data: listRecitationGoals(userSession.id)
    });
  }

  if (req.method === 'PUT' && pathname.startsWith('/api/recitation-goals/')) {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    const contentId = decodeURIComponent(pathname.replace('/api/recitation-goals/', ''));
    const payload = parseJsonBody(body);
    return sendJson(res, 200, {
      data: upsertRecitationGoal({
        userId: userSession.id,
        contentId,
        goalType: payload.goalType || 'daily',
        preferredPeriod: payload.preferredPeriod || 'morning',
        dailyTargetCount: payload.dailyTargetCount || 1
      })
    });
  }

  if (req.method === 'POST' && pathname === '/api/recitation-sessions') {
    if (!userSession) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    const payload = parseJsonBody(body);
    return sendJson(res, 201, {
      data: createRecitationSession({
        userId: userSession.id,
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
        startAt: requestUrl.searchParams.get('startAt'),
        endAt: requestUrl.searchParams.get('endAt'),
        limit: requestUrl.searchParams.get('limit')
      })
    });
  }

  if (req.method === 'GET' && pathname === '/api/admin/notification-jobs') {
    return sendJson(res, 200, {
      data: listNotificationJobs({
        userId: requestUrl.searchParams.get('userId'),
        organizationId: requestUrl.searchParams.get('organizationId'),
        type: requestUrl.searchParams.get('type'),
        mode: requestUrl.searchParams.get('mode'),
        status: requestUrl.searchParams.get('status'),
        startAt: requestUrl.searchParams.get('startAt'),
        endAt: requestUrl.searchParams.get('endAt'),
        limit: requestUrl.searchParams.get('limit'),
        includeAllUsers: true
      })
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/notification-jobs/dispatch') {
    return sendJson(res, 200, {
      data: await notificationDispatcher.dispatchDue({
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

function isAdaptivePlanRequest(payload = {}) {
  return [
    'contentVersionId',
    'scopeType',
    'scopeId',
    'targetDays',
    'dailyMinutes',
    'familiarityLevel',
    'strategy',
    'date'
  ].some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function getIdempotencyKey(req) {
  const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
  if (!idempotencyKey) {
    return adaptiveRouteError('IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  if (idempotencyKey.length > 180) {
    return adaptiveRouteError('IDEMPOTENCY_KEY_INVALID', 400);
  }
  return idempotencyKey;
}

function adaptiveRouteError(code, statusCode) {
  const error = new Error(code);
  error.statusCode = statusCode;
  throw error;
}

function sendJson(res, statusCode, payload) {
  const responseBody = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
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
    if (pathname === '/api/admin/notification-jobs/dispatch' && method === 'POST') return 'notification.dispatch';
    if (pathname === '/api/admin/contents' && method === 'GET') return 'admin.read';
    if (pathname === '/api/admin/contents' && method === 'POST') return 'content.write';
    if (pathname.startsWith('/api/admin/contents/') && pathname.endsWith('/versions') && method === 'GET') return 'admin.read';
    if (pathname.startsWith('/api/admin/contents/') && pathname.endsWith('/copy-version') && method === 'POST') return 'content.write';
    if (pathname.startsWith('/api/admin/contents/') && method === 'PUT') return 'content.write';
    if (pathname.startsWith('/api/admin/contents/') && method === 'DELETE') return 'content.publish';
    if (pathname === '/api/admin/festivals' && method === 'GET') return 'admin.read';
    if (pathname === '/api/admin/festivals' && method === 'POST') return 'content.write';
    if (pathname.startsWith('/api/admin/festivals/') && method === 'PUT') return 'content.write';
    if (pathname.startsWith('/api/admin/festivals/') && method === 'DELETE') return 'content.publish';
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
  if (user) return toUserProfile(user);

  return toUserProfile({
    id: parsed.sub,
    nickname: '微信用户',
    avatarUrl: '',
    platform: parsed.platform || 'wechat',
    status: 'active'
  });
}

function createUserSessionPayload(user = {}) {
  const platform = user.platform || 'wechat';
  const profile = toUserProfile(user);
  return {
    token: createSignedToken(
      { sub: profile.id, platform },
      USER_TOKEN_SECRET,
      USER_TOKEN_EXPIRE_SECONDS,
      'usr'
    ),
    refreshToken: createSignedToken(
      { sub: profile.id, platform, tokenType: 'refresh' },
      USER_REFRESH_TOKEN_SECRET,
      USER_REFRESH_EXPIRE_SECONDS,
      'urf'
    ),
    expiresIn: USER_TOKEN_EXPIRE_SECONDS,
    refreshExpiresIn: USER_REFRESH_EXPIRE_SECONDS,
    user: profile,
    profileComplete: profile.profileComplete
  };
}

function toUserProfile(user = {}) {
  const nickname = String(user.nickname || '').trim();
  return {
    id: user.id || DEMO_USER_ID,
    nickname: nickname || '微信用户',
    avatarUrl: user.avatarUrl || '',
    platform: user.platform || 'wechat',
    status: user.status || 'active',
    phone: user.phone || '',
    profileComplete: Boolean(nickname && nickname !== '微信用户')
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
