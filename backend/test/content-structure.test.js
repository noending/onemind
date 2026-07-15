const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { contents: seedContents } = require('../src/data/seed');
const store = require('../src/repositories/memoryStore');
const {
  contents: builtinContents,
  getApprovedContentStructure
} = require('../../common/content');
const { normalizeContent } = require('../../common/api');
const storeModulePath = require.resolve('../src/repositories/store');
require.cache[storeModulePath] = {
  id: storeModulePath,
  filename: storeModulePath,
  loaded: true,
  exports: {
    ...store,
    getStoreMode: () => 'memory'
  }
};
const { handleRequest } = require('../src/routes');

function request(input) {
  const options = typeof input === 'string' ? { pathname: input } : input;
  const { method = 'GET', pathname, headers = {}, payload } = options;
  return new Promise((resolve, reject) => {
    const response = {
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
      },
      end(body) {
        resolve({
          statusCode: this.statusCode,
          body: body ? JSON.parse(body) : null
        });
      }
    };

    handleRequest(
      { method, url: pathname, headers },
      response,
      payload === undefined ? '' : JSON.stringify(payload)
    ).catch(reject);
  });
}

async function loginAdmin() {
  const response = await request({
    method: 'POST',
    pathname: '/api/admin/login',
    payload: { username: 'magic', password: 'Noending5@' }
  });
  assert.equal(response.statusCode, 200);
  return response.body.data.token;
}

function withDraftSeedContent(run) {
  const draft = {
    id: 'draft-content',
    title: '未审核结构测试',
    body: '未审核正文',
    preview: '未审核正文',
    segments: ['未审核正文'],
    publishStatus: 'draft',
    reviewStatus: 'draft',
    publishedVersion: {
      id: 'draft-version',
      versionNo: 1,
      reviewStatus: 'draft',
      sourceNote: '待审核来源',
      versionNote: '待审核版本'
    },
    sections: []
  };
  seedContents.push(draft);
  const cleanup = () => seedContents.splice(seedContents.indexOf(draft), 1);
  try {
    const result = run(draft);
    if (result && typeof result.finally === 'function') return result.finally(cleanup);
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

test('great compassion exposes six reviewed sections with exactly 84 ordered units', () => {
  const content = store.listContents().find((item) => item.title === '大悲咒');
  const structure = store.getContentStructure(content.id, content.publishedVersionId);
  const units = structure.sections.flatMap((section) => section.units);

  assert.equal(structure.reviewStatus, 'approved');
  assert.equal(structure.contentId, 'great-compassion-opening');
  assert.equal(structure.contentVersionId, 'great-compassion-v1');
  assert.equal(structure.sourceNote, '经人工校对的首发版本');
  assert.equal(structure.versionNote, '首版 84 句学习结构');
  assert.equal(structure.sections.length, 6);
  assert.deepEqual(structure.sections.map((section) => section.units.length), [14, 14, 14, 14, 14, 14]);
  assert.equal(units.length, 84);
  assert.deepEqual(units.map((unit) => unit.sortOrder), Array.from({ length: 84 }, (_, index) => index + 1));
  assert.ok(units.every((unit) => unit.pinyin === ''));
  assert.deepEqual(
    units.map((unit) => unit.text),
    builtinContents.find((item) => item.title === '大悲咒').segments
  );
});

test('client builtin snapshot only resolves the exact approved published version', () => {
  const structure = getApprovedContentStructure(
    'great-compassion-opening',
    'great-compassion-v1'
  );

  assert.equal(structure.contentId, 'great-compassion-opening');
  assert.equal(structure.contentVersionId, 'great-compassion-v1');
  assert.equal(structure.reviewStatus, 'approved');
  assert.equal(structure.sections.length, 6);
  assert.equal(structure.sections.flatMap((section) => section.units).length, 84);
  assert.equal(
    getApprovedContentStructure('great-compassion-opening', 'great-compassion-v2'),
    null
  );
});

test('unapproved content versions cannot be returned as plan-ready structures', () => {
  withDraftSeedContent(() => {
    assert.throws(
      () => store.getContentStructure('draft-content', 'draft-version'),
      /CONTENT_VERSION_NOT_APPROVED/
    );
  });
});

test('structure route returns the approved snapshot only for its exact version path', async () => {
  const response = await request('/api/contents/great-compassion-opening/versions/great-compassion-v1/structure');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.contentId, 'great-compassion-opening');
  assert.equal(response.body.data.contentVersionId, 'great-compassion-v1');
  assert.equal(response.body.data.reviewStatus, 'approved');
  assert.equal(response.body.data.sections.length, 6);
});

test('structure route distinguishes missing and unapproved versions', async () => {
  const missing = await request('/api/contents/missing-content/versions/missing-version/structure');
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.error, 'CONTENT_VERSION_NOT_FOUND');

  await withDraftSeedContent(async () => {
    const unapproved = await request('/api/contents/draft-content/versions/draft-version/structure');
    assert.equal(unapproved.statusCode, 409);
    assert.equal(unapproved.body.error, 'CONTENT_VERSION_NOT_APPROVED');
  });
});

test('content normalization prefers server arrays even when they are empty', () => {
  const normalized = normalizeContent({
    id: 'great-compassion-opening',
    title: '大悲咒',
    body: '服务端正文',
    segments: [],
    sections: [],
    publishedVersionId: 'server-version',
    sourceNote: '服务端来源',
    versionNote: '服务端版本',
    reviewStatus: 'approved'
  });

  assert.deepEqual(normalized.segments, []);
  assert.deepEqual(normalized.sections, []);
  assert.equal(normalized.publishedVersionId, 'server-version');
  assert.equal(normalized.sourceNote, '服务端来源');
  assert.equal(normalized.versionNote, '服务端版本');
  assert.equal(normalized.reviewStatus, 'approved');
});

test('content normalization uses the reviewed builtin structure only when server fields are omitted', () => {
  const normalized = normalizeContent({
    id: 'great-compassion-opening',
    title: '大悲咒',
    body: '服务端正文'
  });
  const builtin = builtinContents.find((item) => item.title === '大悲咒');

  assert.deepEqual(normalized.segments, builtin.segments);
  assert.deepEqual(normalized.sections, builtin.sections);
  assert.equal(normalized.publishedVersionId, 'great-compassion-v1');
});

test('backend content normalization never invents builtin publication metadata', () => {
  const normalized = normalizeContent({
    id: 'great-compassion-opening',
    title: '大悲咒',
    body: '服务端正文'
  }, { source: 'backend' });

  assert.equal(normalized.publishedVersionId, undefined);
  assert.equal(normalized.reviewStatus, undefined);
  assert.equal(normalized.sourceNote, undefined);
  assert.equal(normalized.versionNote, undefined);
});

test('memory content list and get expose the same authoritative approved version metadata', () => {
  const listed = store.listContents().find((item) => item.id === 'great-compassion-opening');
  const detail = store.getContent('great-compassion-opening');

  for (const content of [listed, detail]) {
    assert.equal(content.publishedVersionId, 'great-compassion-v1');
    assert.equal(content.reviewStatus, 'approved');
    assert.equal(content.sourceNote, '经人工校对的首发版本');
    assert.equal(content.versionNote, '首版 84 句学习结构');
  }
});

test('memory content projection follows a newly approved published version over stale content fields', () => {
  const content = seedContents.find((item) => item.id === 'great-compassion-opening');
  const previous = {
    publishedVersion: content.publishedVersion,
    reviewStatus: content.reviewStatus,
    sourceNote: content.sourceNote,
    versionNote: content.versionNote
  };
  content.publishedVersion = {
    id: 'great-compassion-v2',
    versionNo: 2,
    reviewStatus: 'approved',
    sourceNote: '第二版权威来源',
    versionNote: '第二版审核发布',
    sourceVersionNo: 1
  };
  content.reviewStatus = 'rejected';
  content.sourceNote = '陈旧内容来源';
  content.versionNote = '陈旧内容版本';

  try {
    const listed = store.listContents().find((item) => item.id === content.id);
    const detail = store.getContent(content.id);
    for (const projected of [listed, detail]) {
      assert.equal(projected.publishedVersionId, 'great-compassion-v2');
      assert.equal(projected.reviewStatus, 'approved');
      assert.equal(projected.sourceNote, '第二版权威来源');
      assert.equal(projected.versionNote, '第二版审核发布');
      assert.equal(projected.sourceVersionNo, 1);
    }
  } finally {
    Object.assign(content, previous);
  }
});

test('memory create API persists an authoritative approved published version', async () => {
  const token = await loginAdmin();
  const created = await request({
    method: 'POST',
    pathname: '/api/admin/contents',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      title: `首发版本测试 ${Date.now()}`,
      body: '首发正文',
      publishStatus: 'published',
      reviewStatus: 'approved',
      sourceNote: '首发权威来源',
      versionNote: '首发审核版本'
    }
  });

  try {
    assert.equal(created.statusCode, 201);
    const content = created.body.data;
    const versions = store.listContentVersions(content.id);
    const listed = store.listContents().find((item) => item.id === content.id);
    const detail = store.getContent(content.id);

    assert.equal(versions.length, 1);
    assert.equal(versions[0].id, content.publishedVersionId);
    assert.equal(versions[0].reviewStatus, 'approved');
    assert.ok(versions[0].publishedAt);
    for (const projected of [content, listed, detail]) {
      assert.equal(projected.publishedVersionId, versions[0].id);
      assert.equal(projected.reviewStatus, 'approved');
    }
  } finally {
    await request({
      method: 'DELETE',
      pathname: `/api/admin/contents/${encodeURIComponent(created.body.data.id)}`,
      headers: { authorization: `Bearer ${token}` }
    });
  }
});

test('memory publish API creates an approved version only after review approval', async () => {
  const token = await loginAdmin();
  const created = await request({
    method: 'POST',
    pathname: '/api/admin/contents',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      title: `草稿发布测试 ${Date.now()}`,
      body: '草稿正文',
      publishStatus: 'draft',
      reviewStatus: 'draft'
    }
  });

  try {
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.data.publishedVersionId, '');
    assert.equal(store.listContentVersions(created.body.data.id).some((item) => item.reviewStatus === 'approved'), false);

    const published = await request({
      method: 'PUT',
      pathname: `/api/admin/contents/${encodeURIComponent(created.body.data.id)}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        publishStatus: 'published',
        reviewStatus: 'approved',
        sourceNote: '发布权威来源',
        versionNote: '审核通过版本'
      }
    });
    const versions = store.listContentVersions(created.body.data.id);
    const approved = versions.filter((item) => item.reviewStatus === 'approved' && item.publishedAt);

    assert.equal(published.statusCode, 200);
    assert.equal(approved.length, 1);
    assert.equal(published.body.data.publishedVersionId, approved[0].id);
    assert.equal(published.body.data.reviewStatus, 'approved');
  } finally {
    await request({
      method: 'DELETE',
      pathname: `/api/admin/contents/${encodeURIComponent(created.body.data.id)}`,
      headers: { authorization: `Bearer ${token}` }
    });
  }
});

function runPostgresSql(sql) {
  return execFileSync(process.env.PSQL_BIN || '/opt/homebrew/bin/psql', [
    '-X',
    '-h', process.env.PGHOST || '127.0.0.1',
    '-p', process.env.PGPORT || '5432',
    '-U', process.env.PGUSER || 'magic',
    '-d', process.env.PGDATABASE || 'onemind',
    '-v', 'ON_ERROR_STOP=1',
    '-t', '-A', '-c', sql
  ], {
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'Noending5@' },
    encoding: 'utf8'
  }).trim();
}

test('postgres list and get select the latest approved published version metadata', {
  skip: process.env.RUN_POSTGRES_STRUCTURE_TEST !== '1'
}, () => {
  const postgresStore = require('../src/repositories/postgresStore');
  postgresStore.initializeDatabase();
  const contentId = '33333333-3333-4333-8333-000000000005';
  const versionId = crypto.randomUUID();
  const versionNo = Number(runPostgresSql(`
    select coalesce(max(version_no), 0) + 1
    from content_versions where content_id = '${contentId}'
  `));

  try {
    runPostgresSql(`
      insert into content_versions (
        id, content_id, version_no, snapshot_json, change_note, created_by,
        review_status, source_note, version_note, reviewed_by, reviewed_at, published_at
      ) values (
        '${versionId}', '${contentId}', ${versionNo}, '{"sourceVersionNo":1}'::jsonb, 'approved v2 test',
        '11111111-1111-4111-8111-222222222222', 'approved',
        '第二版 PostgreSQL 权威来源', '第二版 PostgreSQL 审核发布',
        '11111111-1111-4111-8111-222222222222', now(), now()
      )
    `);
    const listed = postgresStore.listContents().find((item) => item.id === contentId);
    const detail = postgresStore.getContent('great-compassion-opening');

    for (const content of [listed, detail]) {
      assert.equal(content.publishedVersionId, versionId);
      assert.equal(content.reviewStatus, 'approved');
      assert.equal(content.sourceNote, '第二版 PostgreSQL 权威来源');
      assert.equal(content.versionNote, '第二版 PostgreSQL 审核发布');
      assert.equal(content.sourceVersionNo, 1);
    }
  } finally {
    runPostgresSql(`delete from content_versions where id = '${versionId}'`);
  }
});

test('memory and postgres content providers expose the same canonical publication DTO', {
  skip: process.env.RUN_POSTGRES_STRUCTURE_TEST !== '1'
}, () => {
  const postgresStore = require('../src/repositories/postgresStore');
  postgresStore.initializeDatabase();
  const memory = store.getContent('great-compassion-opening');
  const postgres = postgresStore.getContent('great-compassion-opening');
  const pickPublication = (content) => ({
    publishedVersionId: content.publishedVersionId,
    reviewStatus: content.reviewStatus,
    sourceNote: content.sourceNote,
    versionNote: content.versionNote,
    sourceVersionNo: content.sourceVersionNo
  });

  assert.deepEqual(pickPublication(postgres), pickPublication(memory));
});

test('postgres create and publish APIs persist authoritative approved versions with memory parity', {
  skip: process.env.RUN_POSTGRES_STRUCTURE_TEST !== '1'
}, () => {
  const postgresStore = require('../src/repositories/postgresStore');
  postgresStore.initializeDatabase();
  const createdIds = [];

  try {
    const direct = postgresStore.createContent({
      title: `PostgreSQL 首发版本 ${Date.now()}`,
      body: 'PostgreSQL 首发正文',
      publishStatus: 'published',
      reviewStatus: 'approved',
      sourceNote: 'PostgreSQL 首发来源',
      versionNote: 'PostgreSQL 首发版本'
    });
    createdIds.push(direct.id);
    const directVersions = postgresStore.listContentVersions(direct.id);
    assert.equal(directVersions.length, 1);
    assert.equal(directVersions[0].id, direct.publishedVersionId);
    assert.equal(directVersions[0].reviewStatus, 'approved');
    assert.ok(directVersions[0].publishedAt);

    const draft = postgresStore.createContent({
      title: `PostgreSQL 草稿发布 ${Date.now()}`,
      body: 'PostgreSQL 草稿正文',
      publishStatus: 'draft',
      reviewStatus: 'draft'
    });
    createdIds.push(draft.id);
    assert.equal(postgresStore.listContentVersions(draft.id).some((item) => item.reviewStatus === 'approved'), false);

    const published = postgresStore.updateContent(draft.id, {
      publishStatus: 'published',
      reviewStatus: 'approved',
      sourceNote: 'PostgreSQL 发布来源',
      versionNote: 'PostgreSQL 审核通过版本'
    });
    const publishedVersions = postgresStore.listContentVersions(draft.id)
      .filter((item) => item.reviewStatus === 'approved' && item.publishedAt);
    assert.equal(publishedVersions.length, 1);
    assert.equal(published.publishedVersionId, publishedVersions[0].id);
    assert.equal(published.reviewStatus, 'approved');
  } finally {
    if (createdIds.length) {
      runPostgresSql(`
        delete from content_mode_configs where content_id in (${createdIds.map((id) => `'${id}'`).join(',')});
        delete from content_segments where content_id in (${createdIds.map((id) => `'${id}'`).join(',')});
        delete from content_versions where content_id in (${createdIds.map((id) => `'${id}'`).join(',')});
        delete from contents where id in (${createdIds.map((id) => `'${id}'`).join(',')});
      `);
    }
  }
});

test('postgres canonical v1 seed explicitly repairs and audits conflicting metadata', {
  skip: process.env.RUN_POSTGRES_SEED_REPAIR_TEST !== '1'
}, () => {
  const postgresStore = require('../src/repositories/postgresStore');
  postgresStore.initializeDatabase();
  const contentId = '33333333-3333-4333-8333-000000000005';
  const versionId = runPostgresSql(`
    select id::text from content_versions
    where content_id = '${contentId}' and version_no = 1
  `);
  runPostgresSql(`
    update content_versions
    set review_status = 'draft', source_note = 'conflicting source',
      version_note = 'conflicting version', published_at = null
    where id = '${versionId}'
  `);

  postgresStore.initializeDatabase();
  const repaired = JSON.parse(runPostgresSql(`
    select row_to_json(v) from (
      select review_status as "reviewStatus", source_note as "sourceNote",
        version_note as "versionNote", published_at is not null as "published"
      from content_versions where id = '${versionId}'
    ) v
  `));
  const auditCount = Number(runPostgresSql(`
    select count(*) from audit_logs
    where action = 'content.version.seed_reconciled'
      and target_id = '${versionId}'
  `));

  assert.deepEqual(repaired, {
    reviewStatus: 'approved',
    sourceNote: '经人工校对的首发版本',
    versionNote: '首版 84 句学习结构',
    published: true
  });
  assert.ok(auditCount >= 1);
});

test('postgres seeds and returns the reviewed great compassion structure idempotently', {
  skip: process.env.RUN_POSTGRES_STRUCTURE_TEST !== '1'
}, () => {
  const postgresStore = require('../src/repositories/postgresStore');

  postgresStore.initializeDatabase();
  const first = postgresStore.getContentStructure('great-compassion-opening', 'great-compassion-v1');
  assert.equal(first.contentVersionId, 'great-compassion-v1');
  assert.equal(first.reviewStatus, 'approved');
  assert.equal(first.sections.length, 6);
  assert.deepEqual(first.sections.map((section) => section.sortOrder), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(first.sections.map((section) => section.units.length), [14, 14, 14, 14, 14, 14]);
  assert.equal(first.sections.flatMap((section) => section.units).length, 84);
  assert.deepEqual(
    first.sections.flatMap((section) => section.units).map((unit) => unit.sortOrder),
    Array.from({ length: 84 }, (_, index) => index + 1)
  );

  postgresStore.initializeDatabase();
  const second = postgresStore.getContentStructure('great-compassion-opening', 'great-compassion-v1');
  assert.equal(second.contentVersionId, 'great-compassion-v1');
  assert.equal(second.sections.length, 6);
  assert.equal(second.sections.flatMap((section) => section.units).length, 84);
});
