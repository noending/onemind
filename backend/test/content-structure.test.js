const test = require('node:test');
const assert = require('node:assert/strict');

const { contents: seedContents } = require('../src/data/seed');
const store = require('../src/repositories/memoryStore');
const { contents: builtinContents } = require('../../common/content');
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

function request(pathname) {
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

    handleRequest({ method: 'GET', url: pathname, headers: {} }, response, '').catch(reject);
  });
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
