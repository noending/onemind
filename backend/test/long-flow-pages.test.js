const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('long-content flow registers assessment and plan setup routes', () => {
  const app = JSON.parse(read('app.json'));

  assert.ok(app.pages.includes('pages/assessment/index'));
  assert.ok(app.pages.includes('pages/plan-setup/index'));
});

test('assessment page uses approved structure, stable keys, answers, and a compact setup URL', () => {
  const source = read('pages/assessment/index.js');
  const markup = read('pages/assessment/index.wxml');

  assert.match(source, /getContentStructureApi/);
  assert.match(source, /buildScopeOptions/);
  assert.match(source, /createMemoryAssessmentApi/);
  assert.match(source, /recommendMemoryPlanApi/);
  assert.match(source, /memoryUnitId/);
  assert.match(source, /revealed/);
  assert.match(source, /latencyMs/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /ensureLogin/);
  assert.match(source, /attemptId/);
  assert.match(source, /pendingTimedOut/);
  assert.match(source, /unitCount/);
  assert.match(source, /60/);
  assert.match(source, /assessmentId=/);
  assert.match(source, /contentId=/);
  assert.match(source, /versionId=/);
  assert.match(markup, /totalUnitCount/);
  assert.doesNotMatch(markup, /scopeOptions\.length/);
  assert.doesNotMatch(source, /plan-setup\/index\?[^`'"\n]*answers=/);
});

test('plan setup reads recommendation context, renders workload controls, and creates an adaptive plan once', () => {
  const source = read('pages/plan-setup/index.js');
  const markup = read('pages/plan-setup/index.wxml');

  assert.match(source, /getStorageSync/);
  assert.match(source, /buildRecommendationCards/);
  assert.match(source, /createMemoryPlanApi/);
  assert.match(source, /ensureLogin/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /isSubmitting/);
  assert.match(source, /fatalContextError/);
  assert.match(source, /submitError/);
  assert.match(source, /assessmentContext\.unitCount/);
  assert.match(source, /redirectTo\(\{[\s\S]*pages\/assessment\/index/);
  assert.match(source, /planId=/);
  assert.match(markup, /day-segmented/);
  assert.match(markup, /wx:for="\{\{cards\}\}"/);
  assert.match(markup, /完成首轮学习，之后继续长期复习/);
  assert.match(markup, /submitError/);
});

test('library canonicalizes the legacy long content ID before starting scientific assessment', () => {
  const source = read('pages/library/index.js');
  const markup = read('pages/library/index.wxml');

  assert.match(source, /great-compassion-snippet/);
  assert.match(source, /great-compassion-opening/);
  assert.match(source, /toCanonicalContentId/);
  assert.match(source, /lengthTier === ["']long["'].*mode === ["']scientific["']/s);
  assert.match(source, /closeSheet/);
  assert.match(source, /pages\/assessment\/index\?contentId=/);
  assert.match(source, /publishedVersionId/);
  assert.match(markup, /startRecitation/);
});

test('new long-content views do not introduce audio or play controls', () => {
  const sources = [
    read('pages/assessment/index.wxml'),
    read('pages/plan-setup/index.wxml')
  ].join('\n');

  assert.doesNotMatch(sources, /<audio\b|<video\b|bindtap=["'][^"']*play/i);
});
