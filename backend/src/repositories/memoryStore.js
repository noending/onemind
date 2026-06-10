const crypto = require('crypto');

const {
  contents,
  festivals,
  organizations,
  organizationMembers,
  assets,
  auditLogs
} = require('../data/seed');

const REVIEW_METHODS = ['拆段跟读', '首字提示', '遮挡回忆', '填空复现', '整段复诵', '抽查巩固'];
const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30];
const REVIEW_TAIL_INTERVAL = 15;
const GROWTH_STAGES = ['初见', '熟悉', '稳定', '通顺', '已持诵'];

const state = {
  users: [
    {
      id: 'demo-user',
      nickname: 'Demo 用户',
      platform: 'wechat',
      status: 'active'
    }
  ],
  plans: [],
  tasks: [],
  reviewRecords: [],
  practiceSessions: [],
  recitationGoals: [],
  recitationSessions: [],
  notificationSettings: [],
  notificationJobs: [],
  organizations: [...organizations],
  organizationMembers: [...organizationMembers],
  assets: [...assets],
  auditLogs: [...auditLogs],
  usersByOpenId: {}
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMode(mode) {
  return String(mode || 'scientific').trim() === 'playful' ? 'playful' : 'scientific';
}

function normalizeSupportedModes(modes, fallbackMode = 'scientific') {
  const list = Array.isArray(modes)
    ? modes
    : typeof modes === 'string'
      ? modes.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
  const normalized = Array.from(new Set(list.map((item) => normalizeMode(item))));
  if (!normalized.length) normalized.push(normalizeMode(fallbackMode));
  return normalized;
}

function buildReviewOffsets(totalDays) {
  const total = Math.max(1, Number(totalDays || 1));
  const offsets = [];

  for (let index = 0; index < total; index += 1) {
    if (index < REVIEW_INTERVALS.length) {
      offsets.push(REVIEW_INTERVALS[index]);
      continue;
    }
    const last = offsets[offsets.length - 1] || REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1];
    offsets.push(last + REVIEW_TAIL_INTERVAL);
  }

  return offsets;
}

function splitBodyToSegments(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  const byLine = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;

  const byPunctuation = text
    .split(/[。！？；;，,、：:]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (byPunctuation.length > 1) return byPunctuation;

  const byWhitespace = text.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  if (byWhitespace.length > 1) return byWhitespace;

  if (text.length <= 10) return [text];

  const chunks = [];
  for (let index = 0; index < text.length; index += 8) {
    chunks.push(text.slice(index, index + 8));
  }
  return chunks.filter(Boolean);
}

function normalizeSegments(segments, body) {
  if (Array.isArray(segments)) {
    const cleaned = segments.map((item) => String(item || '').trim()).filter(Boolean);
    if (cleaned.length) return cleaned;
  }

  if (typeof segments === 'string') {
    const cleaned = segments.split(/\n|,|，|、/).map((item) => item.trim()).filter(Boolean);
    if (cleaned.length) return cleaned;
  }

  return splitBodyToSegments(body);
}

function normalizeGrowthStage(score) {
  const value = Number(score || 0);
  if (value >= 100) return GROWTH_STAGES[4];
  if (value >= 75) return GROWTH_STAGES[3];
  if (value >= 50) return GROWTH_STAGES[2];
  if (value >= 25) return GROWTH_STAGES[1];
  return GROWTH_STAGES[0];
}

function scientificReasonText(plan, task) {
  if (!task) return '今天适合再回顾一次，帮助记忆进入更稳的阶段。';
  if (plan.state === 'at_risk') return '这段最近出现遗忘波动，建议尽快巩固。';
  if (Number(task.dayIndex || 1) <= 2) return '刚进入记忆曲线前段，今天复习最能稳住记忆。';
  if (Number(plan.masteryScore || 0) >= 60) return '这段已接近稳定，再巩固一次即可进入长周期。';
  return '按计划复习能减少后续反复遗忘。';
}

function calculateDailyStreak(days) {
  if (!Array.isArray(days) || !days.length) return 0;
  const normalized = Array.from(new Set(days.map((day) => String(day).slice(0, 10)))).sort().reverse();
  let cursor = todayDate();
  let streak = 0;
  for (const day of normalized) {
    if (day === cursor) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (streak === 0 && day === addDays(cursor, -1)) {
      streak += 1;
      cursor = addDays(day, -1);
      continue;
    }
    break;
  }
  return streak;
}

function listContents(filters = {}) {
  return contents
    .filter((content) => content.publishStatus === 'published')
    .filter((content) => !filters.type || content.type === filters.type)
    .map(toContentSummary);
}

function createContent(payload = {}) {
  const title = String(payload.title || '').trim();
  const body = String(payload.body || payload.preview || '').trim();
  if (!title || !body) {
    const error = new Error('Content title and body are required');
    error.statusCode = 400;
    throw error;
  }

  const content = {
    id: createId('content'),
    title,
    subtitle: payload.subtitle || '',
    type: payload.type || 'mantra',
    body,
    preview: payload.preview || body,
    lengthTier: payload.lengthTier || 'short',
    planDays: Math.max(1, Number(payload.planDays || 1)),
    scene: payload.scene || '后台新增内容',
    segments: normalizeSegments(payload.segments, body),
    defaultMode: normalizeMode(payload.defaultMode || 'scientific'),
    supportedModes: normalizeSupportedModes(payload.supportedModes, payload.defaultMode || 'scientific'),
    supportsRecitation: payload.supportsRecitation !== undefined ? Boolean(payload.supportsRecitation) : true,
    recommendedRecitationTime: payload.recommendedRecitationTime || 'morning',
    recitationTheme: payload.recitationTheme || title,
    accessLevel: payload.accessLevel || 'public',
    publishStatus: payload.publishStatus || 'published'
  };
  contents.push(content);
  return toContentDetail(content);
}

function updateContent(contentId, payload = {}) {
  const index = contents.findIndex((item) => item.id === contentId);
  if (index < 0) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  contents[index] = {
    ...contents[index],
    ...payload,
    planDays: Math.max(1, Number(payload.planDays || contents[index].planDays || 1)),
    defaultMode: normalizeMode(payload.defaultMode !== undefined ? payload.defaultMode : contents[index].defaultMode),
    supportedModes: normalizeSupportedModes(payload.supportedModes !== undefined ? payload.supportedModes : contents[index].supportedModes, payload.defaultMode !== undefined ? payload.defaultMode : contents[index].defaultMode),
    supportsRecitation: payload.supportsRecitation !== undefined ? Boolean(payload.supportsRecitation) : contents[index].supportsRecitation,
    recommendedRecitationTime: payload.recommendedRecitationTime !== undefined ? payload.recommendedRecitationTime : contents[index].recommendedRecitationTime,
    recitationTheme: payload.recitationTheme !== undefined ? payload.recitationTheme : contents[index].recitationTheme,
    segments: normalizeSegments(payload.segments, payload.body || contents[index].body)
  };

  return toContentDetail(contents[index]);
}

function archiveContent(contentId) {
  const index = contents.findIndex((item) => item.id === contentId);
  if (index < 0) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }
  const [archived] = contents.splice(index, 1);
  return {
    id: archived.id,
    title: archived.title,
    publishStatus: 'archived'
  };
}

function getContent(contentId) {
  const content = contents.find((item) => item.id === contentId);
  return content ? toContentDetail(content) : null;
}

function listFestivals() {
  return festivals.map((festival) => ({
    ...festival,
    recommendedContents: festival.recommendedContentIds
      .map((contentId) => contents.find((content) => content.id === contentId))
      .filter(Boolean)
      .map(toContentSummary)
  }));
}

function listPlans(userId = 'demo-user') {
  return state.plans
    .filter((plan) => plan.userId === userId)
    .map((plan) => ({
      ...plan,
      tasks: state.tasks.filter((task) => task.planId === plan.id)
    }));
}

function listOrganizations() {
  return state.organizations.filter((organization) => organization.status === 'active');
}

function listOrganizationAssets(organizationId, filters = {}) {
  const organization = state.organizations.find((item) => item.id === organizationId);
  if (!organization) {
    const error = new Error('Organization not found');
    error.statusCode = 404;
    throw error;
  }

  return state.assets
    .filter((asset) => asset.organizationId === organizationId)
    .filter((asset) => asset.publishStatus === 'published')
    .filter((asset) => !filters.accessLevel || asset.accessLevel === filters.accessLevel)
    .map(toAssetSummary);
}

function createAsset(payload = {}) {
  const asset = {
    id: createId('asset'),
    organizationId: payload.organizationId || 'org-demo-dharma',
    title: payload.title || '未命名资产',
    type: payload.type || 'document',
    url: payload.url || 'storage://demo/document/new-asset',
    thumbnailUrl: payload.thumbnailUrl || null,
    accessLevel: payload.accessLevel || 'private',
    publishStatus: payload.publishStatus || 'published',
    copyrightStatus: payload.copyrightStatus || 'organization_owned'
  };
  state.assets.unshift(asset);
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: asset.organizationId,
    action: 'asset.created',
    targetType: 'asset',
    targetId: asset.id,
    detail: {
      title: asset.title,
      type: asset.type,
      accessLevel: asset.accessLevel
    }
  });
  return toAssetSummary(asset);
}

function updateAsset(assetId, payload = {}) {
  const index = state.assets.findIndex((item) => item.id === assetId);
  if (index < 0) {
    const error = new Error('Asset not found');
    error.statusCode = 404;
    throw error;
  }
  state.assets[index] = {
    ...state.assets[index],
    ...payload
  };
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: state.assets[index].organizationId,
    action: 'asset.updated',
    targetType: 'asset',
    targetId: state.assets[index].id,
    detail: {
      title: state.assets[index].title
    }
  });
  return toAssetSummary(state.assets[index]);
}

function archiveAsset(assetId) {
  const index = state.assets.findIndex((item) => item.id === assetId);
  if (index < 0) {
    const error = new Error('Asset not found');
    error.statusCode = 404;
    throw error;
  }
  const [archived] = state.assets.splice(index, 1);
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: archived.organizationId,
    action: 'asset.archived',
    targetType: 'asset',
    targetId: archived.id,
    detail: {
      title: archived.title
    }
  });
  return {
    id: archived.id,
    title: archived.title,
    publishStatus: 'archived'
  };
}

function addOrganizationMember({ organizationId, userId = 'demo-user', role = 'readonly_member' }) {
  const organization = state.organizations.find((item) => item.id === organizationId);
  if (!organization) {
    const error = new Error('Organization not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = state.organizationMembers.find((member) => (
    member.organizationId === organizationId &&
    member.userId === userId &&
    member.status === 'active'
  ));

  if (existing) return existing;

  const member = {
    id: createId('member'),
    organizationId,
    userId,
    role,
    status: 'active',
    joinedAt: new Date().toISOString()
  };

  state.organizationMembers.push(member);
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId,
    action: 'organization.member_added',
    targetType: 'organization_member',
    targetId: member.id,
    detail: {
      userId,
      role
    }
  });

  return member;
}

function updateAssetAccess({ assetId, accessLevel }) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) {
    const error = new Error('Asset not found');
    error.statusCode = 404;
    throw error;
  }

  const allowed = ['public', 'registered', 'member', 'restricted', 'private'];
  if (!allowed.includes(accessLevel)) {
    const error = new Error('Invalid access level');
    error.statusCode = 400;
    throw error;
  }

  const before = asset.accessLevel;
  asset.accessLevel = accessLevel;

  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: asset.organizationId,
    action: 'asset.access_updated',
    targetType: 'asset',
    targetId: asset.id,
    detail: {
      before,
      after: accessLevel
    }
  });

  return toAssetSummary(asset);
}

function listAuditLogs(filters = {}) {
  return state.auditLogs
    .filter((log) => !filters.organizationId || log.organizationId === filters.organizationId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Number(filters.limit || 50));
}

function createPlan({ userId = 'demo-user', contentId, startDate = todayDate(), mode = 'scientific' }) {
  const content = contents.find((item) => item.id === contentId);
  if (!content) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = state.plans.find((plan) => (
    plan.userId === userId &&
    plan.contentId === contentId &&
    plan.mode === normalizeMode(mode) &&
    ['reviewing', 'at_risk'].includes(plan.state)
  ));

  if (existing) {
    return {
      isNew: false,
      plan: {
        ...existing,
        tasks: state.tasks.filter((task) => task.planId === existing.id)
      }
    };
  }

  if (!state.users.some((user) => user.id === userId)) {
    state.users.push({
      id: userId,
      nickname: '未命名用户',
      platform: 'wechat',
      status: 'active'
    });
  }

  const plan = {
    id: createId('plan'),
    userId,
    contentId,
    mode: normalizeMode(mode),
    title: content.title,
    startDate,
    totalDays: content.planDays,
    currentDay: 1,
    state: 'reviewing',
    masteryScore: 0,
    streakHits: 0,
    lastReviewedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const taskCount = Math.max(content.planDays, 1);
  const offsets = buildReviewOffsets(taskCount);
  const tasks = Array.from({ length: taskCount }, (_, index) => ({
    id: createId('task'),
    planId: plan.id,
    userId,
    dueDate: addDays(startDate, offsets[index] || 0),
    method: REVIEW_METHODS[index] || REVIEW_METHODS[REVIEW_METHODS.length - 1],
    dayIndex: index + 1,
    status: 'pending',
    result: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  state.plans.push(plan);
  state.tasks.push(...tasks);

  return {
    isNew: true,
    plan: {
      ...plan,
      tasks
    }
  };
}

function completeTask({ taskId, result = 'stronger', selfRating = '', latencyBand = '', mistakeCount = 0, note = '' }) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    const error = new Error('Review task not found');
    error.statusCode = 404;
    throw error;
  }

  const plan = state.plans.find((item) => item.id === task.planId);
  if (!plan) {
    const error = new Error('Memory plan not found');
    error.statusCode = 404;
    throw error;
  }

  const now = new Date().toISOString();
  const masteryDelta = result === 'mastered' ? 40 : result === 'stronger' ? 24 : -8;

  task.status = 'completed';
  task.result = result;
  task.completedAt = now;
  task.updatedAt = now;

  plan.masteryScore = Math.max(0, Math.min(100, plan.masteryScore + masteryDelta));
  plan.currentDay = Math.min(plan.totalDays, task.dayIndex + 1);
  plan.streakHits += result === 'needs_work' ? 0 : 1;
  plan.lastReviewedAt = now;
  plan.updatedAt = now;

  if (result === 'needs_work') {
    plan.state = 'at_risk';
  } else if (plan.masteryScore >= 100 || result === 'mastered') {
    plan.state = 'mastered';
  } else {
    plan.state = 'reviewing';
  }

  if (plan.state === 'mastered') {
    plan.masteryScore = 100;
  }

  state.reviewRecords.push({
    id: createId('review'),
    userId: task.userId,
    planId: plan.id,
    taskId: task.id,
    result,
    masteryDelta,
    createdAt: now
  });

  state.practiceSessions.push({
    id: createId('practice'),
    userId: task.userId,
    planId: plan.id,
    taskId: task.id,
    contentId: plan.contentId,
    mode: plan.mode || 'scientific',
    selfRating,
    resultLevel: result,
    latencyBand,
    mistakeCount: Math.max(0, Number(mistakeCount || 0)),
    growthStage: normalizeGrowthStage(plan.masteryScore),
    note,
    createdAt: now
  });

  return {
    task,
    plan
  };
}

function loginByWechatCode(payload = {}) {
  const code = String(payload.code || '').trim() || `mock-${Date.now()}`;
  const openid = `mock_${hashValue(code).slice(0, 24)}`;
  const userInfo = payload.userInfo || {};
  const nickname = String(userInfo.nickName || payload.nickname || '微信用户').trim() || '微信用户';
  const avatarUrl = String(userInfo.avatarUrl || payload.avatarUrl || '').trim();

  const existingId = state.usersByOpenId[openid];
  let user = existingId ? state.users.find((item) => item.id === existingId) : null;
  if (!user) {
    user = {
      id: createId('wx_user'),
      nickname,
      avatarUrl,
      wechatOpenid: openid,
      platform: 'wechat',
      status: 'active',
      lastLoginAt: new Date().toISOString()
    };
    state.users.push(user);
    state.usersByOpenId[openid] = user.id;
  } else {
    user.nickname = nickname;
    user.avatarUrl = avatarUrl || user.avatarUrl || '';
    user.lastLoginAt = new Date().toISOString();
  }

  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl || '',
    platform: user.platform,
    status: user.status
  };
}

function getUserById(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return null;
  return {
    id: user.id,
    nickname: user.nickname || '微信用户',
    avatarUrl: user.avatarUrl || '',
    platform: user.platform || 'wechat',
    status: user.status || 'active'
  };
}

function getNotificationSettings(userId = 'demo-user') {
  const channels = ['wechat_subscribe', 'app_push', 'sms'];
  return channels.map((channel) => {
    const existing = state.notificationSettings.find((item) => item.userId === userId && item.channel === channel);
    return existing || {
      id: `${userId}-${channel}`,
      userId,
      channel,
      enabled: channel !== 'sms',
      quietHours: {
        start: '22:00',
        end: '07:00'
      }
    };
  });
}

function upsertNotificationSetting({ userId = 'demo-user', channel, enabled, quietHours }) {
  const normalizedChannel = String(channel || '').trim();
  if (!normalizedChannel) {
    const error = new Error('Notification channel is required');
    error.statusCode = 400;
    throw error;
  }

  const nextValue = {
    id: `${userId}-${normalizedChannel}`,
    userId,
    channel: normalizedChannel,
    enabled: Boolean(enabled),
    quietHours: quietHours || null,
    updatedAt: new Date().toISOString()
  };

  const index = state.notificationSettings.findIndex((item) => item.userId === userId && item.channel === normalizedChannel);
  if (index >= 0) {
    state.notificationSettings[index] = {
      ...state.notificationSettings[index],
      ...nextValue
    };
    return state.notificationSettings[index];
  }

  state.notificationSettings.push(nextValue);
  return nextValue;
}

function createNotificationJob({ userId = 'demo-user', taskId = null, channel, scheduledAt, payload }) {
  const normalizedChannel = String(channel || '').trim();
  const normalizedSchedule = String(scheduledAt || '').trim();
  if (!normalizedChannel || !normalizedSchedule) {
    const error = new Error('Notification channel and scheduledAt are required');
    error.statusCode = 400;
    throw error;
  }

  const job = {
    id: createId('notify'),
    userId,
    taskId,
    channel: normalizedChannel,
    scheduledAt: normalizedSchedule,
    status: 'pending',
    payload: payload || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.notificationJobs.push(job);
  return job;
}

function listNotificationJobs({ userId = 'demo-user', limit = 20 } = {}) {
  return state.notificationJobs
    .filter((job) => job.userId === userId)
    .slice()
    .sort((left, right) => String(right.scheduledAt).localeCompare(String(left.scheduledAt)))
    .slice(0, Number(limit || 20));
}

function dispatchNotificationJobs({ dueBefore = new Date().toISOString(), limit = 20 } = {}) {
  const dueAt = String(dueBefore || new Date().toISOString());
  const pending = state.notificationJobs
    .filter((job) => job.status === 'pending' && String(job.scheduledAt) <= dueAt)
    .slice(0, Number(limit || 20));

  const dispatched = pending.map((job) => {
    job.status = 'sent';
    job.sentAt = new Date().toISOString();
    job.updatedAt = job.sentAt;
    return {
      ...job,
      deliveryProvider: 'mock'
    };
  });

  return {
    dispatchedCount: dispatched.length,
    dispatched
  };
}

function getGrowthOverview(userId = 'demo-user') {
  const memorizationStreak = calculateDailyStreak(
    state.practiceSessions
      .filter((item) => item.userId === userId)
      .map((item) => item.createdAt)
  );
  const recitationStreak = calculateDailyStreak(
    state.recitationSessions
      .filter((item) => item.userId === userId && item.completed)
      .map((item) => item.createdAt)
  );
  const latestPractice = state.practiceSessions
    .filter((item) => item.userId === userId)
    .slice()
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null;
  return {
    memorizationStreak,
    recitationStreak,
    masteredCount: state.plans.filter((item) => item.userId === userId && item.state === 'mastered').length,
    playfulPlanCount: state.plans.filter((item) => item.userId === userId && item.mode === 'playful').length,
    scientificPlanCount: state.plans.filter((item) => item.userId === userId && item.mode !== 'playful').length,
    completedTaskCount: state.tasks.filter((item) => item.userId === userId && item.status === 'completed').length,
    recitationSessionCount: state.recitationSessions.filter((item) => item.userId === userId && item.completed).length,
    latestMilestone: latestPractice
      ? { title: latestPractice.growthStage, achievedAt: latestPractice.createdAt }
      : null
  };
}

function listRecitationGoals(userId = 'demo-user') {
  return state.recitationGoals
    .filter((item) => item.userId === userId && item.status === 'active')
    .map((goal) => {
      const content = contents.find((item) => item.id === goal.contentId);
      return {
        ...goal,
        title: content ? content.title : '',
        preview: content ? content.preview : '',
        scene: content ? content.scene : ''
      };
    });
}

function upsertRecitationGoal({ userId = 'demo-user', contentId, goalType = 'daily', preferredPeriod = 'morning', dailyTargetCount = 1 }) {
  const content = contents.find((item) => item.id === contentId);
  if (!content) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }
  const existing = state.recitationGoals.find((item) => item.userId === userId && item.contentId === contentId && item.goalType === goalType);
  if (existing) {
    existing.preferredPeriod = preferredPeriod || existing.preferredPeriod;
    existing.dailyTargetCount = Math.max(1, Number(dailyTargetCount || existing.dailyTargetCount || 1));
    existing.status = 'active';
    existing.updatedAt = new Date().toISOString();
    return existing;
  }
  const goal = {
    id: createId('recite_goal'),
    userId,
    contentId,
    goalType,
    preferredPeriod: preferredPeriod || 'morning',
    dailyTargetCount: Math.max(1, Number(dailyTargetCount || 1)),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.recitationGoals.unshift(goal);
  return goal;
}

function createRecitationSession({ userId = 'demo-user', contentId, goalId = null, sessionType = 'free', period = 'morning', roundCount = 1, durationSeconds = 0, completed = true, note = '' }) {
  const content = contents.find((item) => item.id === contentId);
  if (!content) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }
  const session = {
    id: createId('recite'),
    userId,
    contentId,
    goalId,
    sessionType,
    period,
    roundCount: Math.max(1, Number(roundCount || 1)),
    durationSeconds: Math.max(0, Number(durationSeconds || 0)),
    completed: Boolean(completed),
    note,
    createdAt: new Date().toISOString()
  };
  state.recitationSessions.unshift(session);
  return session;
}

function listTodayFocus(userId = 'demo-user') {
  const plans = listPlans(userId);
  const today = todayDate();
  const grouped = { scientificTasks: [], playfulTasks: [] };
  plans.forEach((plan) => {
    const task = (plan.tasks || []).find((item) => item.status !== 'completed' && String(item.dueDate) <= today);
    if (!task) return;
    const content = contents.find((item) => item.id === plan.contentId) || {};
    const item = {
      planId: plan.id,
      taskId: task.id,
      contentId: plan.contentId,
      title: plan.title,
      mode: plan.mode || 'scientific',
      state: plan.state || 'reviewing',
      method: task.method,
      currentDay: task.dayIndex,
      totalDays: plan.totalDays,
      meta: `第 ${task.dayIndex}/${plan.totalDays} 天 · ${task.method}`,
      masteryScore: plan.masteryScore,
      growthStage: normalizeGrowthStage(plan.masteryScore),
      body: content.preview || '',
      preview: content.preview || '',
      scene: content.scene || '',
      reasonText: scientificReasonText(plan, task)
    };
    if (item.mode === 'playful') {
      grouped.playfulTasks.push(item);
    } else {
      grouped.scientificTasks.push(item);
    }
  });
  return {
    date: today,
    scientificTasks: grouped.scientificTasks,
    playfulTasks: grouped.playfulTasks,
    recitationTasks: listRecitationGoals(userId).map((goal) => ({
      goalId: goal.id,
      contentId: goal.contentId,
      title: goal.title,
      preview: goal.preview,
      preferredPeriod: goal.preferredPeriod,
      dailyTargetCount: goal.dailyTargetCount,
      goalType: goal.goalType,
      status: goal.status
    }))
  };
}

function getDashboard() {
  return {
    userCount: state.users.length,
    contentCount: contents.length,
    planCount: state.plans.length,
    completedTaskCount: state.tasks.filter((item) => item.status === 'completed').length,
    practiceSessionCount: state.practiceSessions.length,
    recitationSessionCount: state.recitationSessions.filter((item) => item.completed).length,
    assetCount: state.assets.length,
    organizationCount: state.organizations.length,
    auditLogCount: state.auditLogs.length,
    recentPlans: state.plans.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6),
    recentRecitations: state.recitationSessions.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6).map((item) => {
      const content = contents.find((entry) => entry.id === item.contentId);
      return {
        id: item.id,
        title: content ? content.title : '',
        period: item.period,
        roundCount: item.roundCount,
        createdAt: item.createdAt
      };
    }),
    recentAuditLogs: listAuditLogs({ limit: 6 })
  };
}

function toContentSummary(content) {
  return {
    id: content.id,
    title: content.title,
    subtitle: content.subtitle,
    type: content.type,
    body: content.body,
    preview: content.preview,
    segments: content.segments,
    lengthTier: content.lengthTier,
    planDays: content.planDays,
    scene: content.scene,
    accessLevel: content.accessLevel,
    defaultMode: normalizeMode(content.defaultMode || 'scientific'),
    supportedModes: normalizeSupportedModes(content.supportedModes || ['scientific', 'playful'], content.defaultMode || 'scientific'),
    supportsRecitation: content.supportsRecitation !== false,
    recommendedRecitationTime: content.recommendedRecitationTime || '',
    recitationTheme: content.recitationTheme || ''
  };
}

function toContentDetail(content) {
  return {
    ...toContentSummary(content),
    body: content.body,
    segments: content.segments
  };
}

function toAssetSummary(asset) {
  return {
    id: asset.id,
    organizationId: asset.organizationId,
    title: asset.title,
    type: asset.type,
    url: asset.accessLevel === 'public' ? asset.url : null,
    thumbnailUrl: asset.thumbnailUrl,
    accessLevel: asset.accessLevel,
    publishStatus: asset.publishStatus,
    copyrightStatus: asset.copyrightStatus
  };
}

function appendAuditLog({ actorType, actorId, organizationId, action, targetType, targetId, detail }) {
  state.auditLogs.push({
    id: createId('audit'),
    actorType,
    actorId,
    organizationId,
    action,
    targetType,
    targetId,
    detail: detail || {},
    createdAt: new Date().toISOString()
  });
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

module.exports = {
  addOrganizationMember,
  archiveAsset,
  archiveContent,
  createNotificationJob,
  dispatchNotificationJobs,
  createRecitationSession,
  getUserById,
  getGrowthOverview,
  getNotificationSettings,
  getDashboard,
  listNotificationJobs,
  loginByWechatCode,
  createPlan,
  createAsset,
  createContent,
  completeTask,
  getContent,
  listAuditLogs,
  listContents,
  listFestivals,
  listOrganizationAssets,
  listOrganizations,
  listPlans,
  listRecitationGoals,
  listTodayFocus,
  updateAsset,
  updateContent,
  updateAssetAccess,
  upsertRecitationGoal,
  upsertNotificationSetting,
  todayDate
};
