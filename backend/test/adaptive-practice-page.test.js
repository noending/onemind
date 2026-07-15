const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('adaptive practice detects an adaptive plan before requesting the signed-in daily task', () => {
  const source = read('pages/practice/index.js');

  assert.match(source, /ensureLogin/);
  assert.match(source, /getTodayStudyTaskApi/);
  assert.match(source, /completeStudyTaskItemApi/);
  assert.match(source, /status\s*===\s*["']pending["']/);
  assert.match(source, /isBackendEnabled/);
  assert.match(source, /isAdaptivePlan\(localPlan\)/);
  assert.match(source, /syncPlansFromBackend/);
  assert.match(source, /setupLegacyPractice/);
  assert.doesNotMatch(source, /getTodayStudyTaskApi\(planId,\s*todayDate\(\)\)/);
});

test('adaptive practice has the approved session controls and grades only', () => {
  const markup = read('pages/practice/index.wxml');
  const source = read('pages/practice/index.js');

  assert.match(source, /createPracticeSession/);
  assert.match(source, /advancePracticeStep/);
  assert.match(source, /完整学习/);
  assert.match(source, /首字提示/);
  assert.match(source, /自由回忆/);
  assert.match(markup, /完成学习/);
  assert.match(markup, /显示答案/);
  assert.match(markup, /标记一处错误/);
  assert.match(markup, /需加强/);
  assert.match(markup, /基本记得/);
  assert.match(markup, /流畅复现/);
  assert.match(markup, /adaptiveSession\.step === 'first_character' \|\| adaptiveSession\.step === 'free_recall'/);
  assert.match(source, /!\["first_character", "free_recall"\]\.includes\(session\.step\)/);
  const adaptiveMarkup = markup.slice(
    markup.indexOf('<block wx:if="{{adaptiveMode}}">'),
    markup.indexOf('<block wx:else>')
  );
  assert.doesNotMatch(adaptiveMarkup, /已掌握|segment-audio|♫/);
});

test('adaptive submission reports measured metrics with a stable bounded key and rebuilds from server', () => {
  const source = read('pages/practice/index.js');

  assert.match(source, /latencyMs/);
  assert.match(source, /mistakeCount/);
  assert.match(source, /hintCount/);
  assert.doesNotMatch(source, /reviewedAt/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /slice\(0,\s*180\)/);
  assert.match(source, /response\.task/);
  assert.match(source, /const taskWithPendingItems = pendingTask\(task\)/);
  assert.match(source, /createPracticeSession\(taskWithPendingItems/);
  assert.match(source, /phase\s*===\s*["']stable["']/);
  assert.match(source, /retryAdaptiveGrade/);
});
