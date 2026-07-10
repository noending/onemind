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
  contentVersions: [],
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
    .filter((content) => !filters.organizationId || content.organizationId === filters.organizationId)
    .filter((content) => !filters.mode || matchesContentMode(content, filters.mode))
    .map(toContentSummary);
}

function listAdminContents(filters = {}) {
  return contents
    .filter((content) => !filters.type || content.type === filters.type)
    .filter((content) => !filters.organizationId || content.organizationId === filters.organizationId)
    .filter((content) => !filters.publishStatus || content.publishStatus === filters.publishStatus)
    .filter((content) => !filters.reviewStatus || (content.reviewStatus || 'draft') === filters.reviewStatus)
    .filter((content) => !filters.mode || matchesContentMode(content, filters.mode))
    .map(toContentSummary);
}

function nextContentVersionNo(contentId) {
  return state.contentVersions
    .filter((item) => item.contentId === contentId)
    .reduce((max, item) => Math.max(max, Number(item.versionNo || 0)), 0) + 1;
}

function createContentVersionSnapshot(content, { changeNote = '' } = {}) {
  const version = {
    id: createId('content_version'),
    contentId: content.id,
    versionNo: nextContentVersionNo(content.id),
    snapshotJson: toContentDetail(content),
    changeNote: String(changeNote || '').trim() || content.versionNote || '自动保存版本快照',
    createdBy: 'system',
    createdAt: new Date().toISOString()
  };
  state.contentVersions.unshift(version);
  return version;
}

function listContentVersions(contentId) {
  return state.contentVersions
    .filter((item) => item.contentId === contentId)
    .slice()
    .sort((left, right) => Number(right.versionNo || 0) - Number(left.versionNo || 0));
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
    organizationId: payload.organizationId || organizations[0]?.id || '',
    defaultMode: normalizeMode(payload.defaultMode || 'scientific'),
    supportedModes: normalizeSupportedModes(payload.supportedModes, payload.defaultMode || 'scientific'),
    supportsRecitation: payload.supportsRecitation !== undefined ? Boolean(payload.supportsRecitation) : true,
    recommendedRecitationTime: payload.recommendedRecitationTime || 'morning',
    recitationTheme: payload.recitationTheme || title,
    sourceNote: payload.sourceNote || '',
    versionNote: payload.versionNote || '',
    sourceContentId: payload.sourceContentId || '',
    sourceVersionNo: payload.sourceVersionNo ? Number(payload.sourceVersionNo) : null,
    accessLevel: payload.accessLevel || 'public',
    publishStatus: payload.publishStatus || 'draft',
    reviewStatus: payload.reviewStatus || ((payload.publishStatus || 'draft') === 'published' ? 'approved' : 'draft'),
    reviewedAt: (payload.reviewStatus || ((payload.publishStatus || 'draft') === 'published' ? 'approved' : 'draft')) !== 'draft'
      ? new Date().toISOString()
      : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  contents.push(content);
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: content.organizationId,
    action: 'content.created',
    targetType: 'content',
    targetId: content.id,
    detail: {
      title: content.title,
      type: content.type,
      publishStatus: content.publishStatus,
      reviewStatus: content.reviewStatus
    }
  });
  return toContentDetail(content);
}

function copyContentAsNewVersion(contentId, payload = {}) {
  const source = getContent(contentId);
  if (!source) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  const snapshot = createContentVersionSnapshot(source, {
    changeNote: payload.changeNote || `复制新版本前保存 ${source.title} 的当前快照`
  });
  const versionNote = String(payload.versionNote || '').trim() || `基于版本 v${snapshot.versionNo} 复制`;
  const cloned = createContent({
    title: source.title,
    subtitle: source.subtitle,
    type: source.type,
    body: source.body,
    preview: source.preview,
    planDays: source.planDays,
    lengthTier: source.lengthTier,
    scene: source.scene,
    organizationId: source.organizationId,
    defaultMode: source.defaultMode,
    supportedModes: source.supportedModes,
    supportsRecitation: source.supportsRecitation,
    recommendedRecitationTime: source.recommendedRecitationTime,
    recitationTheme: source.recitationTheme,
    sourceNote: source.sourceNote,
    versionNote,
    accessLevel: source.accessLevel,
    publishStatus: 'draft',
    reviewStatus: 'reviewing',
    sourceContentId: source.id,
    sourceVersionNo: snapshot.versionNo,
    segments: source.segments
  });

  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: source.organizationId,
    action: 'content.version_copied',
    targetType: 'content',
    targetId: cloned.id,
    detail: {
      sourceContentId: source.id,
      sourceTitle: source.title,
      sourceVersionNo: snapshot.versionNo,
      versionNote
    }
  });

  return cloned;
}

function updateContent(contentId, payload = {}) {
  const index = contents.findIndex((item) => item.id === contentId);
  if (index < 0) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  const previous = { ...contents[index] };
  if (previous.publishStatus === 'published') {
    createContentVersionSnapshot(previous, {
      changeNote: payload.versionNote || '更新已发布内容前自动保存版本快照'
    });
  }
  const nextPublishStatus = payload.publishStatus !== undefined ? payload.publishStatus : previous.publishStatus;
  const nextReviewStatus = payload.reviewStatus !== undefined
    ? payload.reviewStatus
    : nextPublishStatus === 'published'
      ? (previous.reviewStatus === 'rejected' ? 'rejected' : 'approved')
      : previous.reviewStatus || 'draft';

  contents[index] = {
    ...previous,
    ...payload,
    planDays: Math.max(1, Number(payload.planDays || previous.planDays || 1)),
    organizationId: payload.organizationId !== undefined ? payload.organizationId : previous.organizationId,
    defaultMode: normalizeMode(payload.defaultMode !== undefined ? payload.defaultMode : previous.defaultMode),
    supportedModes: normalizeSupportedModes(payload.supportedModes !== undefined ? payload.supportedModes : previous.supportedModes, payload.defaultMode !== undefined ? payload.defaultMode : previous.defaultMode),
    supportsRecitation: payload.supportsRecitation !== undefined ? Boolean(payload.supportsRecitation) : previous.supportsRecitation,
    recommendedRecitationTime: payload.recommendedRecitationTime !== undefined ? payload.recommendedRecitationTime : previous.recommendedRecitationTime,
    recitationTheme: payload.recitationTheme !== undefined ? payload.recitationTheme : previous.recitationTheme,
    sourceNote: payload.sourceNote !== undefined ? payload.sourceNote : previous.sourceNote,
    versionNote: payload.versionNote !== undefined ? payload.versionNote : previous.versionNote,
    sourceContentId: payload.sourceContentId !== undefined ? payload.sourceContentId : previous.sourceContentId,
    sourceVersionNo: payload.sourceVersionNo !== undefined ? payload.sourceVersionNo : previous.sourceVersionNo,
    publishStatus: nextPublishStatus,
    reviewStatus: nextReviewStatus,
    reviewedAt: nextReviewStatus !== previous.reviewStatus
      ? new Date().toISOString()
      : previous.reviewedAt,
    updatedAt: new Date().toISOString(),
    segments: normalizeSegments(payload.segments, payload.body || previous.body)
  };

  const current = contents[index];

  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: current.organizationId,
    action: 'content.updated',
    targetType: 'content',
    targetId: contentId,
    detail: {
      beforeTitle: previous.title,
      afterTitle: current.title,
      beforePublishStatus: previous.publishStatus,
      afterPublishStatus: current.publishStatus,
      beforeReviewStatus: previous.reviewStatus,
      afterReviewStatus: current.reviewStatus
    }
  });

  if (previous.publishStatus !== current.publishStatus) {
    appendAuditLog({
      actorType: 'admin_user',
      actorId: 'system',
      organizationId: current.organizationId,
      action: 'content.publish_status_changed',
      targetType: 'content',
      targetId: contentId,
      detail: {
        beforePublishStatus: previous.publishStatus,
        afterPublishStatus: current.publishStatus
      }
    });
  }

  if (previous.reviewStatus !== current.reviewStatus) {
    appendAuditLog({
      actorType: 'admin_user',
      actorId: 'system',
      organizationId: current.organizationId,
      action: 'content.review_status_changed',
      targetType: 'content',
      targetId: contentId,
      detail: {
        beforeReviewStatus: previous.reviewStatus,
        afterReviewStatus: current.reviewStatus
      }
    });
  }

  return toContentDetail(current);
}

function archiveContent(contentId) {
  const index = contents.findIndex((item) => item.id === contentId);
  if (index < 0) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }
  contents[index] = {
    ...contents[index],
    publishStatus: 'archived',
    updatedAt: new Date().toISOString()
  };
  const archived = contents[index];
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: archived.organizationId,
    action: 'content.archived',
    targetType: 'content',
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

function getContent(contentId) {
  const content = contents.find((item) => item.id === contentId);
  return content ? toContentDetail(content) : null;
}

function normalizeFestivalContentIds(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

  return Array.from(new Set(
    list
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter((contentId) => Boolean(getContent(contentId)))
  ));
}

function toFestivalDetail(festival) {
  const recommendedContentIds = normalizeFestivalContentIds(
    festival.recommendedContentIds || festival.contentIds || []
  );

  return {
    id: festival.id,
    name: festival.name || '',
    lunarDate: festival.lunarDate || festival.date || '',
    solarDate: festival.solarDate || '',
    relatedFigure: festival.relatedFigure || festival.deity || '',
    description: festival.description || festival.reason || '',
    publishStatus: festival.publishStatus || 'published',
    recommendedContentIds,
    recommendedContents: recommendedContentIds
      .map((contentId) => contents.find((content) => content.id === contentId))
      .filter(Boolean)
      .map(toContentSummary),
    createdAt: festival.createdAt || null,
    updatedAt: festival.updatedAt || null
  };
}

function listFestivals() {
  return festivals
    .map(toFestivalDetail)
    .filter((festival) => festival.publishStatus === 'published');
}

function listAdminFestivals() {
  return festivals.map(toFestivalDetail);
}

function createFestival(payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) {
    const error = new Error('Festival name is required');
    error.statusCode = 400;
    throw error;
  }

  const festival = {
    id: createId('festival'),
    name,
    lunarDate: String(payload.lunarDate || '').trim(),
    solarDate: String(payload.solarDate || '').trim(),
    relatedFigure: String(payload.relatedFigure || '').trim(),
    description: String(payload.description || '').trim(),
    publishStatus: payload.publishStatus || 'draft',
    recommendedContentIds: normalizeFestivalContentIds(payload.recommendedContentIds),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  festivals.unshift(festival);
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: '',
    action: 'festival.created',
    targetType: 'festival',
    targetId: festival.id,
    detail: {
      name: festival.name,
      publishStatus: festival.publishStatus,
      recommendedContentIds: festival.recommendedContentIds
    }
  });
  return toFestivalDetail(festival);
}

function updateFestival(festivalId, payload = {}) {
  const index = festivals.findIndex((item) => item.id === festivalId);
  if (index < 0) {
    const error = new Error('Festival not found');
    error.statusCode = 404;
    throw error;
  }

  const previous = toFestivalDetail(festivals[index]);
  const name = String(payload.name !== undefined ? payload.name : previous.name).trim();
  if (!name) {
    const error = new Error('Festival name is required');
    error.statusCode = 400;
    throw error;
  }

  festivals[index] = {
    ...festivals[index],
    name,
    lunarDate: payload.lunarDate !== undefined ? String(payload.lunarDate || '').trim() : previous.lunarDate,
    solarDate: payload.solarDate !== undefined ? String(payload.solarDate || '').trim() : previous.solarDate,
    relatedFigure: payload.relatedFigure !== undefined ? String(payload.relatedFigure || '').trim() : previous.relatedFigure,
    description: payload.description !== undefined ? String(payload.description || '').trim() : previous.description,
    publishStatus: payload.publishStatus || previous.publishStatus || 'draft',
    recommendedContentIds: payload.recommendedContentIds !== undefined
      ? normalizeFestivalContentIds(payload.recommendedContentIds)
      : previous.recommendedContentIds,
    updatedAt: new Date().toISOString()
  };

  const current = toFestivalDetail(festivals[index]);
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: '',
    action: 'festival.updated',
    targetType: 'festival',
    targetId: festivalId,
    detail: {
      beforeName: previous.name,
      afterName: current.name,
      beforePublishStatus: previous.publishStatus,
      afterPublishStatus: current.publishStatus,
      recommendedContentIds: current.recommendedContentIds
    }
  });
  return current;
}

function archiveFestival(festivalId) {
  const index = festivals.findIndex((item) => item.id === festivalId);
  if (index < 0) {
    const error = new Error('Festival not found');
    error.statusCode = 404;
    throw error;
  }

  festivals[index] = {
    ...festivals[index],
    publishStatus: 'archived',
    updatedAt: new Date().toISOString()
  };
  const archived = toFestivalDetail(festivals[index]);
  appendAuditLog({
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: '',
    action: 'festival.archived',
    targetType: 'festival',
    targetId: festivalId,
    detail: {
      name: archived.name
    }
  });
  return archived;
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
    .filter((log) => matchesDateRange(log.createdAt, filters))
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
    scheduleNextPlanReminderJobs(userId, {
      ...existing,
      tasks: state.tasks.filter((task) => task.planId === existing.id)
    }, content);
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
  scheduleNextPlanReminderJobs(userId, { ...plan, tasks }, content);

  return {
    isNew: true,
    plan: {
      ...plan,
      tasks
    }
  };
}

function completeTask({ taskId, userId = '', result = 'stronger', selfRating = '', latencyBand = '', mistakeCount = 0, note = '' }) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    const error = new Error('Review task not found');
    error.statusCode = 404;
    throw error;
  }
  if (userId && task.userId !== userId) {
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

  const doneCount = state.tasks.filter((item) => item.planId === plan.id && item.status === 'completed').length;
  const total = Number(plan.totalDays || 1);
  const mastered = doneCount >= total;
  const rawNextMasteryScore = Math.max(0, Math.min(100, plan.masteryScore + masteryDelta));
  plan.masteryScore = mastered ? 100 : Math.min(95, rawNextMasteryScore);
  plan.currentDay = mastered ? total : Math.min(total, doneCount + 1);
  plan.streakHits += result === 'needs_work' ? 0 : 1;
  plan.lastReviewedAt = now;
  plan.updatedAt = now;

  if (result === 'needs_work') {
    plan.state = 'at_risk';
  } else if (mastered) {
    plan.state = 'mastered';
  } else {
    plan.state = 'reviewing';
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
  const planWithTasks = {
    ...plan,
    tasks: state.tasks.filter((item) => item.planId === plan.id)
  };
  scheduleNextPlanReminderJobs(task.userId, planWithTasks, contents.find((item) => item.id === plan.contentId));

  return {
    task,
    plan: planWithTasks
  };
}

function loginByWechatCode(payload = {}) {
  const code = String(payload.code || '').trim() || `mock-${Date.now()}`;
  const openid = String(payload.wechatOpenid || `mock_${hashValue(code).slice(0, 24)}`).trim();
  const userInfo = payload.userInfo || {};
  const incomingNickname = String(userInfo.nickName || payload.nickname || '').trim();
  const nickname = incomingNickname || '微信用户';
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
    if (isMeaningfulNickname(incomingNickname)) {
      user.nickname = incomingNickname;
    }
    if (avatarUrl) {
      user.avatarUrl = avatarUrl;
    }
    user.lastLoginAt = new Date().toISOString();
  }

  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl || '',
    platform: user.platform,
    status: user.status,
    phone: user.phone || ''
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
    status: user.status || 'active',
    phone: user.phone || ''
  };
}

function updateUserProfile(userId, payload = {}) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const nickname = String(payload.nickname || payload.nickName || '').trim();
  const avatarUrl = String(payload.avatarUrl || '').trim();
  const phone = String(payload.phone || '').trim();

  if (nickname) user.nickname = nickname;
  if (avatarUrl) user.avatarUrl = avatarUrl;
  if (phone) user.phone = phone;
  user.updatedAt = new Date().toISOString();

  return getUserById(user.id);
}

function isMeaningfulNickname(value) {
  const nickname = String(value || '').trim();
  return Boolean(nickname && nickname !== '微信用户');
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

function scheduleNextPlanReminderJobs(userId, plan = {}, content = {}) {
  if (plan.state === 'mastered') return [];
  const nextTask = (plan.tasks || [])
    .filter((task) => task.status !== 'completed')
    .slice()
    .sort((left, right) => {
      const byDate = String(left.dueDate || '').localeCompare(String(right.dueDate || ''));
      if (byDate !== 0) return byDate;
      return Number(left.dayIndex || 0) - Number(right.dayIndex || 0);
    })[0];
  if (!nextTask) return [];

  return scheduleNotificationJobs({
    userId,
    taskId: nextTask.id,
    date: nextTask.dueDate || todayDate(),
    period: 'morning',
    payload: {
      type: 'review',
      planId: plan.id,
      contentId: plan.contentId,
      title: plan.title || content.title || '',
      mode: plan.mode || 'scientific',
      dayIndex: nextTask.dayIndex,
      totalDays: plan.totalDays,
      method: nextTask.method,
      message: `今天复习 ${plan.title || content.title || '修持内容'}`
    }
  });
}

function scheduleNextRecitationReminderJobs(userId, goal = {}, content = {}, date = addDays(todayDate(), 1)) {
  if (!goal || !goal.contentId) return [];
  return scheduleNotificationJobs({
    userId,
    taskId: null,
    date,
    period: goal.preferredPeriod || 'morning',
    payload: {
      type: 'recitation',
      goalId: goal.id || '',
      contentId: goal.contentId,
      title: content.title || '',
      dailyTargetCount: goal.dailyTargetCount || 1,
      preferredPeriod: goal.preferredPeriod || 'morning',
      message: `今天读诵 ${content.title || '修持内容'}`
    }
  });
}

function scheduleNotificationJobs({ userId, taskId = null, date, period = 'morning', payload = {} }) {
  const scheduledAt = buildReminderScheduledAt(date, period);
  return getEnabledNotificationChannels(userId)
    .map((channel) => ensureNotificationJob({
      userId,
      taskId,
      channel,
      scheduledAt,
      payload
    }))
    .filter(Boolean);
}

function getEnabledNotificationChannels(userId) {
  return getNotificationSettings(userId)
    .filter((setting) => setting.enabled !== false)
    .map((setting) => setting.channel)
    .filter(Boolean);
}

function ensureNotificationJob({ userId, taskId = null, channel, scheduledAt, payload = {} }) {
  const existing = state.notificationJobs.find((job) => {
    if (job.userId !== userId || job.channel !== channel || job.status !== 'pending') return false;
    if (taskId) return job.taskId === taskId;
    const existingPayload = job.payload || {};
    return !job.taskId &&
      existingPayload.type === payload.type &&
      existingPayload.contentId === payload.contentId &&
      String(existingPayload.goalId || '') === String(payload.goalId || '') &&
      String(job.scheduledAt || '').slice(0, 10) === String(scheduledAt || '').slice(0, 10);
  });
  if (existing) return existing;
  return createNotificationJob({ userId, taskId, channel, scheduledAt, payload });
}

function buildReminderScheduledAt(date, period = 'morning') {
  const hourByPeriod = {
    morning: 8,
    noon: 12,
    evening: 18,
    night: 21,
    theme: 8
  };
  const dateText = String(date || todayDate()).slice(0, 10);
  const hour = hourByPeriod[String(period || 'morning')] || hourByPeriod.morning;
  const intended = new Date(`${dateText}T${String(hour).padStart(2, '0')}:00:00+08:00`);
  const minimum = new Date(Date.now() + 10 * 60 * 1000);
  const scheduled = Number.isNaN(intended.getTime()) || intended < minimum ? minimum : intended;
  return scheduled.toISOString();
}

function listNotificationJobs({ userId = 'demo-user', limit = 20, status, startAt, endAt, organizationId, type, mode, includeAllUsers = false } = {}) {
  return state.notificationJobs
    .filter((job) => includeAllUsers || job.userId === userId)
    .filter((job) => !status || job.status === status)
    .filter((job) => matchesDateRange(job.scheduledAt, { startAt, endAt }))
    .filter((job) => {
      if (!organizationId && !type && !mode) return true;
      const task = state.tasks.find((item) => item.id === job.taskId);
      const plan = task ? state.plans.find((item) => item.id === task.planId) : null;
      const content = plan ? contents.find((item) => item.id === plan.contentId) : null;
      const effectiveOrganizationId = content?.organizationId || organizations[0]?.id || '';
      if (organizationId && effectiveOrganizationId !== organizationId) return false;
      if (type && content?.type !== type) return false;
      if (mode && plan?.mode !== normalizeMode(mode)) return false;
      return true;
    })
    .slice()
    .sort((left, right) => String(right.scheduledAt).localeCompare(String(left.scheduledAt)))
    .slice(0, Number(limit || 20))
    .map((job) => {
      const task = state.tasks.find((item) => item.id === job.taskId);
      const plan = task ? state.plans.find((item) => item.id === task.planId) : null;
      const content = plan ? contents.find((item) => item.id === plan.contentId) : null;
      const user = state.users.find((item) => item.id === job.userId);
      return {
        ...job,
        userNickname: user?.nickname || '',
        mode: plan?.mode || '',
        contentId: content?.id || '',
        title: content?.title || job.payload?.title || ''
      };
    });
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
    scheduleNextRecitationReminderJobs(userId, existing, content, addDays(todayDate(), 1));
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
  scheduleNextRecitationReminderJobs(userId, goal, content, addDays(todayDate(), 1));
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
  if (session.completed) {
    const goal = state.recitationGoals.find((item) => item.id === goalId && item.userId === userId);
    scheduleNextRecitationReminderJobs(
      userId,
      goal || {
        id: goalId,
        contentId,
        preferredPeriod: period,
        dailyTargetCount: roundCount,
        goalType: sessionType || 'daily'
      },
      content,
      addDays(todayDate(), 1)
    );
  }
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

function buildRecentDailyTrend(rows, dateField, { startAt, endAt, maxDays = 7 } = {}) {
  const normalizedEndAt = String(endAt || '').trim() || new Date().toISOString();
  const normalizedStartAt = String(startAt || '').trim() || normalizedEndAt;
  const endDate = new Date(normalizedEndAt);
  const startDate = new Date(normalizedStartAt);
  endDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCHours(0, 0, 0, 0);
  if (startDate.getTime() > endDate.getTime()) startDate.setTime(endDate.getTime());

  const days = [];
  for (let cursor = new Date(endDate); cursor.getTime() >= startDate.getTime() && days.length < maxDays; cursor.setUTCDate(cursor.getUTCDate() - 1)) {
    days.unshift(cursor.toISOString().slice(0, 10));
  }
  if (!days.length) days.push(endDate.toISOString().slice(0, 10));

  const counter = new Map(days.map((day) => [day, 0]));
  rows.forEach((item) => {
    const day = String(item?.[dateField] || '').slice(0, 10);
    if (counter.has(day)) {
      counter.set(day, Number(counter.get(day) || 0) + 1);
    }
  });

  return days.map((day) => ({
    day,
    label: day.slice(5),
    count: Number(counter.get(day) || 0)
  }));
}

function buildModeDistribution(planRows = []) {
  return planRows.reduce((summary, item) => {
    const key = item.mode === 'playful' ? 'playful' : 'scientific';
    summary[key] += 1;
    summary.total += 1;
    return summary;
  }, { scientific: 0, playful: 0, total: 0 });
}

function getDashboard(filters = {}) {
  const filteredContents = listContents({
    organizationId: filters.organizationId,
    type: filters.type,
    mode: filters.mode
  });
  const contentIds = new Set(filteredContents.map((item) => item.id));
  const filteredPlans = state.plans.filter((item) => (
    contentIds.has(item.contentId) &&
    matchesDateRange(item.createdAt, filters) &&
    (!filters.mode || item.mode === normalizeMode(filters.mode))
  ));
  const filteredTasks = state.tasks.filter((item) => {
    if (item.status !== 'completed') return false;
    const plan = state.plans.find((entry) => entry.id === item.planId);
    if (!plan) return false;
    return contentIds.has(plan.contentId) &&
      (!filters.mode || plan.mode === normalizeMode(filters.mode)) &&
      matchesDateRange(item.completedAt || item.updatedAt, filters);
  });
  const filteredPracticeSessions = state.practiceSessions.filter((item) => (
    contentIds.has(item.contentId) &&
    (!filters.mode || item.mode === normalizeMode(filters.mode)) &&
    matchesDateRange(item.createdAt, filters)
  ));
  const filteredRecitationSessions = state.recitationSessions.filter((item) => (
    contentIds.has(item.contentId) &&
    item.completed &&
    matchesDateRange(item.createdAt, filters)
  ));
  const filteredAssets = state.assets.filter((item) => !filters.organizationId || item.organizationId === filters.organizationId);
  const filteredAuditLogs = listAuditLogs({
    organizationId: filters.organizationId,
    startAt: filters.startAt,
    endAt: filters.endAt,
    limit: 999
  });
  const filteredMembers = filters.organizationId
    ? state.organizationMembers.filter((item) => item.organizationId === filters.organizationId && item.status === 'active')
    : state.organizationMembers.filter((item) => item.status === 'active');
  const recentDispatches = listNotificationJobs({
    includeAllUsers: true,
    organizationId: filters.organizationId,
    type: filters.type,
    mode: filters.mode,
    status: 'sent',
    startAt: filters.startAt,
    endAt: filters.endAt,
    limit: 6
  });

  return {
    userCount: filteredMembers.length || state.users.length,
    contentCount: filteredContents.length,
    planCount: filteredPlans.length,
    completedTaskCount: filteredTasks.length,
    practiceSessionCount: filteredPracticeSessions.length,
    recitationSessionCount: filteredRecitationSessions.length,
    assetCount: filteredAssets.length,
    organizationCount: filters.organizationId ? 1 : state.organizations.length,
    auditLogCount: filteredAuditLogs.length,
    modeDistribution: buildModeDistribution(filteredPlans),
    practiceTrend: buildRecentDailyTrend(filteredPracticeSessions, 'createdAt', filters),
    recitationTrend: buildRecentDailyTrend(filteredRecitationSessions, 'createdAt', filters),
    recentDispatches,
    recentPlans: filteredPlans
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 6),
    recentRecitations: filteredRecitationSessions
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 6)
      .map((item) => {
      const content = contents.find((entry) => entry.id === item.contentId);
      return {
        id: item.id,
        title: content ? content.title : '',
        period: item.period,
        roundCount: item.roundCount,
        createdAt: item.createdAt
      };
    }),
    recentAuditLogs: listAuditLogs({
      limit: 6,
      organizationId: filters.organizationId,
      startAt: filters.startAt,
      endAt: filters.endAt
    })
  };
}

function matchesDateRange(value, filters = {}) {
  const current = Date.parse(String(value || ''));
  if (Number.isNaN(current)) return true;
  const startAt = Date.parse(String(filters.startAt || ''));
  const endAt = Date.parse(String(filters.endAt || ''));
  if (!Number.isNaN(startAt) && current < startAt) return false;
  if (!Number.isNaN(endAt) && current > endAt) return false;
  return true;
}

function toContentSummary(content) {
  return {
    id: content.id,
    organizationId: content.organizationId || organizations[0]?.id || '',
    title: content.title,
    subtitle: content.subtitle,
    type: content.type,
    body: content.body,
    preview: content.preview,
    segments: content.segments,
    lengthTier: content.lengthTier,
    planDays: content.planDays,
    scene: content.scene,
    sourceNote: content.sourceNote || '',
    versionNote: content.versionNote || '',
    sourceContentId: content.sourceContentId || '',
    sourceVersionNo: content.sourceVersionNo || null,
    accessLevel: content.accessLevel,
    publishStatus: content.publishStatus || 'draft',
    reviewStatus: content.reviewStatus || 'draft',
    reviewedAt: content.reviewedAt || null,
    createdAt: content.createdAt || null,
    updatedAt: content.updatedAt || null,
    defaultMode: normalizeMode(content.defaultMode || 'scientific'),
    supportedModes: normalizeSupportedModes(content.supportedModes || ['scientific', 'playful'], content.defaultMode || 'scientific'),
    supportsRecitation: content.supportsRecitation !== false,
    recommendedRecitationTime: content.recommendedRecitationTime || '',
    recitationTheme: content.recitationTheme || ''
  };
}

function matchesContentMode(content, mode) {
  const normalizedMode = normalizeMode(mode);
  const supportedModes = normalizeSupportedModes(content.supportedModes || [], content.defaultMode || 'scientific');
  return supportedModes.includes(normalizedMode) || normalizeMode(content.defaultMode) === normalizedMode;
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
  archiveFestival,
  copyContentAsNewVersion,
  createFestival,
  listAdminContents,
  listAdminFestivals,
  createNotificationJob,
  dispatchNotificationJobs,
  createRecitationSession,
  getUserById,
  getGrowthOverview,
  getNotificationSettings,
  getDashboard,
  listNotificationJobs,
  loginByWechatCode,
  updateUserProfile,
  createPlan,
  createAsset,
  createContent,
  completeTask,
  getContent,
  listContentVersions,
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
  updateFestival,
  updateAssetAccess,
  upsertRecitationGoal,
  upsertNotificationSetting,
  todayDate
};
