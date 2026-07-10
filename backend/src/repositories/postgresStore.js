const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const { recommendPlan } = require('../../../common/adaptive-memory');
const { ensureAdaptiveSchema } = require('./adaptiveSchema');

const REVIEW_METHODS = ['拆段跟读', '首字提示', '遮挡回忆', '填空复现', '整段复诵', '抽查巩固'];
const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30];
const REVIEW_TAIL_INTERVAL = 15;
const GROWTH_STAGES = ['初见', '熟悉', '稳定', '通顺', '已持诵'];
const MAX_IDEMPOTENCY_KEY_LENGTH = 180;

const DB_CONFIG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5432',
  user: process.env.PGUSER || 'magic',
  password: process.env.PGPASSWORD || 'Noending5@',
  database: process.env.PGDATABASE || 'onemind'
};

const PSQL_BIN = resolvePsqlBinary();

const IDS = {
  demoUser: '11111111-1111-4111-8111-111111111111',
  adminUser: '11111111-1111-4111-8111-222222222222',
  organization: '22222222-2222-4222-8222-222222222222',
  contents: {
    'six-syllable-mantra': '33333333-3333-4333-8333-000000000001',
    'green-tara-mantra': '33333333-3333-4333-8333-000000000002',
    'diamond-sutra-ending': '33333333-3333-4333-8333-000000000003',
    'heart-sutra-core': '33333333-3333-4333-8333-000000000004',
    'great-compassion-opening': '33333333-3333-4333-8333-000000000005'
  },
  festivals: {
    'guanyin-birthday': '44444444-4444-4444-8444-000000000001',
    'medicine-buddha-birthday': '44444444-4444-4444-8444-000000000002'
  },
  assets: {
    heartAudio: '55555555-5555-4555-8555-000000000001',
    guanyinThangka: '55555555-5555-4555-8555-000000000002',
    privateRitual: '55555555-5555-4555-8555-000000000003'
  }
};

const DEFAULT_ADMIN_SEEDS = [
  {
    id: IDS.adminUser,
    username: process.env.ADMIN_USERNAME || 'magic',
    name: '系统管理员',
    role: 'super_admin',
    password: process.env.ADMIN_PASSWORD || 'Noending5@',
    email: 'admin@onemind.local',
    phone: '00000000000'
  },
  {
    id: '11111111-1111-4111-8111-333333333333',
    username: process.env.ADMIN_EDITOR_USERNAME || 'editor',
    name: '内容编辑',
    role: 'content_editor',
    password: process.env.ADMIN_EDITOR_PASSWORD || 'Noending5@',
    email: 'editor@onemind.local',
    phone: '00000000001'
  },
  {
    id: '11111111-1111-4111-8111-444444444444',
    username: process.env.ADMIN_REVIEWER_USERNAME || 'reviewer',
    name: '内容审核员',
    role: 'content_reviewer',
    password: process.env.ADMIN_REVIEWER_PASSWORD || 'Noending5@',
    email: 'reviewer@onemind.local',
    phone: '00000000002'
  }
];

const GREAT_COMPASSION_SEGMENTS = [
  '南无喝啰怛那哆啰夜耶',
  '南无阿唎耶',
  '婆卢羯帝烁钵啰耶',
  '菩提萨埵婆耶',
  '摩诃萨埵婆耶',
  '摩诃迦卢尼迦耶',
  '唵',
  '萨皤啰罚曳',
  '数怛那怛写',
  '南无悉吉栗埵伊蒙阿唎耶',
  '婆卢吉帝室佛啰楞驮婆',
  '南无那啰谨墀',
  '醯唎摩诃皤哆沙咩',
  '萨婆阿他豆输朋',
  '阿逝孕',
  '萨婆萨哆那摩婆萨哆那摩婆伽',
  '摩罚特豆',
  '怛侄他',
  '唵阿婆卢醯',
  '卢迦帝',
  '迦罗帝',
  '夷醯唎',
  '摩诃菩提萨埵',
  '萨婆萨婆',
  '摩啰摩啰',
  '摩醯摩醯唎驮孕',
  '俱卢俱卢羯蒙',
  '度卢度卢罚阇耶帝',
  '摩诃罚阇耶帝',
  '陀啰陀啰',
  '地唎尼',
  '室佛啰耶',
  '遮啰遮啰',
  '摩么罚摩啰',
  '穆帝隶',
  '伊醯伊醯',
  '室那室那',
  '阿啰参佛啰舍利',
  '罚沙罚参',
  '佛啰舍耶',
  '呼卢呼卢摩啰',
  '呼卢呼卢醯利',
  '娑啰娑啰',
  '悉唎悉唎',
  '苏嚧苏嚧',
  '菩提夜菩提夜',
  '菩驮夜菩驮夜',
  '弥帝唎夜',
  '那啰谨墀',
  '地利瑟尼那',
  '波夜摩那',
  '娑婆诃',
  '悉陀夜',
  '娑婆诃',
  '摩诃悉陀夜',
  '娑婆诃',
  '悉陀喻艺',
  '室皤啰耶',
  '娑婆诃',
  '那啰谨墀',
  '娑婆诃',
  '摩啰那啰',
  '娑婆诃',
  '悉啰僧阿穆佉耶',
  '娑婆诃',
  '娑婆摩诃阿悉陀夜',
  '娑婆诃',
  '者吉啰阿悉陀夜',
  '娑婆诃',
  '波陀摩羯悉陀夜',
  '娑婆诃',
  '那啰谨墀皤伽啰耶',
  '娑婆诃',
  '摩婆利胜羯啰夜',
  '娑婆诃',
  '南无喝啰怛那哆啰夜耶',
  '南无阿唎耶',
  '婆嚧吉帝',
  '烁皤啰夜',
  '娑婆诃',
  '唵悉殿都',
  '漫多啰',
  '跋陀耶',
  '娑婆诃'
];

const GREAT_COMPASSION_BODY = GREAT_COMPASSION_SEGMENTS.join('，');

const GREAT_COMPASSION_VERSION = {
  id: 'great-compassion-v1',
  versionNo: 1,
  reviewStatus: 'approved',
  sourceNote: '经人工校对的首发版本',
  versionNote: '首版 84 句学习结构'
};

const GREAT_COMPASSION_STRUCTURE_SECTIONS = [
  [0, 14],
  [14, 28],
  [28, 42],
  [42, 56],
  [56, 70],
  [70, 84]
].map(([startIndex, endIndex], index) => ({
  title: `第${index + 1}学习段`,
  sortOrder: index + 1,
  units: GREAT_COMPASSION_SEGMENTS.slice(startIndex, endIndex).map((text, offset) => ({
    text,
    pinyin: '',
    firstCharacterCue: Array.from(text)[0] || '',
    estimatedSeconds: 30,
    sortOrder: startIndex + offset + 1
  }))
}));

const LEGACY_ID_MAP = {
  ...IDS.contents,
  'om-mani': IDS.contents['six-syllable-mantra'],
  'green-tara': IDS.contents['green-tara-mantra'],
  'diamond-end': IDS.contents['diamond-sutra-ending'],
  'heart-sutra-core': IDS.contents['heart-sutra-core'],
  'great-compassion-snippet': IDS.contents['great-compassion-opening'],
  'org-demo-dharma': IDS.organization,
  'asset-heart-audio': IDS.assets.heartAudio,
  'asset-guanyin-thangka': IDS.assets.guanyinThangka,
  'asset-private-ritual': IDS.assets.privateRitual
};

const CONTENT_VERSION_ALIASES = {
  [GREAT_COMPASSION_VERSION.id]: {
    contentId: IDS.contents['great-compassion-opening'],
    versionNo: GREAT_COMPASSION_VERSION.versionNo
  }
};

function initializeDatabase() {
  queryScalar('select 1');
  ensureAdminSchema();
  ensureFeatureSchema();
  seedDatabase();
}

function ensureAdminSchema() {
  queryScalar(`
    alter table admin_users
      add column if not exists username varchar(80)
  `);
  queryScalar(`
    alter table admin_users
      add column if not exists role varchar(60) not null default 'super_admin'
  `);
  queryScalar(`
    create unique index if not exists admin_users_username_uidx
      on admin_users (username)
      where username is not null
  `);
}

function ensureFeatureSchema() {
  queryScalar(`
    alter table contents
      add column if not exists source_note text
  `);
  queryScalar(`
    alter table contents
      add column if not exists version_note text
  `);
  queryScalar(`
    alter table contents
      add column if not exists review_status varchar(32) not null default 'draft'
  `);
  queryScalar(`
    alter table contents
      add column if not exists source_content_id uuid references contents(id)
  `);
  queryScalar(`
    alter table contents
      add column if not exists source_version_no int
  `);
  queryScalar(`
    alter table memory_plans
      add column if not exists mode varchar(32) not null default 'scientific'
  `);
  queryScalar(`
    create table if not exists content_mode_configs (
      id uuid primary key default gen_random_uuid(),
      content_id uuid not null references contents(id),
      default_mode varchar(32) not null default 'scientific',
      supported_modes jsonb not null default '["scientific"]'::jsonb,
      supports_recitation boolean not null default false,
      recommended_recitation_time varchar(32),
      recitation_theme varchar(120),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  queryScalar(`
    create unique index if not exists content_mode_configs_content_uidx
      on content_mode_configs (content_id)
  `);
  queryScalar(`
    create table if not exists practice_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id),
      plan_id uuid not null references memory_plans(id),
      task_id uuid references review_tasks(id),
      content_id uuid not null references contents(id),
      mode varchar(32) not null,
      self_rating varchar(32),
      result_level varchar(32) not null,
      latency_band varchar(32),
      mistake_count int not null default 0,
      growth_stage varchar(32),
      note text,
      created_at timestamptz not null default now()
    )
  `);
  queryScalar(`
    create table if not exists recitation_goals (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id),
      content_id uuid not null references contents(id),
      goal_type varchar(32) not null default 'daily',
      preferred_period varchar(32) not null default 'morning',
      daily_target_count int not null default 1,
      status varchar(32) not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  queryScalar(`
    create unique index if not exists recitation_goals_user_content_uidx
      on recitation_goals (user_id, content_id, goal_type)
  `);
  queryScalar(`
    create table if not exists recitation_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id),
      content_id uuid not null references contents(id),
      goal_id uuid references recitation_goals(id),
      session_type varchar(32) not null default 'free',
      period varchar(32),
      round_count int not null default 1,
      duration_seconds int not null default 0,
      completed boolean not null default true,
      note text,
      created_at timestamptz not null default now()
    )
  `);
  ensureAdaptiveSchema(queryScalar);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

function normalizeRecitationPeriod(value) {
  const period = String(value || '').trim();
  return period || 'morning';
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
  const planDay = Number(task.dayIndex || plan.currentDay || 1);
  if (plan.state === 'at_risk') {
    return `这段最近出现遗忘波动，建议在第 ${planDay} 轮及时巩固。`;
  }
  if (planDay <= 2) {
    return `你在最近 ${planDay} 天刚开始学习，正处于易遗忘窗口。`;
  }
  if (Number(plan.masteryScore || 0) >= 60) {
    return '这段已接近稳定，再巩固一次即可进入更长周期。';
  }
  return '按记忆曲线安排今天复习，能减少后续反复遗忘。';
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
      cursor = day;
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }
  return streak;
}

function listContents(filters = {}) {
  const where = [
    "c.publish_status = 'published'",
    'c.deleted_at is null'
  ];
  if (filters.type) where.push(`c.type = ${sqlValue(filters.type)}`);
  if (filters.organizationId) where.push(`c.organization_id = ${sqlValue(normalizeId(filters.organizationId))}`);

  return queryRows(`
    select
      c.id::text as "id",
      c.organization_id::text as "organizationId",
      c.title,
      c.subtitle,
      c.type,
      c.body,
      c.preview,
      c.length_tier as "lengthTier",
      c.plan_days as "planDays",
      c.scene,
      c.source_note as "sourceNote",
      c.version_note as "versionNote",
      c.source_content_id::text as "sourceContentId",
      c.source_version_no as "sourceVersionNo",
      c.access_level as "accessLevel",
      c.publish_status as "publishStatus",
      c.review_status as "reviewStatus",
      c.reviewed_at as "reviewedAt",
      c.created_at as "createdAt",
      c.updated_at as "updatedAt"
    from contents c
    where ${where.join(' and ')}
    order by c.created_at asc
  `).map(enrichContentSummary).filter((content) => !filters.mode || matchesContentMode(content, filters.mode));
}

function listAdminContents(filters = {}) {
  const where = ['c.deleted_at is null'];
  if (filters.type) where.push(`c.type = ${sqlValue(filters.type)}`);
  if (filters.organizationId) where.push(`c.organization_id = ${sqlValue(normalizeId(filters.organizationId))}`);
  if (filters.publishStatus) where.push(`c.publish_status = ${sqlValue(filters.publishStatus)}`);
  if (filters.reviewStatus) where.push(`c.review_status = ${sqlValue(filters.reviewStatus)}`);

  return queryRows(`
    select
      c.id::text as "id",
      c.organization_id::text as "organizationId",
      c.title,
      c.subtitle,
      c.type,
      c.body,
      c.preview,
      c.length_tier as "lengthTier",
      c.plan_days as "planDays",
      c.scene,
      c.source_note as "sourceNote",
      c.version_note as "versionNote",
      c.source_content_id::text as "sourceContentId",
      c.source_version_no as "sourceVersionNo",
      c.access_level as "accessLevel",
      c.publish_status as "publishStatus",
      c.review_status as "reviewStatus",
      c.reviewed_at as "reviewedAt",
      c.created_at as "createdAt",
      c.updated_at as "updatedAt"
    from contents c
    where ${where.join(' and ')}
    order by c.updated_at desc, c.created_at desc
  `).map(enrichContentSummary).filter((content) => !filters.mode || matchesContentMode(content, filters.mode));
}

function getContentModeConfig(contentId) {
  const normalizedContentId = normalizeId(contentId);
  if (!normalizedContentId) return null;
  return queryOne(`
    select
      id::text as "id",
      content_id::text as "contentId",
      default_mode as "defaultMode",
      supported_modes as "supportedModes",
      supports_recitation as "supportsRecitation",
      recommended_recitation_time as "recommendedRecitationTime",
      recitation_theme as "recitationTheme",
      updated_at as "updatedAt"
    from content_mode_configs
    where content_id = ${sqlValue(normalizedContentId)}
    limit 1
  `);
}

function upsertContentModeConfig(contentId, payload = {}) {
  const normalizedContentId = normalizeId(contentId);
  if (!normalizedContentId) return null;
  const defaultMode = normalizeMode(payload.defaultMode || payload.mode || 'scientific');
  const supportedModes = normalizeSupportedModes(payload.supportedModes, defaultMode);
  return queryReturningOne(`
    insert into content_mode_configs (
      content_id,
      default_mode,
      supported_modes,
      supports_recitation,
      recommended_recitation_time,
      recitation_theme
    ) values (
      ${sqlValue(normalizedContentId)},
      ${sqlValue(defaultMode)},
      ${sqlJson(supportedModes)}::jsonb,
      ${payload.supportsRecitation ? 'true' : 'false'},
      ${sqlValue(payload.recommendedRecitationTime || null)},
      ${sqlValue(payload.recitationTheme || null)}
    )
    on conflict (content_id) do update set
      default_mode = excluded.default_mode,
      supported_modes = excluded.supported_modes,
      supports_recitation = excluded.supports_recitation,
      recommended_recitation_time = excluded.recommended_recitation_time,
      recitation_theme = excluded.recitation_theme,
      updated_at = now()
    returning
      id::text as "id",
      content_id::text as "contentId",
      default_mode as "defaultMode",
      supported_modes as "supportedModes",
      supports_recitation as "supportsRecitation",
      recommended_recitation_time as "recommendedRecitationTime",
      recitation_theme as "recitationTheme",
      updated_at as "updatedAt"
  `);
}

function enrichContentSummary(content) {
  const segments = Array.isArray(content.segments) && content.segments.length
    ? content.segments
    : queryRows(`
      select text
      from content_segments
      where content_id = ${sqlValue(content.id)}
      order by sort_order asc
    `).map((row) => row.text);
  const modeConfig = getContentModeConfig(content.id) || {
    defaultMode: 'scientific',
    supportedModes: ['scientific'],
    supportsRecitation: false,
    recommendedRecitationTime: null,
    recitationTheme: null
  };
  return {
    ...content,
    segments,
    defaultMode: modeConfig.defaultMode || 'scientific',
    supportedModes: normalizeSupportedModes(modeConfig.supportedModes, modeConfig.defaultMode || 'scientific'),
    supportsRecitation: Boolean(modeConfig.supportsRecitation),
    recommendedRecitationTime: modeConfig.recommendedRecitationTime || '',
    recitationTheme: modeConfig.recitationTheme || ''
  };
}

function matchesContentMode(content, mode) {
  const normalizedMode = normalizeMode(mode);
  const supportedModes = normalizeSupportedModes(content.supportedModes, content.defaultMode || 'scientific');
  return supportedModes.includes(normalizedMode) || normalizeMode(content.defaultMode) === normalizedMode;
}

function nextContentVersionNo(contentId) {
  return Number(queryScalar(`
    select coalesce(max(version_no), 0) + 1
    from content_versions
    where content_id = ${sqlValue(contentId)}
  `) || 1);
}

function createContentVersionSnapshot(content, { changeNote = '' } = {}) {
  const contentId = normalizeId(content?.id);
  if (!contentId) return null;
  const versionNo = nextContentVersionNo(contentId);
  return queryReturningOne(`
    insert into content_versions (
      content_id,
      version_no,
      snapshot_json,
      change_note,
      created_by
    ) values (
      ${sqlValue(contentId)},
      ${versionNo},
      ${sqlJson(content)}::jsonb,
      ${sqlValue(String(changeNote || '').trim() || content.versionNote || '自动保存版本快照')},
      ${sqlValue(IDS.adminUser)}
    )
    returning
      id::text as "id",
      content_id::text as "contentId",
      version_no as "versionNo",
      snapshot_json as "snapshotJson",
      change_note as "changeNote",
      created_by::text as "createdBy",
      created_at as "createdAt"
  `);
}

function listContentVersions(contentId) {
  const normalizedContentId = normalizeId(contentId);
  if (!normalizedContentId) return [];
  return queryRows(`
    select
      id::text as "id",
      content_id::text as "contentId",
      version_no as "versionNo",
      snapshot_json as "snapshotJson",
      change_note as "changeNote",
      created_by::text as "createdBy",
      created_at as "createdAt"
    from content_versions
    where content_id = ${sqlValue(normalizedContentId)}
    order by version_no desc, created_at desc
  `);
}

function createContent(payload = {}) {
  const title = String(payload.title || '').trim();
  const body = String(payload.body || payload.preview || '').trim();
  if (!title || !body) {
    const error = new Error('Content title and body are required');
    error.statusCode = 400;
    throw error;
  }

  const type = payload.type || 'mantra';
  const lengthTier = payload.lengthTier || 'short';
  const planDays = Math.max(1, Number(payload.planDays || 1));
  const accessLevel = payload.accessLevel || 'public';
  const publishStatus = payload.publishStatus || 'draft';
  const reviewStatus = payload.reviewStatus || (publishStatus === 'published' ? 'approved' : 'draft');
  const segments = normalizeSegments(payload.segments, body);
  const organizationId = normalizeId(payload.organizationId) || IDS.organization;
  const sourceContentId = normalizeId(payload.sourceContentId);
  const sourceVersionNo = payload.sourceVersionNo ? Number(payload.sourceVersionNo) : null;

  const content = queryReturningOne(`
    insert into contents (
      title,
      subtitle,
      type,
      body,
      preview,
      length_tier,
      plan_days,
      scene,
      source_note,
      version_note,
      access_level,
      publish_status,
      review_status,
      source_content_id,
      source_version_no,
      organization_id,
      created_by,
      reviewed_by,
      reviewed_at,
      published_at
    ) values (
      ${sqlValue(title)},
      ${sqlValue(payload.subtitle || '')},
      ${sqlValue(type)},
      ${sqlValue(body)},
      ${sqlValue(payload.preview || body)},
      ${sqlValue(lengthTier)},
      ${planDays},
      ${sqlValue(payload.scene || '后台新增内容')},
      ${sqlValue(payload.sourceNote || '')},
      ${sqlValue(payload.versionNote || '')},
      ${sqlValue(accessLevel)},
      ${sqlValue(publishStatus)},
      ${sqlValue(reviewStatus)},
      ${sqlValue(sourceContentId)},
      ${sqlValue(sourceVersionNo)},
      ${sqlValue(organizationId)},
      ${sqlValue(IDS.adminUser)},
      ${reviewStatus === 'draft' ? 'null' : sqlValue(IDS.adminUser)},
      ${reviewStatus === 'draft' ? 'null' : 'now()'},
      case when ${sqlValue(publishStatus)} = 'published' then now() else null end
    )
    returning
      id::text as "id",
      organization_id::text as "organizationId",
      title,
      subtitle,
      type,
      body,
      preview,
      length_tier as "lengthTier",
      plan_days as "planDays",
      scene,
      source_note as "sourceNote",
      version_note as "versionNote",
      source_content_id::text as "sourceContentId",
      source_version_no as "sourceVersionNo",
      access_level as "accessLevel",
      publish_status as "publishStatus",
      review_status as "reviewStatus",
      reviewed_at as "reviewedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);

  segments.forEach((segment, index) => {
    queryScalar(`
      insert into content_segments (content_id, sort_order, text)
      values (${sqlValue(content.id)}, ${index + 1}, ${sqlValue(segment)})
      returning id::text
    `);
  });

  upsertContentModeConfig(content.id, payload);

  appendAuditLog({
    action: 'content.created',
    organizationId,
    targetType: 'content',
    targetId: content.id,
    detail: {
      title,
      type,
      accessLevel,
      publishStatus,
      reviewStatus
    }
  });

  return getContent(content.id);
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
    sourceNote: source.sourceNote,
    versionNote,
    accessLevel: source.accessLevel,
    organizationId: source.organizationId,
    publishStatus: 'draft',
    reviewStatus: 'reviewing',
    defaultMode: source.defaultMode,
    supportedModes: source.supportedModes,
    supportsRecitation: source.supportsRecitation,
    recommendedRecitationTime: source.recommendedRecitationTime,
    recitationTheme: source.recitationTheme,
    sourceContentId: source.id,
    sourceVersionNo: snapshot.versionNo,
    segments: source.segments
  });

  appendAuditLog({
    action: 'content.version_copied',
    organizationId: source.organizationId || IDS.organization,
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
  const id = normalizeId(contentId);
  const existing = id ? getContent(id) : null;
  if (!existing) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  const title = String(payload.title || existing.title || '').trim();
  const body = String(payload.body || existing.body || '').trim();
  if (!title || !body) {
    const error = new Error('Content title and body are required');
    error.statusCode = 400;
    throw error;
  }

  if (existing.publishStatus === 'published') {
    createContentVersionSnapshot(existing, {
      changeNote: payload.versionNote || '更新已发布内容前自动保存版本快照'
    });
  }

  const segments = normalizeSegments(payload.segments, body);
  const publishStatus = payload.publishStatus || existing.publishStatus || 'draft';
  const reviewStatus = payload.reviewStatus
    || (publishStatus === 'published'
      ? (existing.reviewStatus === 'rejected' ? 'rejected' : 'approved')
      : existing.reviewStatus || 'draft');
  const organizationId = normalizeId(payload.organizationId) || existing.organizationId || IDS.organization;
  const sourceContentId = payload.sourceContentId !== undefined ? normalizeId(payload.sourceContentId) : (existing.sourceContentId || null);
  const sourceVersionNo = payload.sourceVersionNo !== undefined ? Number(payload.sourceVersionNo || 0) || null : (existing.sourceVersionNo || null);
  const updated = queryReturningOne(`
    update contents
    set
      title = ${sqlValue(title)},
      subtitle = ${sqlValue(payload.subtitle !== undefined ? payload.subtitle : existing.subtitle || '')},
      type = ${sqlValue(payload.type || existing.type)},
      body = ${sqlValue(body)},
      preview = ${sqlValue(payload.preview || body)},
      length_tier = ${sqlValue(payload.lengthTier || existing.lengthTier)},
      plan_days = ${Math.max(1, Number(payload.planDays || existing.planDays || 1))},
      scene = ${sqlValue(payload.scene || existing.scene || '')},
      source_note = ${sqlValue(payload.sourceNote !== undefined ? payload.sourceNote : existing.sourceNote || '')},
      version_note = ${sqlValue(payload.versionNote !== undefined ? payload.versionNote : existing.versionNote || '')},
      access_level = ${sqlValue(payload.accessLevel || existing.accessLevel || 'public')},
      publish_status = ${sqlValue(publishStatus)},
      review_status = ${sqlValue(reviewStatus)},
      source_content_id = ${sqlValue(sourceContentId)},
      source_version_no = ${sqlValue(sourceVersionNo)},
      organization_id = ${sqlValue(organizationId)},
      reviewed_by = ${reviewStatus === 'draft' ? 'null' : sqlValue(IDS.adminUser)},
      reviewed_at = ${reviewStatus === 'draft' ? 'null' : 'now()'},
      published_at = case when ${sqlValue(publishStatus)} = 'published' then coalesce(published_at, now()) else null end,
      updated_at = now()
    where id = ${sqlValue(id)}
      and deleted_at is null
    returning
      id::text as "id",
      organization_id::text as "organizationId",
      title,
      subtitle,
      type,
      body,
      preview,
      length_tier as "lengthTier",
      plan_days as "planDays",
      scene,
      source_note as "sourceNote",
      version_note as "versionNote",
      source_content_id::text as "sourceContentId",
      source_version_no as "sourceVersionNo",
      access_level as "accessLevel",
      publish_status as "publishStatus",
      review_status as "reviewStatus",
      reviewed_at as "reviewedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);

  queryScalar(`delete from content_segments where content_id = ${sqlValue(id)}`);
  segments.forEach((segment, index) => {
    queryScalar(`
      insert into content_segments (content_id, sort_order, text)
      values (${sqlValue(id)}, ${index + 1}, ${sqlValue(segment)})
      returning id::text
    `);
  });

  upsertContentModeConfig(id, {
    defaultMode: payload.defaultMode !== undefined ? payload.defaultMode : existing.defaultMode,
    supportedModes: payload.supportedModes !== undefined ? payload.supportedModes : existing.supportedModes,
    supportsRecitation: payload.supportsRecitation !== undefined ? payload.supportsRecitation : existing.supportsRecitation,
    recommendedRecitationTime: payload.recommendedRecitationTime !== undefined ? payload.recommendedRecitationTime : existing.recommendedRecitationTime,
    recitationTheme: payload.recitationTheme !== undefined ? payload.recitationTheme : existing.recitationTheme
  });

  appendAuditLog({
    action: 'content.updated',
    organizationId,
    targetType: 'content',
    targetId: id,
    detail: {
      beforeTitle: existing.title,
      afterTitle: updated.title,
      type: updated.type,
      beforePublishStatus: existing.publishStatus || 'draft',
      afterPublishStatus: updated.publishStatus || 'draft',
      beforeReviewStatus: existing.reviewStatus || 'draft',
      afterReviewStatus: updated.reviewStatus || 'draft'
    }
  });

  if ((existing.publishStatus || 'draft') !== (updated.publishStatus || 'draft')) {
    appendAuditLog({
      action: 'content.publish_status_changed',
      organizationId,
      targetType: 'content',
      targetId: id,
      detail: {
        beforePublishStatus: existing.publishStatus || 'draft',
        afterPublishStatus: updated.publishStatus || 'draft'
      }
    });
  }

  if ((existing.reviewStatus || 'draft') !== (updated.reviewStatus || 'draft')) {
    appendAuditLog({
      action: 'content.review_status_changed',
      organizationId,
      targetType: 'content',
      targetId: id,
      detail: {
        beforeReviewStatus: existing.reviewStatus || 'draft',
        afterReviewStatus: updated.reviewStatus || 'draft'
      }
    });
  }

  return getContent(id);
}

function archiveContent(contentId) {
  const id = normalizeId(contentId);
  const existing = id ? getContent(id) : null;
  if (!existing) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  const archived = queryReturningOne(`
    update contents
    set
      publish_status = 'archived',
      updated_at = now()
    where id = ${sqlValue(id)}
      and deleted_at is null
    returning
      id::text as "id",
      title,
      publish_status as "publishStatus",
      deleted_at as "deletedAt"
  `);

  appendAuditLog({
    action: 'content.archived',
    organizationId: IDS.organization,
    targetType: 'content',
    targetId: id,
    detail: {
      title: existing.title
    }
  });

  return archived;
}

function getContent(contentId) {
  const id = normalizeId(contentId);
  if (!id) return null;

  const content = queryOne(`
    select
      id::text as "id",
      organization_id::text as "organizationId",
      title,
      subtitle,
      type,
      body,
      preview,
      length_tier as "lengthTier",
      plan_days as "planDays",
      scene,
      source_note as "sourceNote",
      version_note as "versionNote",
      source_content_id::text as "sourceContentId",
      source_version_no as "sourceVersionNo",
      access_level as "accessLevel",
      publish_status as "publishStatus",
      review_status as "reviewStatus",
      reviewed_at as "reviewedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from contents
    where id = ${sqlValue(id)}
      and deleted_at is null
    limit 1
  `);

  if (!content) return null;

  const segments = queryRows(`
    select text
    from content_segments
    where content_id = ${sqlValue(id)}
    order by sort_order asc
  `).map((row) => row.text);

  return enrichContentSummary({
    ...content,
    segments
  });
}

function getContentStructure(contentId, versionId) {
  const normalizedContentId = normalizeId(contentId);
  const normalizedVersionId = String(versionId || '').trim();
  if (!normalizedContentId || !normalizedVersionId) {
    throw contentStructureError('CONTENT_VERSION_NOT_FOUND', 404);
  }

  const versionAlias = CONTENT_VERSION_ALIASES[normalizedVersionId];
  if (versionAlias && versionAlias.contentId !== normalizedContentId) {
    throw contentStructureError('CONTENT_VERSION_NOT_FOUND', 404);
  }
  if (!isUuid(normalizedVersionId) && !versionAlias) {
    throw contentStructureError('CONTENT_VERSION_NOT_FOUND', 404);
  }

  const versionFilter = isUuid(normalizedVersionId)
    ? `id = ${sqlValue(normalizedVersionId)}`
    : `version_no = ${Number(versionAlias.versionNo)}`;
  const version = queryOne(`
    select
      id::text as "internalContentVersionId",
      review_status as "reviewStatus",
      source_note as "sourceNote",
      version_note as "versionNote"
    from content_versions
    where content_id = ${sqlValue(normalizedContentId)}
      and ${versionFilter}
    limit 1
  `);

  if (!version) {
    throw contentStructureError('CONTENT_VERSION_NOT_FOUND', 404);
  }
  if (version.reviewStatus !== 'approved') {
    throw contentStructureError('CONTENT_VERSION_NOT_APPROVED', 409);
  }

  const structureRows = queryRows(`
    select
      cs.id::text as "sectionId",
      cs.title as "sectionTitle",
      cs.sort_order as "sectionSortOrder",
      mu.id::text as "unitId",
      mu.text as "unitText",
      coalesce(mu.phonetic_text, '') as "unitPinyin",
      coalesce(mu.first_character_cue, '') as "unitFirstCharacterCue",
      mu.estimated_seconds as "unitEstimatedSeconds",
      mu.sort_order as "unitSortOrder"
    from content_sections cs
    left join memory_units mu on mu.section_id = cs.id
    where cs.content_version_id = ${sqlValue(version.internalContentVersionId)}
    order by cs.sort_order asc, mu.sort_order asc
  `);
  const sectionsById = new Map();
  const sections = [];
  structureRows.forEach((row) => {
    let section = sectionsById.get(row.sectionId);
    if (!section) {
      section = {
        id: row.sectionId,
        title: row.sectionTitle,
        sortOrder: row.sectionSortOrder,
        units: []
      };
      sectionsById.set(row.sectionId, section);
      sections.push(section);
    }
    if (row.unitId) {
      section.units.push({
        id: row.unitId,
        text: row.unitText,
        pinyin: row.unitPinyin,
        firstCharacterCue: row.unitFirstCharacterCue,
        estimatedSeconds: row.unitEstimatedSeconds,
        sortOrder: row.unitSortOrder
      });
    }
  });

  return {
    contentId: String(contentId),
    contentVersionId: normalizedVersionId,
    reviewStatus: version.reviewStatus,
    sourceNote: version.sourceNote || '',
    versionNote: version.versionNote || '',
    sections
  };
}

function createMemoryAssessment(payload = {}) {
  const userId = String(payload.userId || '').trim();
  const contentId = String(payload.contentId || '').trim();
  const contentVersionId = String(payload.contentVersionId || '').trim();
  const scopeType = String(payload.scopeType || 'full').trim() || 'full';
  const scopeId = payload.scopeId ? String(payload.scopeId).trim() : null;
  const idempotencyKey = Object.hasOwn(payload, 'idempotencyKey')
    ? normalizeAssessmentIdempotencyKey(payload.idempotencyKey)
    : `direct-assessment-${crypto.randomUUID()}`;

  if (!userId) throw assessmentError('ASSESSMENT_USER_REQUIRED', 400);
  if (!contentId) throw assessmentError('ASSESSMENT_CONTENT_REQUIRED', 400);
  if (!contentVersionId) throw assessmentError('ASSESSMENT_CONTENT_VERSION_REQUIRED', 400);

  const normalizedUserId = ensureUser(userId);
  const existing = getMemoryAssessmentByStartKey(normalizedUserId, idempotencyKey);
  if (existing) return toMemoryAssessment(existing);

  const structure = getContentStructure(contentId, contentVersionId);
  const units = getAssessmentScopeUnits(structure, scopeType, scopeId);
  const version = resolveAssessmentContentVersion(contentId, contentVersionId);
  const inserted = queryReturningOne(`
    insert into memory_assessments (
      user_id,
      content_id,
      content_version_id,
      scope_type,
      scope_id,
      sampled_items,
      start_idempotency_key
    ) values (
      ${sqlValue(normalizedUserId)},
      ${sqlValue(version.contentId)},
      ${sqlValue(version.id)},
      ${sqlValue(scopeType)},
      ${sqlValue(scopeId)},
      ${sqlJson(sampleAssessmentItems(units))}::jsonb,
      ${sqlValue(idempotencyKey)}
    )
    on conflict (user_id, start_idempotency_key) do nothing
    returning id::text as "id"
  `);
  const assessment = inserted
    ? getMemoryAssessmentById(inserted.id, normalizedUserId)
    : getMemoryAssessmentByStartKey(normalizedUserId, idempotencyKey);
  return toMemoryAssessment(assessment);
}

function recommendMemoryPlan(payload = {}) {
  const assessmentId = String(payload.assessmentId || '').trim();
  const userId = String(payload.userId || '').trim();
  if (!assessmentId || !userId) {
    if (Object.hasOwn(payload, 'idempotencyKey')) {
      normalizeAssessmentIdempotencyKey(payload.idempotencyKey);
    }
    const answers = Array.isArray(payload.answers) ? payload.answers.map((answer) => ({ ...answer })) : [];
    return buildAssessmentRecommendation(payload, answers, payload.unitCount);
  }

  const idempotencyKey = normalizeAssessmentIdempotencyKey(payload.idempotencyKey);

  const normalizedUserId = normalizeUserId(userId);
  const assessment = getMemoryAssessmentById(assessmentId, normalizedUserId);
  if (!assessment) throw assessmentError('ASSESSMENT_NOT_FOUND', 404);

  const existingResponse = getAssessmentCompletionResponse(normalizedUserId, idempotencyKey);
  if (existingResponse) {
    if (
      existingResponse.operationType !== 'memory_assessment_completion'
      || existingResponse.entityId !== assessmentId
    ) {
      throw assessmentError('IDEMPOTENCY_KEY_CONFLICT', 409);
    }
    return existingResponse.responsePayload;
  }
  if (assessment.completionIdempotencyKey) {
    const completedResponse = getAssessmentCompletionResponse(
      normalizedUserId,
      assessment.completionIdempotencyKey
    );
    if (completedResponse) {
      if (
        completedResponse.operationType !== 'memory_assessment_completion'
        || completedResponse.entityId !== assessmentId
      ) {
        throw assessmentError('IDEMPOTENCY_KEY_CONFLICT', 409);
      }
      return completedResponse.responsePayload;
    }
  }

  const answers = normalizeAssessmentAnswers(payload.answers, assessment.items);
  const recommendation = buildAssessmentRecommendation(payload, answers, assessment.items.length);
  const { familiarityLevel } = recommendation;
  const publicAssessment = toMemoryAssessment(assessment);
  const structure = getContentStructure(publicAssessment.contentId, publicAssessment.contentVersionId);
  const unitCount = getAssessmentScopeUnits(
    structure,
    publicAssessment.scopeType,
    publicAssessment.scopeId
  ).length;
  const completedAt = new Date().toISOString();
  const completedAssessment = {
    ...publicAssessment,
    answers,
    familiarityLevel,
    status: 'completed',
    completedAt
  };
  const response = {
    ...buildAssessmentRecommendation(payload, answers, unitCount),
    assessment: completedAssessment
  };
  const persistedJson = queryScalar(`
    with completed as (
      update memory_assessments
      set
        answers = ${sqlJson(answers)}::jsonb,
        familiarity_level = ${sqlValue(familiarityLevel)},
        status = 'completed',
        completion_idempotency_key = ${sqlValue(idempotencyKey)},
        completed_at = ${sqlValue(completedAt)}::timestamptz
      where id = ${sqlValue(assessmentId)}
        and user_id = ${sqlValue(normalizedUserId)}
        and completion_idempotency_key is null
        and not exists (
          select 1
          from idempotency_records existing_key
          where existing_key.user_id = ${sqlValue(normalizedUserId)}
            and existing_key.idempotency_key = ${sqlValue(idempotencyKey)}
        )
      returning id::text as "id"
    ), recorded as (
      insert into idempotency_records (
        user_id,
        idempotency_key,
        operation_type,
        entity_id,
        request_payload,
        response_payload
      )
      select
        ${sqlValue(normalizedUserId)},
        ${sqlValue(idempotencyKey)},
        'memory_assessment_completion',
        completed.id,
        ${sqlJson(payload)}::jsonb,
        ${sqlJson(response)}::jsonb
      from completed
      on conflict (user_id, idempotency_key) do nothing
      returning response_payload
    )
    select response_payload from recorded
    union all
    select response_payload
    from idempotency_records
    where user_id = ${sqlValue(normalizedUserId)}
      and idempotency_key = ${sqlValue(idempotencyKey)}
      and operation_type = 'memory_assessment_completion'
      and entity_id = ${sqlValue(assessmentId)}
    limit 1
  `);
  if (persistedJson) return JSON.parse(persistedJson);

  const concurrentKeyResponse = getAssessmentCompletionResponse(normalizedUserId, idempotencyKey);
  if (concurrentKeyResponse) {
    if (
      concurrentKeyResponse.operationType !== 'memory_assessment_completion'
      || concurrentKeyResponse.entityId !== assessmentId
    ) {
      throw assessmentError('IDEMPOTENCY_KEY_CONFLICT', 409);
    }
    return concurrentKeyResponse.responsePayload;
  }
  const concurrentAssessment = getMemoryAssessmentById(assessmentId, normalizedUserId);
  const concurrentResponse = concurrentAssessment?.completionIdempotencyKey
    ? getAssessmentCompletionResponse(normalizedUserId, concurrentAssessment.completionIdempotencyKey)
    : null;
  if (concurrentResponse) return concurrentResponse.responsePayload;
  throw assessmentError('ASSESSMENT_COMPLETION_FAILED', 409);
}

function normalizeAssessmentIdempotencyKey(value) {
  const idempotencyKey = String(value || '').trim();
  if (!idempotencyKey) throw assessmentError('IDEMPOTENCY_KEY_REQUIRED', 400);
  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw assessmentError('IDEMPOTENCY_KEY_INVALID', 400);
  }
  return idempotencyKey;
}

function normalizeAssessmentAnswers(rawAnswers, sampledItems) {
  const answers = Array.isArray(rawAnswers) ? rawAnswers : [];
  const items = Array.isArray(sampledItems) ? sampledItems : [];
  if (answers.length !== items.length) {
    throw assessmentError('ASSESSMENT_ANSWERS_INVALID', 400);
  }

  const expectedIds = new Set(items.map((item) => String(item.memoryUnitId)));
  const answersById = new Map();
  answers.forEach((answer) => {
    const memoryUnitId = String(answer?.memoryUnitId || '').trim();
    if (!expectedIds.has(memoryUnitId) || answersById.has(memoryUnitId)) {
      throw assessmentError('ASSESSMENT_ANSWERS_INVALID', 400);
    }
    answersById.set(memoryUnitId, { ...answer, memoryUnitId });
  });

  if (answersById.size !== expectedIds.size) {
    throw assessmentError('ASSESSMENT_ANSWERS_INVALID', 400);
  }
  return items.map((item) => answersById.get(String(item.memoryUnitId)));
}

function buildAssessmentRecommendation(payload, answers, unitCount) {
  const averageScore = calculateAssessmentAverage(answers);
  const familiarityLevel = averageScore < 0.75 ? 'new' : averageScore < 1.5 ? 'partial' : 'familiar';
  return {
    familiarityLevel,
    averageScore,
    ...recommendPlan({
      unitCount,
      familiarityLevel,
      dailyMinutes: payload.dailyMinutes,
      targetDays: payload.targetDays
    })
  };
}

function resolveAssessmentContentVersion(contentId, versionId) {
  const normalizedContentId = normalizeId(contentId);
  const normalizedVersionId = String(versionId || '').trim();
  const versionAlias = CONTENT_VERSION_ALIASES[normalizedVersionId];
  const versionFilter = isUuid(normalizedVersionId)
    ? `id = ${sqlValue(normalizedVersionId)}`
    : `version_no = ${Number(versionAlias?.versionNo || 0)}`;
  const version = queryOne(`
    select id::text as "id", content_id::text as "contentId", version_no as "versionNo"
    from content_versions
    where content_id = ${sqlValue(normalizedContentId)}
      and ${versionFilter}
    limit 1
  `);
  if (!version) throw contentStructureError('CONTENT_VERSION_NOT_FOUND', 404);
  return version;
}

function getAssessmentScopeUnits(structure, scopeType, scopeId) {
  if (scopeType === 'full') return structure.sections.flatMap((section) => section.units || []);
  if (scopeType === 'section') {
    const publicSectionMatch = String(scopeId || '').match(/^great-compassion-section-(\d+)$/);
    const section = structure.sections.find((item) => item.id === scopeId)
      || (publicSectionMatch
        ? structure.sections.find((item) => Number(item.sortOrder) === Number(publicSectionMatch[1]))
        : null);
    if (section) return section.units || [];
  }
  throw assessmentError('ASSESSMENT_SCOPE_NOT_FOUND', 404);
}

function sampleAssessmentItems(units) {
  const count = units.length;
  const indexes = count <= 8
    ? Array.from({ length: count }, (_, index) => index)
    : Array.from({ length: 8 }, (_, index) => Math.round(index * (count - 1) / 7));

  return indexes.map((unitIndex) => {
    const unit = units[unitIndex];
    return {
      memoryUnitId: unit.id,
      firstCharacterCue: unit.firstCharacterCue || Array.from(String(unit.text || ''))[0] || '',
      sortOrder: Number(unit.sortOrder),
      positionBand: assessmentPositionBand(unitIndex, count)
    };
  });
}

function assessmentPositionBand(index, count) {
  if (count <= 1 || index === 0) return 'start';
  if (index === count - 1) return 'end';
  const ratio = index / (count - 1);
  if (ratio < 1 / 3) return 'start';
  if (ratio < 2 / 3) return 'middle';
  return 'end';
}

function calculateAssessmentAverage(answers) {
  if (!answers.length) return 0;
  const scores = { cannot: 0, partial: 1, complete: 2 };
  const total = answers.reduce((sum, answer) => {
    const base = scores[answer.result] ?? 0;
    return sum + Math.max(0, base - (answer.revealed ? 1 : 0));
  }, 0);
  return total / answers.length;
}

function getMemoryAssessmentByStartKey(userId, idempotencyKey) {
  return queryOne(memoryAssessmentSelect(`
    ma.user_id = ${sqlValue(userId)}
    and ma.start_idempotency_key = ${sqlValue(idempotencyKey)}
  `));
}

function getMemoryAssessmentById(assessmentId, userId) {
  if (!isUuid(assessmentId)) return null;
  return queryOne(memoryAssessmentSelect(`
    ma.id = ${sqlValue(assessmentId)}
    and ma.user_id = ${sqlValue(userId)}
  `));
}

function memoryAssessmentSelect(whereClause) {
  return `
    select
      ma.id::text as "id",
      ma.user_id::text as "userId",
      ma.content_id::text as "contentId",
      ma.content_version_id::text as "contentVersionId",
      cv.version_no as "contentVersionNo",
      ma.scope_type as "scopeType",
      ma.scope_id as "scopeId",
      ma.sampled_items as "items",
      ma.answers,
      ma.familiarity_level as "familiarityLevel",
      ma.status,
      ma.start_idempotency_key as "startIdempotencyKey",
      ma.completion_idempotency_key as "completionIdempotencyKey",
      ma.created_at as "createdAt",
      ma.completed_at as "completedAt"
    from memory_assessments ma
    join content_versions cv on cv.id = ma.content_version_id
    where ${whereClause}
    limit 1
  `;
}

function getAssessmentCompletionResponse(userId, idempotencyKey) {
  return queryOne(`
    select
      operation_type as "operationType",
      entity_id as "entityId",
      response_payload as "responsePayload"
    from idempotency_records
    where user_id = ${sqlValue(userId)}
      and idempotency_key = ${sqlValue(idempotencyKey)}
    limit 1
  `);
}

function toMemoryAssessment(assessment) {
  return {
    id: assessment.id,
    userId: assessment.userId === IDS.demoUser ? 'demo-user' : assessment.userId,
    contentId: publicContentId(assessment.contentId),
    contentVersionId: publicContentVersionId(assessment),
    scopeType: assessment.scopeType,
    scopeId: assessment.scopeId,
    items: assessment.items || [],
    answers: assessment.answers || null,
    familiarityLevel: assessment.familiarityLevel || null,
    status: assessment.status,
    createdAt: new Date(assessment.createdAt).toISOString(),
    completedAt: assessment.completedAt ? new Date(assessment.completedAt).toISOString() : null
  };
}

function publicContentId(contentId) {
  const match = Object.entries(IDS.contents).find(([, internalId]) => internalId === contentId);
  return match?.[0] || contentId;
}

function publicContentVersionId(assessment) {
  const match = Object.entries(CONTENT_VERSION_ALIASES).find(([, alias]) => (
    alias.contentId === assessment.contentId
    && Number(alias.versionNo) === Number(assessment.contentVersionNo)
  ));
  return match?.[0] || assessment.contentVersionId;
}

function normalizeFestivalContentIds(value) {
  const ids = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

  return Array.from(new Set(
    ids
      .map((item) => normalizeId(item))
      .filter(Boolean)
      .filter((contentId) => Boolean(getContent(contentId)))
  ));
}

function hydrateFestivalRows(rows) {
  return rows.map((festival) => {
    const relations = queryRows(`
      select
        c.id::text as "id",
        c.title,
        c.subtitle,
        c.type,
        c.preview,
        c.length_tier as "lengthTier",
        c.plan_days as "planDays",
        c.scene,
        c.access_level as "accessLevel"
      from festival_contents fc
      join contents c on c.id = fc.content_id
      where fc.festival_id = ${sqlValue(festival.id)}
      order by fc.sort_order asc
    `).map(enrichContentSummary);

    return {
      ...festival,
      recommendedContentIds: relations.map((item) => item.id),
      recommendedContents: relations
    };
  });
}

function syncFestivalContents(festivalId, recommendedContentIds) {
  queryScalar(`delete from festival_contents where festival_id = ${sqlValue(festivalId)}`);
  normalizeFestivalContentIds(recommendedContentIds).forEach((contentId, index) => {
    queryScalar(`
      insert into festival_contents (festival_id, content_id, relation_type, sort_order)
      values (
        ${sqlValue(festivalId)},
        ${sqlValue(contentId)},
        'recommended_content',
        ${index + 1}
      )
      returning id::text
    `);
  });
}

function queryFestivalRows({ includeUnpublished = false } = {}) {
  return queryRows(`
    select
      id::text as "id",
      name,
      lunar_date as "lunarDate",
      solar_date as "solarDate",
      related_figure as "relatedFigure",
      description,
      publish_status as "publishStatus",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from festivals
    where deleted_at is null
      ${includeUnpublished ? '' : "and publish_status = 'published'"}
    order by updated_at desc, created_at asc
  `);
}

function listFestivals() {
  return hydrateFestivalRows(queryFestivalRows({ includeUnpublished: false }));
}

function listAdminFestivals() {
  return hydrateFestivalRows(queryFestivalRows({ includeUnpublished: true }));
}

function createFestival(payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) {
    const error = new Error('Festival name is required');
    error.statusCode = 400;
    throw error;
  }

  const publishStatus = payload.publishStatus || 'draft';
  const festival = queryReturningOne(`
    insert into festivals (
      name,
      lunar_date,
      solar_date,
      related_figure,
      description,
      publish_status
    ) values (
      ${sqlValue(name)},
      ${sqlValue(String(payload.lunarDate || '').trim())},
      ${sqlValue(String(payload.solarDate || '').trim() || null)},
      ${sqlValue(String(payload.relatedFigure || '').trim())},
      ${sqlValue(String(payload.description || '').trim())},
      ${sqlValue(publishStatus)}
    )
    returning
      id::text as "id",
      name,
      lunar_date as "lunarDate",
      solar_date as "solarDate",
      related_figure as "relatedFigure",
      description,
      publish_status as "publishStatus",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);

  syncFestivalContents(festival.id, payload.recommendedContentIds);
  appendAuditLog({
    action: 'festival.created',
    organizationId: IDS.organization,
    targetType: 'festival',
    targetId: festival.id,
    detail: {
      name: festival.name,
      publishStatus: festival.publishStatus,
      recommendedContentIds: normalizeFestivalContentIds(payload.recommendedContentIds)
    }
  });
  return listAdminFestivals().find((item) => item.id === festival.id) || festival;
}

function updateFestival(festivalId, payload = {}) {
  const id = normalizeId(festivalId);
  const existing = listAdminFestivals().find((item) => item.id === id);
  if (!existing) {
    const error = new Error('Festival not found');
    error.statusCode = 404;
    throw error;
  }

  const name = String(payload.name !== undefined ? payload.name : existing.name).trim();
  if (!name) {
    const error = new Error('Festival name is required');
    error.statusCode = 400;
    throw error;
  }

  queryReturningOne(`
    update festivals
    set
      name = ${sqlValue(name)},
      lunar_date = ${sqlValue(payload.lunarDate !== undefined ? String(payload.lunarDate || '').trim() : existing.lunarDate || '')},
      solar_date = ${sqlValue(payload.solarDate !== undefined ? String(payload.solarDate || '').trim() || null : existing.solarDate || null)},
      related_figure = ${sqlValue(payload.relatedFigure !== undefined ? String(payload.relatedFigure || '').trim() : existing.relatedFigure || '')},
      description = ${sqlValue(payload.description !== undefined ? String(payload.description || '').trim() : existing.description || '')},
      publish_status = ${sqlValue(payload.publishStatus || existing.publishStatus || 'draft')},
      updated_at = now()
    where id = ${sqlValue(id)}
      and deleted_at is null
    returning id::text as "id"
  `);

  if (payload.recommendedContentIds !== undefined) {
    syncFestivalContents(id, payload.recommendedContentIds);
  }

  const current = listAdminFestivals().find((item) => item.id === id);
  appendAuditLog({
    action: 'festival.updated',
    organizationId: IDS.organization,
    targetType: 'festival',
    targetId: id,
    detail: {
      beforeName: existing.name,
      afterName: current?.name || name,
      beforePublishStatus: existing.publishStatus,
      afterPublishStatus: current?.publishStatus || payload.publishStatus || existing.publishStatus,
      recommendedContentIds: current?.recommendedContentIds || existing.recommendedContentIds
    }
  });
  return current || existing;
}

function archiveFestival(festivalId) {
  const id = normalizeId(festivalId);
  const existing = listAdminFestivals().find((item) => item.id === id);
  if (!existing) {
    const error = new Error('Festival not found');
    error.statusCode = 404;
    throw error;
  }

  queryReturningOne(`
    update festivals
    set
      publish_status = 'archived',
      updated_at = now()
    where id = ${sqlValue(id)}
      and deleted_at is null
    returning id::text as "id"
  `);

  appendAuditLog({
    action: 'festival.archived',
    organizationId: IDS.organization,
    targetType: 'festival',
    targetId: id,
    detail: {
      name: existing.name
    }
  });
  return listAdminFestivals().find((item) => item.id === id) || {
    ...existing,
    publishStatus: 'archived'
  };
}

function listPlans(userId = IDS.demoUser) {
  const normalizedUserId = normalizeUserId(userId);
  const plans = queryRows(`
    select
      id::text as "id",
      user_id::text as "userId",
      content_id::text as "contentId",
      mode,
      title,
      start_date as "startDate",
      total_days as "totalDays",
      current_day as "currentDay",
      state,
      mastery_score as "masteryScore",
      streak_hits as "streakHits",
      last_reviewed_at as "lastReviewedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from memory_plans
    where user_id = ${sqlValue(normalizedUserId)}
      and deleted_at is null
    order by created_at desc
  `);

  return plans.map((plan) => ({
    ...plan,
    tasks: getTasksForPlan(plan.id)
  }));
}

function createPlan({ userId = IDS.demoUser, contentId, startDate = todayDate(), mode = 'scientific' }) {
  const normalizedUserId = ensureUser(userId);
  const normalizedContentId = normalizeId(contentId);
  const content = normalizedContentId ? getContent(normalizedContentId) : null;
  const requestedMode = normalizeMode(mode);

  if (!content) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = queryOne(`
    select
      id::text as "id",
      user_id::text as "userId",
      content_id::text as "contentId",
      mode,
      title,
      start_date as "startDate",
      total_days as "totalDays",
      current_day as "currentDay",
      state,
      mastery_score as "masteryScore",
      streak_hits as "streakHits",
      last_reviewed_at as "lastReviewedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from memory_plans
    where user_id = ${sqlValue(normalizedUserId)}
      and content_id = ${sqlValue(normalizedContentId)}
      and mode = ${sqlValue(requestedMode)}
      and state in ('reviewing', 'at_risk')
      and deleted_at is null
    order by created_at desc
    limit 1
  `);

  if (existing) {
    scheduleNextPlanReminderJobs(normalizedUserId, {
      ...existing,
      tasks: getTasksForPlan(existing.id)
    }, content);
    return {
      isNew: false,
      plan: {
        ...existing,
        tasks: getTasksForPlan(existing.id)
      }
    };
  }

  const plan = queryReturningOne(`
    insert into memory_plans (
      user_id,
      content_id,
      mode,
      title,
      start_date,
      total_days,
      current_day,
      state,
      mastery_score,
      streak_hits
    ) values (
      ${sqlValue(normalizedUserId)},
      ${sqlValue(normalizedContentId)},
      ${sqlValue(requestedMode)},
      ${sqlValue(content.title)},
      ${sqlValue(startDate)},
      ${Number(content.planDays || 1)},
      1,
      'reviewing',
      0,
      0
    )
    returning
      id::text as "id",
      user_id::text as "userId",
      content_id::text as "contentId",
      mode,
      title,
      start_date as "startDate",
      total_days as "totalDays",
      current_day as "currentDay",
      state,
      mastery_score as "masteryScore",
      streak_hits as "streakHits",
      last_reviewed_at as "lastReviewedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);

  const taskCount = Math.max(Number(content.planDays || 1), 1);
  const offsets = buildReviewOffsets(taskCount);
  for (let index = 0; index < taskCount; index += 1) {
    queryScalar(`
      insert into review_tasks (
        plan_id,
        user_id,
        due_date,
        method,
        day_index,
        status
      ) values (
        ${sqlValue(plan.id)},
        ${sqlValue(normalizedUserId)},
        ${sqlValue(addDays(startDate, offsets[index] || 0))},
        ${sqlValue(REVIEW_METHODS[index] || REVIEW_METHODS[REVIEW_METHODS.length - 1])},
        ${index + 1},
        'pending'
      )
      returning id::text
    `);
  }

  const planWithTasks = {
    ...plan,
    tasks: getTasksForPlan(plan.id)
  };
  scheduleNextPlanReminderJobs(normalizedUserId, planWithTasks, content);

  return {
    isNew: true,
    plan: planWithTasks
  };
}

function completeTask({ taskId, userId = '', result = 'stronger', selfRating = '', latencyBand = '', mistakeCount = 0, note = '' }) {
  const normalizedTaskId = normalizeId(taskId);
  const task = normalizedTaskId ? getTask(normalizedTaskId) : null;

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

  const plan = getPlan(task.planId);
  if (!plan) {
    const error = new Error('Memory plan not found');
    error.statusCode = 404;
    throw error;
  }

  const masteryDelta = result === 'mastered' ? 40 : result === 'stronger' ? 24 : -8;
  const doneCount = Number(queryScalar(`
    select count(*)
    from review_tasks
    where plan_id = ${sqlValue(plan.id)}
      and status = 'completed'
  `)) + (task.status === 'completed' ? 0 : 1);
  const total = Number(plan.totalDays || 1);
  const mastered = doneCount >= total;
  const rawNextMasteryScore = Math.max(0, Math.min(100, Number(plan.masteryScore || 0) + masteryDelta));
  const nextMasteryScore = mastered ? 100 : Math.min(95, rawNextMasteryScore);
  const state = result === 'needs_work'
    ? 'at_risk'
    : (mastered ? 'mastered' : 'reviewing');
  const masteryScore = nextMasteryScore;
  const streakHits = result === 'needs_work'
    ? Number(plan.streakHits || 0)
    : Number(plan.streakHits || 0) + 1;

  const updatedTask = queryReturningOne(`
    update review_tasks
    set
      status = 'completed',
      result = ${sqlValue(result)},
      completed_at = now(),
      updated_at = now()
    where id = ${sqlValue(normalizedTaskId)}
    returning
      id::text as "id",
      plan_id::text as "planId",
      user_id::text as "userId",
      due_date as "dueDate",
      method,
      day_index as "dayIndex",
      status,
      result,
      completed_at as "completedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);

  const updatedPlan = queryReturningOne(`
    update memory_plans
    set
      current_day = ${Math.min(doneCount + 1, total)},
      state = ${sqlValue(state)},
      mastery_score = ${masteryScore},
      streak_hits = ${streakHits},
      last_reviewed_at = now(),
      updated_at = now()
    where id = ${sqlValue(plan.id)}
    returning
      id::text as "id",
      user_id::text as "userId",
      content_id::text as "contentId",
      mode,
      title,
      start_date as "startDate",
      total_days as "totalDays",
      current_day as "currentDay",
      state,
      mastery_score as "masteryScore",
      streak_hits as "streakHits",
      last_reviewed_at as "lastReviewedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);

  queryScalar(`
    insert into review_records (
      user_id,
      plan_id,
      task_id,
      result,
      mastery_delta
    ) values (
      ${sqlValue(updatedTask.userId)},
      ${sqlValue(updatedPlan.id)},
      ${sqlValue(updatedTask.id)},
      ${sqlValue(result)},
      ${masteryDelta}
    )
    returning id::text
  `);

  queryScalar(`
    insert into practice_sessions (
      user_id,
      plan_id,
      task_id,
      content_id,
      mode,
      self_rating,
      result_level,
      latency_band,
      mistake_count,
      growth_stage,
      note
    ) values (
      ${sqlValue(updatedTask.userId)},
      ${sqlValue(updatedPlan.id)},
      ${sqlValue(updatedTask.id)},
      ${sqlValue(updatedPlan.contentId)},
      ${sqlValue(updatedPlan.mode || 'scientific')},
      ${sqlValue(selfRating || null)},
      ${sqlValue(result)},
      ${sqlValue(latencyBand || null)},
      ${Math.max(0, Number(mistakeCount || 0))},
      ${sqlValue(normalizeGrowthStage(masteryScore))},
      ${sqlValue(note || null)}
    )
    returning id::text
  `);

  const planWithTasks = {
    ...updatedPlan,
    tasks: getTasksForPlan(updatedPlan.id)
  };
  scheduleNextPlanReminderJobs(updatedTask.userId, planWithTasks, getContent(updatedPlan.contentId));

  return {
    task: updatedTask,
    plan: planWithTasks
  };
}

function listOrganizations() {
  return queryRows(`
    select
      id::text as "id",
      name,
      type,
      status
    from organizations
    where status = 'active'
      and deleted_at is null
    order by created_at asc
  `);
}

function listOrganizationAssets(organizationId, filters = {}) {
  const normalizedOrganizationId = normalizeId(organizationId);
  const organization = normalizedOrganizationId ? getOrganization(normalizedOrganizationId) : null;
  if (!organization) {
    const error = new Error('Organization not found');
    error.statusCode = 404;
    throw error;
  }

  const where = [
    `organization_id = ${sqlValue(normalizedOrganizationId)}`,
    "publish_status = 'published'",
    'deleted_at is null'
  ];

  if (filters.accessLevel) {
    where.push(`access_level = ${sqlValue(filters.accessLevel)}`);
  }

  return queryRows(`
    select
      id::text as "id",
      organization_id::text as "organizationId",
      title,
      type,
      case when access_level = 'public' then url else null end as "url",
      thumbnail_url as "thumbnailUrl",
      access_level as "accessLevel",
      publish_status as "publishStatus",
      copyright_status as "copyrightStatus"
    from assets
    where ${where.join(' and ')}
    order by created_at asc
  `);
}

function createAsset(payload = {}) {
  const title = String(payload.title || '').trim();
  const url = String(payload.url || '').trim();
  if (!title || !url) {
    const error = new Error('Asset title and url are required');
    error.statusCode = 400;
    throw error;
  }

  const asset = queryReturningOne(`
    insert into assets (
      organization_id,
      title,
      type,
      url,
      thumbnail_url,
      access_level,
      publish_status,
      copyright_status,
      created_by
    ) values (
      ${sqlValue(IDS.organization)},
      ${sqlValue(title)},
      ${sqlValue(payload.type || 'document')},
      ${sqlValue(url)},
      ${sqlValue(payload.thumbnailUrl || null)},
      ${sqlValue(payload.accessLevel || 'private')},
      ${sqlValue(payload.publishStatus || 'published')},
      ${sqlValue(payload.copyrightStatus || 'organization_owned')},
      ${sqlValue(IDS.adminUser)}
    )
    returning
      id::text as "id",
      organization_id::text as "organizationId",
      title,
      type,
      case when access_level = 'public' then url else null end as "url",
      thumbnail_url as "thumbnailUrl",
      access_level as "accessLevel",
      publish_status as "publishStatus",
      copyright_status as "copyrightStatus"
  `);

  appendAuditLog({
    action: 'asset.created',
    organizationId: asset.organizationId,
    targetType: 'asset',
    targetId: asset.id,
    detail: {
      title: asset.title,
      type: asset.type,
      accessLevel: asset.accessLevel
    }
  });

  return asset;
}

function updateAsset(assetId, payload = {}) {
  const normalizedAssetId = normalizeId(assetId);
  const existing = normalizedAssetId ? getAsset(normalizedAssetId) : null;
  if (!existing) {
    const error = new Error('Asset not found');
    error.statusCode = 404;
    throw error;
  }

  const title = String(payload.title || existing.title || '').trim();
  const rawUrl = payload.url !== undefined ? payload.url : existing.url;
  const url = String(rawUrl || '').trim();
  if (!title || !url) {
    const error = new Error('Asset title and url are required');
    error.statusCode = 400;
    throw error;
  }

  const updated = queryReturningOne(`
    update assets
    set
      title = ${sqlValue(title)},
      type = ${sqlValue(payload.type || existing.type || 'document')},
      url = ${sqlValue(url)},
      thumbnail_url = ${sqlValue(payload.thumbnailUrl !== undefined ? payload.thumbnailUrl : existing.thumbnailUrl)},
      access_level = ${sqlValue(payload.accessLevel || existing.accessLevel || 'private')},
      copyright_status = ${sqlValue(payload.copyrightStatus || existing.copyrightStatus || 'organization_owned')},
      updated_at = now()
    where id = ${sqlValue(normalizedAssetId)}
      and deleted_at is null
    returning
      id::text as "id",
      organization_id::text as "organizationId",
      title,
      type,
      case when access_level = 'public' then url else null end as "url",
      thumbnail_url as "thumbnailUrl",
      access_level as "accessLevel",
      publish_status as "publishStatus",
      copyright_status as "copyrightStatus"
  `);

  appendAuditLog({
    action: 'asset.updated',
    organizationId: existing.organizationId,
    targetType: 'asset',
    targetId: existing.id,
    detail: {
      beforeTitle: existing.title,
      afterTitle: updated.title,
      type: updated.type,
      accessLevel: updated.accessLevel
    }
  });

  return updated;
}

function archiveAsset(assetId) {
  const normalizedAssetId = normalizeId(assetId);
  const existing = normalizedAssetId ? getAsset(normalizedAssetId) : null;
  if (!existing) {
    const error = new Error('Asset not found');
    error.statusCode = 404;
    throw error;
  }

  const archived = queryReturningOne(`
    update assets
    set
      publish_status = 'archived',
      deleted_at = now(),
      updated_at = now()
    where id = ${sqlValue(normalizedAssetId)}
      and deleted_at is null
    returning
      id::text as "id",
      title,
      publish_status as "publishStatus",
      deleted_at as "deletedAt"
  `);

  appendAuditLog({
    action: 'asset.archived',
    organizationId: existing.organizationId,
    targetType: 'asset',
    targetId: existing.id,
    detail: {
      title: existing.title,
      type: existing.type
    }
  });

  return archived;
}

function addOrganizationMember({ organizationId, userId = IDS.demoUser, role = 'readonly_member' }) {
  const normalizedOrganizationId = normalizeId(organizationId);
  const normalizedUserId = ensureUser(userId);
  const organization = normalizedOrganizationId ? getOrganization(normalizedOrganizationId) : null;
  if (!organization) {
    const error = new Error('Organization not found');
    error.statusCode = 404;
    throw error;
  }

  const existing = queryOne(`
    select
      id::text as "id",
      organization_id::text as "organizationId",
      user_id::text as "userId",
      role,
      status,
      joined_at as "joinedAt"
    from organization_members
    where organization_id = ${sqlValue(normalizedOrganizationId)}
      and user_id = ${sqlValue(normalizedUserId)}
      and status = 'active'
      and deleted_at is null
    limit 1
  `);

  if (existing) return existing;

  const member = queryReturningOne(`
    insert into organization_members (
      organization_id,
      user_id,
      role,
      status
    ) values (
      ${sqlValue(normalizedOrganizationId)},
      ${sqlValue(normalizedUserId)},
      ${sqlValue(role)},
      'active'
    )
    returning
      id::text as "id",
      organization_id::text as "organizationId",
      user_id::text as "userId",
      role,
      status,
      joined_at as "joinedAt"
  `);

  appendAuditLog({
    action: 'organization.member_added',
    organizationId: normalizedOrganizationId,
    targetType: 'organization_member',
    targetId: member.id,
    detail: {
      userId: normalizedUserId,
      role
    }
  });

  return member;
}

function updateAssetAccess({ assetId, accessLevel }) {
  const normalizedAssetId = normalizeId(assetId);
  const allowed = ['public', 'registered', 'member', 'restricted', 'private'];
  if (!allowed.includes(accessLevel)) {
    const error = new Error('Invalid access level');
    error.statusCode = 400;
    throw error;
  }

  const asset = normalizedAssetId ? getAsset(normalizedAssetId) : null;
  if (!asset) {
    const error = new Error('Asset not found');
    error.statusCode = 404;
    throw error;
  }

  const updated = queryReturningOne(`
    update assets
    set access_level = ${sqlValue(accessLevel)}, updated_at = now()
    where id = ${sqlValue(normalizedAssetId)}
    returning
      id::text as "id",
      organization_id::text as "organizationId",
      title,
      type,
      case when access_level = 'public' then url else null end as "url",
      thumbnail_url as "thumbnailUrl",
      access_level as "accessLevel",
      publish_status as "publishStatus",
      copyright_status as "copyrightStatus"
  `);

  appendAuditLog({
    action: 'asset.access_updated',
    organizationId: asset.organizationId,
    targetType: 'asset',
    targetId: asset.id,
    detail: {
      before: asset.accessLevel,
      after: accessLevel
    }
  });

  return updated;
}

function listAuditLogs(filters = {}) {
  const where = ['true'];
  const organizationId = normalizeId(filters.organizationId);
  if (organizationId) where.push(`organization_id = ${sqlValue(organizationId)}`);
  const startAt = normalizeDateTimeFilter(filters.startAt);
  const endAt = normalizeDateTimeFilter(filters.endAt);
  if (startAt) where.push(`created_at >= ${sqlValue(startAt)}`);
  if (endAt) where.push(`created_at <= ${sqlValue(endAt)}`);

  return queryRows(`
    select
      id::text as "id",
      actor_type as "actorType",
      actor_id::text as "actorId",
      organization_id::text as "organizationId",
      action,
      target_type as "targetType",
      target_id::text as "targetId",
      detail,
      created_at as "createdAt"
    from audit_logs
    where ${where.join(' and ')}
    order by created_at desc
    limit ${Number(filters.limit || 50)}
  `);
}

function buildRecentDailyTrend(rows, dateField, { startAt, endAt, maxDays = 7 } = {}) {
  const normalizedEndAt = normalizeDateTimeFilter(endAt) || new Date().toISOString();
  const normalizedStartAt = normalizeDateTimeFilter(startAt) || normalizedEndAt;
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
  const startAt = normalizeDateTimeFilter(filters.startAt);
  const endAt = normalizeDateTimeFilter(filters.endAt);
  const selectedOrganizationId = normalizeId(filters.organizationId);
  const selectedMode = filters.mode ? normalizeMode(filters.mode) : '';
  const filteredContents = listContents({
    organizationId: selectedOrganizationId,
    type: filters.type,
    mode: selectedMode
  });
  const contentIds = new Set(filteredContents.map((item) => item.id));
  const inDateRange = (value) => matchesDateRange(value, { startAt, endAt });

  const planRows = queryRows(`
    select
      mp.id::text as "id",
      mp.content_id::text as "contentId",
      mp.title,
      mp.mode,
      mp.state,
      mp.mastery_score as "masteryScore",
      mp.created_at as "createdAt"
    from memory_plans mp
    where mp.deleted_at is null
    order by mp.created_at desc
  `).filter((item) => (
    contentIds.has(item.contentId) &&
    (!selectedMode || item.mode === selectedMode) &&
    inDateRange(item.createdAt)
  ));

  const completedTaskRows = queryRows(`
    select
      rt.id::text as "id",
      rt.plan_id::text as "planId",
      rt.completed_at as "completedAt",
      mp.content_id::text as "contentId",
      mp.mode
    from review_tasks rt
    join memory_plans mp on mp.id = rt.plan_id
    where rt.status = 'completed'
      and mp.deleted_at is null
  `).filter((item) => (
    contentIds.has(item.contentId) &&
    (!selectedMode || item.mode === selectedMode) &&
    inDateRange(item.completedAt)
  ));

  const practiceRows = queryRows(`
    select
      ps.id::text as "id",
      ps.content_id::text as "contentId",
      ps.mode,
      ps.created_at as "createdAt"
    from practice_sessions ps
  `).filter((item) => (
    contentIds.has(item.contentId) &&
    (!selectedMode || item.mode === selectedMode) &&
    inDateRange(item.createdAt)
  ));

  const recitationRows = queryRows(`
    select
      rs.id::text as "id",
      rs.content_id::text as "contentId",
      rs.period,
      rs.round_count as "roundCount",
      rs.created_at as "createdAt",
      rs.completed,
      c.title
    from recitation_sessions rs
    join contents c on c.id = rs.content_id
  `).filter((item) => (
    item.completed &&
    contentIds.has(item.contentId) &&
    inDateRange(item.createdAt)
  ));

  const assetRows = queryRows(`
    select
      id::text as "id",
      organization_id::text as "organizationId"
    from assets
    where deleted_at is null
  `).filter((item) => !selectedOrganizationId || item.organizationId === selectedOrganizationId);

  const auditRows = listAuditLogs({
    organizationId: selectedOrganizationId,
    startAt,
    endAt,
    limit: 999
  });

  const organizationMembers = selectedOrganizationId
    ? queryRows(`
      select distinct user_id::text as "userId"
      from organization_members
      where organization_id = ${sqlValue(selectedOrganizationId)}
        and status = 'active'
    `)
    : [];

  const totalUsers = selectedOrganizationId
    ? organizationMembers.length
    : Number(queryScalar(`select count(*)::int from users where deleted_at is null`) || 0);

  const totalOrganizations = selectedOrganizationId
    ? 1
    : Number(queryScalar(`select count(*)::int from organizations where deleted_at is null`) || 0);
  const recentDispatches = listNotificationJobs({
    includeAllUsers: true,
    organizationId: selectedOrganizationId,
    type: filters.type,
    mode: selectedMode,
    status: 'sent',
    startAt,
    endAt,
    limit: 6
  });

  return {
    userCount: totalUsers,
    contentCount: filteredContents.length,
    planCount: planRows.length,
    completedTaskCount: completedTaskRows.length,
    practiceSessionCount: practiceRows.length,
    recitationSessionCount: recitationRows.length,
    assetCount: assetRows.length,
    organizationCount: totalOrganizations,
    auditLogCount: auditRows.length,
    modeDistribution: buildModeDistribution(planRows),
    practiceTrend: buildRecentDailyTrend(practiceRows, 'createdAt', { startAt, endAt }),
    recitationTrend: buildRecentDailyTrend(recitationRows, 'createdAt', { startAt, endAt }),
    recentDispatches,
    recentPlans: planRows.slice(0, 6),
    recentRecitations: recitationRows.slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      period: item.period,
      roundCount: item.roundCount,
      createdAt: item.createdAt
    })),
    recentAuditLogs: auditRows.slice(0, 6)
  };
}

function normalizeDateTimeFilter(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
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

function findAdminByCredentials({ username, password }) {
  const normalizedUsername = String(username || '').trim();
  const normalizedPassword = String(password || '');
  if (!normalizedUsername || !normalizedPassword) return null;

  const admin = queryOne(`
    select
      id::text as "id",
      username,
      name,
      role,
      status,
      password_hash as "passwordHash"
    from admin_users
    where lower(username) = lower(${sqlValue(normalizedUsername)})
      and status = 'active'
      and deleted_at is null
    limit 1
  `);

  if (!admin) return null;
  if (admin.passwordHash !== hashAdminPassword(normalizedPassword)) return null;

  queryScalar(`
    update admin_users
    set last_login_at = now(), updated_at = now()
    where id = ${sqlValue(admin.id)}
    returning id::text
  `);

  return {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role,
    status: admin.status
  };
}

function getAdminById(adminId) {
  const normalizedAdminId = normalizeId(adminId);
  if (!normalizedAdminId) return null;
  return queryOne(`
    select
      id::text as "id",
      username,
      name,
      role,
      status
    from admin_users
    where id = ${sqlValue(normalizedAdminId)}
      and status = 'active'
      and deleted_at is null
    limit 1
  `);
}

function loginByWechatCode(payload = {}) {
  const code = String(payload.code || '').trim() || `mock-${Date.now()}`;
  const userInfo = payload.userInfo || {};
  const openid = String(payload.wechatOpenid || `mock_${hashValue(code).slice(0, 24)}`).trim();
  const unionid = String(payload.unionid || '').trim() || null;
  const incomingNickname = String(userInfo.nickName || payload.nickname || '').trim();
  const nickname = incomingNickname || '微信用户';
  const avatarUrl = String(userInfo.avatarUrl || payload.avatarUrl || '').trim() || null;
  const platform = String(payload.platform || 'wechat').trim() || 'wechat';

  const existing = queryOne(`
    select
      id::text as "id",
      nickname,
      avatar_url as "avatarUrl",
      platform,
      status
    from users
    where wechat_openid = ${sqlValue(openid)}
      and deleted_at is null
    limit 1
  `);

  if (existing) {
    const nextNickname = isMeaningfulNickname(incomingNickname)
      ? incomingNickname
      : existing.nickname || '微信用户';
    const nextAvatarUrl = avatarUrl || existing.avatarUrl || null;
    queryScalar(`
      update users
      set
        nickname = ${sqlValue(nextNickname)},
        avatar_url = ${sqlValue(nextAvatarUrl)},
        unionid = coalesce(${sqlValue(unionid)}, unionid),
        platform = ${sqlValue(platform)},
        last_login_at = now(),
        updated_at = now()
      where id = ${sqlValue(existing.id)}
      returning id::text
    `);
    return {
      ...existing,
      nickname: nextNickname,
      avatarUrl: nextAvatarUrl || ''
    };
  }

  return queryReturningOne(`
    insert into users (
      nickname,
      avatar_url,
      wechat_openid,
      unionid,
      platform,
      status,
      last_login_at
    ) values (
      ${sqlValue(nickname)},
      ${sqlValue(avatarUrl)},
      ${sqlValue(openid)},
      ${sqlValue(unionid)},
      ${sqlValue(platform)},
      'active',
      now()
    )
    returning
      id::text as "id",
      nickname,
      avatar_url as "avatarUrl",
      platform,
      status
  `);
}

function getUserById(userId) {
  const normalizedUserId = normalizeId(userId) || normalizeUserId(userId);
  if (!normalizedUserId) return null;
  return queryOne(`
    select
      id::text as "id",
      nickname,
      avatar_url as "avatarUrl",
      platform,
      status,
      phone
    from users
    where id = ${sqlValue(normalizedUserId)}
      and deleted_at is null
    limit 1
  `);
}

function updateUserProfile(userId, payload = {}) {
  const normalizedUserId = normalizeId(userId) || normalizeUserId(userId);
  if (!normalizedUserId) {
    const error = new Error('User id is required');
    error.statusCode = 400;
    throw error;
  }

  const nickname = String(payload.nickname || payload.nickName || '').trim();
  const avatarUrl = String(payload.avatarUrl || '').trim();
  const phone = String(payload.phone || '').trim();

  const user = queryReturningOne(`
    update users
    set
      nickname = coalesce(${sqlValue(nickname || null)}, nickname),
      avatar_url = coalesce(${sqlValue(avatarUrl || null)}, avatar_url),
      phone = coalesce(${sqlValue(phone || null)}, phone),
      updated_at = now()
    where id = ${sqlValue(normalizedUserId)}
      and deleted_at is null
    returning
      id::text as "id",
      nickname,
      avatar_url as "avatarUrl",
      platform,
      status,
      phone
  `);

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  return user;
}

function getNotificationSettings(userId = IDS.demoUser) {
  const normalizedUserId = ensureUser(userId);
  const rows = queryRows(`
    select
      id::text as "id",
      user_id::text as "userId",
      channel,
      enabled,
      quiet_hours as "quietHours",
      updated_at as "updatedAt"
    from notification_settings
    where user_id = ${sqlValue(normalizedUserId)}
    order by channel asc
  `);

  const defaults = [
    { channel: 'wechat_subscribe', enabled: true, quietHours: { start: '22:00', end: '07:00' } },
    { channel: 'app_push', enabled: true, quietHours: { start: '22:00', end: '07:00' } },
    { channel: 'sms', enabled: false, quietHours: { start: '22:00', end: '07:00' } }
  ];

  return defaults.map((item) => {
    const existing = rows.find((row) => row.channel === item.channel);
    return existing || {
      id: `${normalizedUserId}-${item.channel}`,
      userId: normalizedUserId,
      channel: item.channel,
      enabled: item.enabled,
      quietHours: item.quietHours
    };
  });
}

function upsertNotificationSetting({ userId = IDS.demoUser, channel, enabled, quietHours }) {
  const normalizedUserId = ensureUser(userId);
  const normalizedChannel = String(channel || '').trim();
  if (!normalizedChannel) {
    const error = new Error('Notification channel is required');
    error.statusCode = 400;
    throw error;
  }

  return queryReturningOne(`
    insert into notification_settings (
      user_id,
      channel,
      enabled,
      quiet_hours
    ) values (
      ${sqlValue(normalizedUserId)},
      ${sqlValue(normalizedChannel)},
      ${enabled ? 'true' : 'false'},
      ${sqlJson(quietHours || null)}::jsonb
    )
    on conflict (user_id, channel) do update set
      enabled = excluded.enabled,
      quiet_hours = excluded.quiet_hours,
      updated_at = now()
    returning
      id::text as "id",
      user_id::text as "userId",
      channel,
      enabled,
      quiet_hours as "quietHours",
      updated_at as "updatedAt"
  `);
}

function createNotificationJob({ userId = IDS.demoUser, taskId = null, channel, scheduledAt, payload }) {
  const normalizedUserId = ensureUser(userId);
  const normalizedChannel = String(channel || '').trim();
  const normalizedScheduledAt = String(scheduledAt || '').trim();
  if (!normalizedChannel || !normalizedScheduledAt) {
    const error = new Error('Notification channel and scheduledAt are required');
    error.statusCode = 400;
    throw error;
  }

  return queryReturningOne(`
    insert into notification_jobs (
      user_id,
      task_id,
      channel,
      scheduled_at,
      status,
      payload
    ) values (
      ${sqlValue(normalizedUserId)},
      ${sqlValue(normalizeId(taskId))},
      ${sqlValue(normalizedChannel)},
      ${sqlValue(normalizedScheduledAt)},
      'pending',
      ${sqlJson(payload || {})}::jsonb
    )
    returning
      id::text as "id",
      user_id::text as "userId",
      task_id::text as "taskId",
      channel,
      scheduled_at as "scheduledAt",
      status,
      payload,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
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
  const normalizedUserId = ensureUser(userId);
  const normalizedTaskId = normalizeId(taskId);
  const existingWhere = normalizedTaskId
    ? [
      `user_id = ${sqlValue(normalizedUserId)}`,
      `channel = ${sqlValue(channel)}`,
      "status = 'pending'",
      `task_id = ${sqlValue(normalizedTaskId)}`
    ]
    : [
      `user_id = ${sqlValue(normalizedUserId)}`,
      `channel = ${sqlValue(channel)}`,
      "status = 'pending'",
      'task_id is null',
      `payload ->> 'type' = ${sqlValue(payload.type || '')}`,
      `payload ->> 'contentId' = ${sqlValue(payload.contentId || '')}`,
      `coalesce(payload ->> 'goalId', '') = ${sqlValue(payload.goalId || '')}`,
      `scheduled_at::date = (${sqlValue(scheduledAt)})::timestamptz::date`
    ];
  const existing = queryOne(`
    select
      id::text as "id",
      user_id::text as "userId",
      task_id::text as "taskId",
      channel,
      scheduled_at as "scheduledAt",
      status,
      payload,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from notification_jobs
    where ${existingWhere.join(' and ')}
    order by scheduled_at asc
    limit 1
  `);
  if (existing) return existing;
  return createNotificationJob({ userId: normalizedUserId, taskId: normalizedTaskId, channel, scheduledAt, payload });
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

function listNotificationJobs({ userId, limit = 20, status, startAt, endAt, organizationId, type, mode, includeAllUsers = false } = {}) {
  const normalizedUserId = normalizeId(userId);
  const effectiveUserId = normalizedUserId || IDS.demoUser;
  const normalizedOrganizationId = normalizeId(organizationId);
  const normalizedMode = mode ? normalizeMode(mode) : '';
  const normalizedStartAt = normalizeDateTimeFilter(startAt);
  const normalizedEndAt = normalizeDateTimeFilter(endAt);
  const where = ['true'];
  if (!includeAllUsers) {
    where.push(`nj.user_id = ${sqlValue(ensureUser(effectiveUserId))}`);
  } else if (normalizedUserId) {
    where.push(`nj.user_id = ${sqlValue(normalizedUserId)}`);
  }
  if (status) where.push(`nj.status = ${sqlValue(status)}`);
  if (normalizedStartAt) where.push(`nj.scheduled_at >= ${sqlValue(normalizedStartAt)}`);
  if (normalizedEndAt) where.push(`nj.scheduled_at <= ${sqlValue(normalizedEndAt)}`);
  if (normalizedOrganizationId) where.push(`c.organization_id = ${sqlValue(normalizedOrganizationId)}`);
  if (type) where.push(`c.type = ${sqlValue(type)}`);
  if (normalizedMode) where.push(`mp.mode = ${sqlValue(normalizedMode)}`);
  return queryRows(`
    select
      nj.id::text as "id",
      nj.user_id::text as "userId",
      u.nickname as "userNickname",
      nj.task_id::text as "taskId",
      nj.channel,
      nj.scheduled_at as "scheduledAt",
      nj.status,
      nj.payload,
      nj.sent_at as "sentAt",
      nj.created_at as "createdAt",
      nj.updated_at as "updatedAt",
      mp.mode,
      c.id::text as "contentId",
      coalesce(c.title, nj.payload ->> 'title', '') as title
    from notification_jobs nj
    left join users u on u.id = nj.user_id
    left join review_tasks rt on rt.id = nj.task_id
    left join memory_plans mp on mp.id = rt.plan_id
    left join contents c on c.id = mp.content_id
    where ${where.join(' and ')}
    order by nj.scheduled_at desc
    limit ${Number(limit || 20)}
  `);
}

function dispatchNotificationJobs({ dueBefore = new Date().toISOString(), limit = 20 } = {}) {
  const pendingJobs = queryRows(`
    select
      id::text as "id",
      user_id::text as "userId",
      task_id::text as "taskId",
      channel,
      scheduled_at as "scheduledAt",
      status,
      payload,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from notification_jobs
    where status = 'pending'
      and scheduled_at <= ${sqlValue(String(dueBefore || new Date().toISOString()))}
    order by scheduled_at asc
    limit ${Number(limit || 20)}
  `);

  const dispatched = pendingJobs.map((job) => queryReturningOne(`
    update notification_jobs
    set
      status = 'sent',
      sent_at = now(),
      updated_at = now()
    where id = ${sqlValue(job.id)}
    returning
      id::text as "id",
      user_id::text as "userId",
      task_id::text as "taskId",
      channel,
      scheduled_at as "scheduledAt",
      status,
      payload,
      sent_at as "sentAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `)).map((job) => ({
    ...job,
    deliveryProvider: 'mock'
  }));

  return {
    dispatchedCount: dispatched.length,
    dispatched
  };
}

function getGrowthOverview(userId = IDS.demoUser) {
  const normalizedUserId = ensureUser(userId);
  const overview = queryOne(`
    select
      (select count(*)::int from memory_plans where user_id = ${sqlValue(normalizedUserId)} and state = 'mastered' and deleted_at is null) as "masteredCount",
      (select count(*)::int from memory_plans where user_id = ${sqlValue(normalizedUserId)} and mode = 'playful' and state in ('reviewing', 'at_risk', 'mastered') and deleted_at is null) as "playfulPlanCount",
      (select count(*)::int from memory_plans where user_id = ${sqlValue(normalizedUserId)} and mode = 'scientific' and state in ('reviewing', 'at_risk', 'mastered') and deleted_at is null) as "scientificPlanCount",
      (select count(*)::int from review_tasks where user_id = ${sqlValue(normalizedUserId)} and status = 'completed') as "completedTaskCount",
      (select count(*)::int from recitation_sessions where user_id = ${sqlValue(normalizedUserId)} and completed = true) as "recitationSessionCount"
  `) || {};
  const latestPractice = queryOne(`
    select growth_stage as "growthStage", created_at as "createdAt"
    from practice_sessions
    where user_id = ${sqlValue(normalizedUserId)}
    order by created_at desc
    limit 1
  `);
  const memorizationStreak = calculateDailyStreak(queryRows(`
    select distinct created_at::date as "day"
    from practice_sessions
    where user_id = ${sqlValue(normalizedUserId)}
    order by day desc
  `).map((row) => row.day));
  const recitationStreak = calculateDailyStreak(queryRows(`
    select distinct created_at::date as "day"
    from recitation_sessions
    where user_id = ${sqlValue(normalizedUserId)}
      and completed = true
    order by day desc
  `).map((row) => row.day));

  return {
    memorizationStreak,
    recitationStreak,
    masteredCount: Number(overview.masteredCount || 0),
    playfulPlanCount: Number(overview.playfulPlanCount || 0),
    scientificPlanCount: Number(overview.scientificPlanCount || 0),
    completedTaskCount: Number(overview.completedTaskCount || 0),
    recitationSessionCount: Number(overview.recitationSessionCount || 0),
    latestMilestone: latestPractice
      ? {
          title: latestPractice.growthStage || '已修持',
          achievedAt: latestPractice.createdAt
        }
      : null
  };
}

function listRecitationGoals(userId = IDS.demoUser) {
  const normalizedUserId = ensureUser(userId);
  return queryRows(`
    select
      rg.id::text as "id",
      rg.user_id::text as "userId",
      rg.content_id::text as "contentId",
      rg.goal_type as "goalType",
      rg.preferred_period as "preferredPeriod",
      rg.daily_target_count as "dailyTargetCount",
      rg.status,
      rg.created_at as "createdAt",
      rg.updated_at as "updatedAt",
      c.title,
      c.preview,
      c.scene
    from recitation_goals rg
    join contents c on c.id = rg.content_id
    where rg.user_id = ${sqlValue(normalizedUserId)}
      and rg.status = 'active'
    order by rg.updated_at desc
  `);
}

function upsertRecitationGoal({ userId = IDS.demoUser, contentId, goalType = 'daily', preferredPeriod = 'morning', dailyTargetCount = 1 }) {
  const normalizedUserId = ensureUser(userId);
  const normalizedContentId = normalizeId(contentId);
  const content = normalizedContentId ? getContent(normalizedContentId) : null;
  if (!content) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  const goal = queryReturningOne(`
    insert into recitation_goals (
      user_id,
      content_id,
      goal_type,
      preferred_period,
      daily_target_count,
      status
    ) values (
      ${sqlValue(normalizedUserId)},
      ${sqlValue(normalizedContentId)},
      ${sqlValue(goalType || 'daily')},
      ${sqlValue(normalizeRecitationPeriod(preferredPeriod))},
      ${Math.max(1, Number(dailyTargetCount || 1))},
      'active'
    )
    on conflict (user_id, content_id, goal_type) do update set
      preferred_period = excluded.preferred_period,
      daily_target_count = excluded.daily_target_count,
      status = 'active',
      updated_at = now()
    returning
      id::text as "id",
      user_id::text as "userId",
      content_id::text as "contentId",
      goal_type as "goalType",
      preferred_period as "preferredPeriod",
      daily_target_count as "dailyTargetCount",
      status,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `);
  scheduleNextRecitationReminderJobs(normalizedUserId, goal, content, addDays(todayDate(), 1));
  return goal;
}

function createRecitationSession({ userId = IDS.demoUser, contentId, goalId = null, sessionType = 'free', period = 'morning', roundCount = 1, durationSeconds = 0, completed = true, note = '' }) {
  const normalizedUserId = ensureUser(userId);
  const normalizedContentId = normalizeId(contentId);
  const content = normalizedContentId ? getContent(normalizedContentId) : null;
  if (!content) {
    const error = new Error('Content not found');
    error.statusCode = 404;
    throw error;
  }

  const session = queryReturningOne(`
    insert into recitation_sessions (
      user_id,
      content_id,
      goal_id,
      session_type,
      period,
      round_count,
      duration_seconds,
      completed,
      note
    ) values (
      ${sqlValue(normalizedUserId)},
      ${sqlValue(normalizedContentId)},
      ${sqlValue(normalizeId(goalId))},
      ${sqlValue(sessionType || 'free')},
      ${sqlValue(normalizeRecitationPeriod(period))},
      ${Math.max(1, Number(roundCount || 1))},
      ${Math.max(0, Number(durationSeconds || 0))},
      ${completed ? 'true' : 'false'},
      ${sqlValue(note || null)}
    )
    returning
      id::text as "id",
      user_id::text as "userId",
      content_id::text as "contentId",
      goal_id::text as "goalId",
      session_type as "sessionType",
      period,
      round_count as "roundCount",
      duration_seconds as "durationSeconds",
      completed,
      note,
      created_at as "createdAt"
  `);
  if (session && session.completed) {
    const goal = normalizeId(goalId)
      ? queryOne(`
        select
          id::text as "id",
          user_id::text as "userId",
          content_id::text as "contentId",
          goal_type as "goalType",
          preferred_period as "preferredPeriod",
          daily_target_count as "dailyTargetCount",
          status
        from recitation_goals
        where id = ${sqlValue(normalizeId(goalId))}
          and user_id = ${sqlValue(normalizedUserId)}
        limit 1
      `)
      : null;
    scheduleNextRecitationReminderJobs(
      normalizedUserId,
      goal || {
        id: goalId || '',
        contentId: normalizedContentId,
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

function listTodayFocus(userId = IDS.demoUser) {
  const normalizedUserId = ensureUser(userId);
  const today = todayDate();
  const plans = listPlans(normalizedUserId);
  const duePlans = plans.filter((plan) => (plan.tasks || []).some((task) => task.status !== 'completed' && String(task.dueDate) <= today));
  const grouped = duePlans.reduce((acc, plan) => {
    const nextTask = (plan.tasks || []).find((task) => task.status !== 'completed' && String(task.dueDate) <= today);
    if (!nextTask) return acc;
    const content = getContent(plan.contentId) || {};
    const item = {
      planId: plan.id,
      taskId: nextTask.id,
      contentId: plan.contentId,
      title: plan.title,
      mode: plan.mode || 'scientific',
      state: plan.state || 'reviewing',
      method: nextTask.method,
      currentDay: nextTask.dayIndex,
      totalDays: plan.totalDays,
      meta: `第 ${nextTask.dayIndex}/${plan.totalDays} 天 · ${nextTask.method}`,
      masteryScore: plan.masteryScore,
      growthStage: normalizeGrowthStage(plan.masteryScore),
      body: content.preview || '',
      preview: content.preview || '',
      scene: content.scene || '',
      reasonText: scientificReasonText(plan, nextTask)
    };
    if (item.mode === 'playful') {
      acc.playfulTasks.push(item);
    } else {
      acc.scientificTasks.push(item);
    }
    return acc;
  }, { scientificTasks: [], playfulTasks: [] });

  const goalRows = listRecitationGoals(normalizedUserId);
  const recitationTasks = goalRows.map((goal) => ({
    goalId: goal.id,
    contentId: goal.contentId,
    title: goal.title,
    preview: goal.preview,
    preferredPeriod: goal.preferredPeriod,
    dailyTargetCount: goal.dailyTargetCount,
    goalType: goal.goalType,
    status: goal.status
  }));

  return {
    date: today,
    scientificTasks: grouped.scientificTasks,
    playfulTasks: grouped.playfulTasks,
    recitationTasks
  };
}

function getTasksForPlan(planId) {
  return queryRows(`
    select
      id::text as "id",
      plan_id::text as "planId",
      user_id::text as "userId",
      due_date as "dueDate",
      method,
      day_index as "dayIndex",
      status,
      result,
      completed_at as "completedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from review_tasks
    where plan_id = ${sqlValue(planId)}
    order by day_index asc
  `);
}

function getPlan(planId) {
  return queryOne(`
    select
      id::text as "id",
      user_id::text as "userId",
      content_id::text as "contentId",
      mode,
      title,
      start_date as "startDate",
      total_days as "totalDays",
      current_day as "currentDay",
      state,
      mastery_score as "masteryScore",
      streak_hits as "streakHits",
      last_reviewed_at as "lastReviewedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from memory_plans
    where id = ${sqlValue(planId)}
      and deleted_at is null
    limit 1
  `);
}

function getTask(taskId) {
  return queryOne(`
    select
      id::text as "id",
      plan_id::text as "planId",
      user_id::text as "userId",
      due_date as "dueDate",
      method,
      day_index as "dayIndex",
      status,
      result,
      completed_at as "completedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from review_tasks
    where id = ${sqlValue(taskId)}
    limit 1
  `);
}

function getOrganization(organizationId) {
  return queryOne(`
    select id::text as "id", name, type, status
    from organizations
    where id = ${sqlValue(organizationId)}
      and deleted_at is null
    limit 1
  `);
}

function getAsset(assetId) {
  return queryOne(`
    select
      id::text as "id",
      organization_id::text as "organizationId",
      title,
      type,
      url,
      thumbnail_url as "thumbnailUrl",
      access_level as "accessLevel",
      publish_status as "publishStatus",
      copyright_status as "copyrightStatus"
    from assets
    where id = ${sqlValue(assetId)}
      and deleted_at is null
    limit 1
  `);
}

function ensureUser(userId) {
  const normalizedUserId = normalizeUserId(userId);
  queryScalar(`
    insert into users (id, nickname, platform, status)
    values (${sqlValue(normalizedUserId)}, 'Demo 用户', 'wechat', 'active')
    on conflict (id) do nothing
    returning id::text
  `);
  return normalizedUserId;
}

function normalizeUserId(userId) {
  return isUuid(userId) ? userId : IDS.demoUser;
}

function normalizeId(id) {
  if (!id) return null;
  if (isUuid(id)) return id;
  return LEGACY_ID_MAP[id] || null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
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

function appendAuditLog({ action, organizationId, targetType, targetId, detail }) {
  queryScalar(`
    insert into audit_logs (
      actor_type,
      actor_id,
      organization_id,
      action,
      target_type,
      target_id,
      detail
    ) values (
      'admin_user',
      ${sqlValue(IDS.adminUser)},
      ${sqlValue(organizationId)},
      ${sqlValue(action)},
      ${sqlValue(targetType)},
      ${sqlValue(targetId)},
      ${sqlJson(detail || {})}::jsonb
    )
    returning id::text
  `);
}

function seedDatabase() {
  queryScalar(`
    insert into users (id, nickname, platform, status)
    values (${sqlValue(IDS.demoUser)}, 'Demo 用户', 'wechat', 'active')
    on conflict (id) do nothing
    returning id::text
  `);

  DEFAULT_ADMIN_SEEDS.forEach((seed) => {
    upsertAdminUser(seed);
  });

  queryScalar(`
    insert into organizations (id, name, type, status)
    values (${sqlValue(IDS.organization)}, '一念法藏示范空间', 'dharma_group', 'active')
    on conflict (id) do nothing
    returning id::text
  `);

  seedContent({
    id: IDS.contents['six-syllable-mantra'],
    title: '六字大明咒',
    subtitle: '短咒',
    type: 'mantra',
    body: '唵 嘛呢 叭咪 吽',
    preview: '唵 嘛呢 叭咪 吽',
    lengthTier: 'short',
    planDays: 4,
    scene: '通勤路上 · 睡前持诵',
    segments: ['唵嘛呢叭咪吽']
  });
  seedContent({
    id: IDS.contents['green-tara-mantra'],
    title: '绿度母心咒',
    subtitle: '短咒',
    type: 'mantra',
    body: '嗡 达列 都达列 都列 梭哈',
    preview: '嗡 达列 都达列 都列 梭哈',
    lengthTier: 'short',
    planDays: 4,
    scene: '祈愿安顺 · 出行平安',
    segments: ['嗡达列都达列都列梭哈']
  });
  seedContent({
    id: IDS.contents['diamond-sutra-ending'],
    title: '金刚经·结尾偈',
    subtitle: '经文片段',
    type: 'sutra_segment',
    body: '一切有为法，如梦幻泡影，如露亦如电，应作如是观。',
    preview: '一切有为法，如梦幻泡影，如露亦如电，应作如是观。',
    lengthTier: 'medium',
    planDays: 4,
    scene: '观照无常 · 放下执着',
    segments: ['一切有为法', '如梦幻泡影', '如露亦如电', '应作如是观']
  });
  seedContent({
    id: IDS.contents['heart-sutra-core'],
    title: '心经·核心段',
    subtitle: '经文片段',
    type: 'sutra_segment',
    body: '色不异空，空不异色，色即是空，空即是色，受想行识，亦复如是。',
    preview: '色不异空，空不异色，色即是空，空即是色，受想行识，亦复如是。',
    lengthTier: 'medium',
    planDays: 5,
    scene: '晨课静坐 · 心绪烦乱时',
    segments: ['色不异空', '空不异色', '色即是空', '空即是色', '受想行识，亦复如是']
  });
  seedContent({
    id: IDS.contents['great-compassion-opening'],
    title: '大悲咒',
    subtitle: '长咒',
    type: 'sutra_segment',
    body: GREAT_COMPASSION_BODY,
    preview: '南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶，菩提萨埵婆耶。',
    lengthTier: 'long',
    planDays: 28,
    scene: '84 句分段 · 28 天科学背诵',
    segments: GREAT_COMPASSION_SEGMENTS,
    defaultMode: 'scientific',
    supportedModes: ['scientific'],
    supportsRecitation: true,
    recommendedRecitationTime: 'morning',
    recitationTheme: '大悲咒全文读诵'
  });
  seedGreatCompassionStructure();

  seedFestival({
    id: IDS.festivals['guanyin-birthday'],
    name: '观音菩萨圣诞',
    lunarDate: '农历二月十九',
    relatedFigure: '观世音菩萨',
    description: '适合诵持观音法门相关经咒，发起慈悲与利他之心。',
    contentIds: [IDS.contents['six-syllable-mantra'], IDS.contents['great-compassion-opening']]
  });
  seedFestival({
    id: IDS.festivals['medicine-buddha-birthday'],
    name: '药师佛圣诞',
    lunarDate: '农历九月三十',
    relatedFigure: '药师琉璃光如来',
    description: '适合修持药师法门，祈愿身心安稳、病苦消融。',
    contentIds: [IDS.contents['green-tara-mantra']]
  });

  seedAsset({
    id: IDS.assets.heartAudio,
    title: '心经·梵唱合集',
    type: 'audio',
    url: 'storage://demo/audio/heart-sutra-chant.mp3',
    thumbnailUrl: '/assets/music-heart.jpg',
    accessLevel: 'public',
    copyrightStatus: 'authorized'
  });
  seedAsset({
    id: IDS.assets.guanyinThangka,
    title: '观音唐卡高清原图',
    type: 'image',
    url: 'storage://demo/image/guanyin-thangka-origin.jpg',
    thumbnailUrl: '/assets/thangka-tara.jpg',
    accessLevel: 'restricted',
    copyrightStatus: 'internal_authorized'
  });
  seedAsset({
    id: IDS.assets.privateRitual,
    title: '内部仪轨备份文档',
    type: 'document',
    url: 'storage://demo/document/internal-ritual.pdf',
    thumbnailUrl: null,
    accessLevel: 'private',
    copyrightStatus: 'organization_owned'
  });

  const existingMember = queryScalar(`
    select id::text
    from organization_members
    where organization_id = ${sqlValue(IDS.organization)}
      and user_id = ${sqlValue(IDS.demoUser)}
      and role = 'organization_admin'
      and status = 'active'
      and deleted_at is null
    limit 1
  `);

  if (!existingMember) {
    queryScalar(`
      insert into organization_members (organization_id, user_id, role, status)
      values (${sqlValue(IDS.organization)}, ${sqlValue(IDS.demoUser)}, 'organization_admin', 'active')
      returning id::text
    `);
  }
}

function upsertAdminUser(seed) {
  queryScalar(`
    insert into admin_users (id, username, name, email, phone, password_hash, role, status)
    values (
      ${sqlValue(seed.id)},
      ${sqlValue(seed.username)},
      ${sqlValue(seed.name)},
      ${sqlValue(seed.email)},
      ${sqlValue(seed.phone)},
      ${sqlValue(hashAdminPassword(seed.password))},
      ${sqlValue(seed.role || 'super_admin')},
      'active'
    )
    on conflict (id) do update set
      username = excluded.username,
      name = excluded.name,
      email = excluded.email,
      phone = excluded.phone,
      password_hash = excluded.password_hash,
      role = excluded.role,
      status = excluded.status,
      updated_at = now()
    returning id::text
  `);
}

function seedContent(content) {
  queryScalar(`
    insert into contents (
      id,
      title,
      subtitle,
      type,
      body,
      preview,
      length_tier,
      plan_days,
      scene,
      source_note,
      version_note,
      access_level,
      publish_status,
      review_status,
      organization_id,
      created_by,
      reviewed_by,
      reviewed_at,
      published_at
    ) values (
      ${sqlValue(content.id)},
      ${sqlValue(content.title)},
      ${sqlValue(content.subtitle)},
      ${sqlValue(content.type)},
      ${sqlValue(content.body)},
      ${sqlValue(content.preview)},
      ${sqlValue(content.lengthTier)},
      ${Number(content.planDays)},
      ${sqlValue(content.scene)},
      '',
      '',
      'public',
      'published',
      'approved',
      ${sqlValue(IDS.organization)},
      ${sqlValue(IDS.adminUser)},
      ${sqlValue(IDS.adminUser)},
      now(),
      now()
    )
    on conflict (id) do update set
      title = excluded.title,
      subtitle = excluded.subtitle,
      type = excluded.type,
      body = excluded.body,
      preview = excluded.preview,
      length_tier = excluded.length_tier,
      plan_days = excluded.plan_days,
      scene = excluded.scene,
      updated_at = now()
    returning id::text
  `);

  content.segments.forEach((segment, index) => {
    queryScalar(`
      insert into content_segments (content_id, sort_order, text)
      values (${sqlValue(content.id)}, ${index + 1}, ${sqlValue(segment)})
      on conflict (content_id, sort_order) do update set
        text = excluded.text,
        updated_at = now()
      returning id::text
    `);
  });

  upsertContentModeConfig(content.id, {
    defaultMode: content.defaultMode || 'scientific',
    supportedModes: content.supportedModes || ['scientific', 'playful'],
    supportsRecitation: content.supportsRecitation !== false,
    recommendedRecitationTime: content.recommendedRecitationTime || 'morning',
    recitationTheme: content.recitationTheme || content.title
  });
}

function seedGreatCompassionStructure() {
  const contentId = IDS.contents['great-compassion-opening'];
  let version = queryReturningOne(`
    insert into content_versions (
      content_id,
      version_no,
      snapshot_json,
      change_note,
      created_by,
      review_status,
      source_note,
      version_note,
      reviewed_by,
      reviewed_at,
      published_at
    ) values (
      ${sqlValue(contentId)},
      ${GREAT_COMPASSION_VERSION.versionNo},
      ${sqlJson({
        id: GREAT_COMPASSION_VERSION.id,
        contentId: 'great-compassion-opening',
        versionNo: GREAT_COMPASSION_VERSION.versionNo,
        reviewStatus: GREAT_COMPASSION_VERSION.reviewStatus,
        sourceNote: GREAT_COMPASSION_VERSION.sourceNote,
        versionNote: GREAT_COMPASSION_VERSION.versionNote
      })}::jsonb,
      ${sqlValue(GREAT_COMPASSION_VERSION.versionNote)},
      ${sqlValue(IDS.adminUser)},
      ${sqlValue(GREAT_COMPASSION_VERSION.reviewStatus)},
      ${sqlValue(GREAT_COMPASSION_VERSION.sourceNote)},
      ${sqlValue(GREAT_COMPASSION_VERSION.versionNote)},
      ${sqlValue(IDS.adminUser)},
      now(),
      now()
    )
    on conflict (content_id, version_no) do nothing
    returning id::text as "id"
  `);

  if (!version) {
    version = queryOne(`
      select id::text as "id"
      from content_versions
      where content_id = ${sqlValue(contentId)}
        and version_no = ${GREAT_COMPASSION_VERSION.versionNo}
      limit 1
    `);
  }
  if (!version) return;

  const sectionValues = GREAT_COMPASSION_STRUCTURE_SECTIONS.map((section) => `(
    ${sqlValue(version.id)},
    ${sqlValue(section.title)},
    ${section.sortOrder}
  )`).join(',');
  queryScalar(`
    insert into content_sections (content_version_id, title, sort_order)
    values ${sectionValues}
    on conflict (content_version_id, sort_order) do nothing
  `);

  const sections = queryRows(`
    select id::text as "id", sort_order as "sortOrder"
    from content_sections
    where content_version_id = ${sqlValue(version.id)}
    order by sort_order asc
  `);
  const sectionIds = new Map(sections.map((section) => [Number(section.sortOrder), section.id]));
  const unitValues = GREAT_COMPASSION_STRUCTURE_SECTIONS.flatMap((section) => section.units.map((unit) => `(
    ${sqlValue(sectionIds.get(section.sortOrder))},
    ${sqlValue(unit.text)},
    ${sqlValue(unit.pinyin)},
    ${sqlValue(unit.firstCharacterCue)},
    ${unit.estimatedSeconds},
    ${unit.sortOrder}
  )`)).join(',');
  queryScalar(`
    insert into memory_units (
      section_id,
      text,
      phonetic_text,
      first_character_cue,
      estimated_seconds,
      sort_order
    ) values ${unitValues}
    on conflict (section_id, sort_order) do nothing
  `);
}

function seedFestival(festival) {
  queryScalar(`
    insert into festivals (
      id,
      name,
      lunar_date,
      related_figure,
      description,
      publish_status
    ) values (
      ${sqlValue(festival.id)},
      ${sqlValue(festival.name)},
      ${sqlValue(festival.lunarDate)},
      ${sqlValue(festival.relatedFigure)},
      ${sqlValue(festival.description)},
      'published'
    )
    on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      updated_at = now()
    returning id::text
  `);

  festival.contentIds.forEach((contentId, index) => {
    const relationType = 'recommended_content';
    const exists = queryScalar(`
      select id::text
      from festival_contents
      where festival_id = ${sqlValue(festival.id)}
        and content_id = ${sqlValue(contentId)}
        and relation_type = ${sqlValue(relationType)}
      limit 1
    `);
    if (exists) return;
    queryScalar(`
      insert into festival_contents (festival_id, content_id, relation_type, sort_order)
      values (${sqlValue(festival.id)}, ${sqlValue(contentId)}, ${sqlValue(relationType)}, ${index + 1})
      returning id::text
    `);
  });
}

function seedAsset(asset) {
  queryScalar(`
    insert into assets (
      id,
      organization_id,
      title,
      type,
      url,
      thumbnail_url,
      access_level,
      publish_status,
      copyright_status,
      created_by
    ) values (
      ${sqlValue(asset.id)},
      ${sqlValue(IDS.organization)},
      ${sqlValue(asset.title)},
      ${sqlValue(asset.type)},
      ${sqlValue(asset.url)},
      ${sqlValue(asset.thumbnailUrl)},
      ${sqlValue(asset.accessLevel)},
      'published',
      ${sqlValue(asset.copyrightStatus)},
      ${sqlValue(IDS.adminUser)}
    )
    on conflict (id) do update set
      title = excluded.title,
      access_level = excluded.access_level,
      updated_at = now()
    returning id::text
  `);
}

function queryRows(sql) {
  return JSON.parse(queryScalar(`
    select coalesce(json_agg(row_to_json(result_row)), '[]'::json)
    from (${sql}) result_row
  `) || '[]');
}

function queryOne(sql) {
  const rows = queryRows(sql);
  return rows[0] || null;
}

function queryReturningOne(sql) {
  const json = queryScalar(`
    with result_row as (
      ${sql}
    )
    select row_to_json(result_row)
    from result_row
  `);
  return json ? JSON.parse(json) : null;
}

function queryScalar(sql) {
  const output = execFileSync(PSQL_BIN, [
    '-X',
    '-h', DB_CONFIG.host,
    '-p', DB_CONFIG.port,
    '-U', DB_CONFIG.user,
    '-d', DB_CONFIG.database,
    '-t',
    '-A',
    '-c', sql
  ], {
    env: {
      ...process.env,
      PGPASSWORD: DB_CONFIG.password
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8
  });

  return output.trim();
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return sqlValue(JSON.stringify(value));
}

function contentStructureError(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function assessmentError(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function hashAdminPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isMeaningfulNickname(value) {
  const nickname = String(value || '').trim();
  return Boolean(nickname && nickname !== '微信用户');
}

function resolvePsqlBinary() {
  const candidates = [
    process.env.PSQL_BIN,
    '/opt/homebrew/bin/psql',
    '/usr/local/bin/psql',
    '/usr/bin/psql',
    'psql'
  ].filter(Boolean);

  const fileCandidate = candidates.find((candidate) => candidate.includes('/') && fs.existsSync(candidate));
  if (fileCandidate) return fileCandidate;
  return candidates[candidates.length - 1];
}

module.exports = {
  addOrganizationMember,
  archiveAsset,
  archiveContent,
  archiveFestival,
  completeTask,
  copyContentAsNewVersion,
  createAsset,
  createContent,
  createFestival,
  createMemoryAssessment,
  createNotificationJob,
  createRecitationSession,
  dispatchNotificationJobs,
  createPlan,
  getContent,
  getContentStructure,
  getGrowthOverview,
  getDashboard,
  getNotificationSettings,
  getUserById,
  getAdminById,
  initializeDatabase,
  loginByWechatCode,
  updateUserProfile,
  findAdminByCredentials,
  listAdminContents,
  listAdminFestivals,
  listAuditLogs,
  listContentVersions,
  listContents,
  listFestivals,
  listNotificationJobs,
  listOrganizationAssets,
  listOrganizations,
  listPlans,
  listRecitationGoals,
  listTodayFocus,
  recommendMemoryPlan,
  updateAsset,
  todayDate,
  updateContent,
  updateFestival,
  updateAssetAccess,
  upsertRecitationGoal,
  upsertNotificationSetting
};
