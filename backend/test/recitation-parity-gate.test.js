const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const gateUrl = pathToFileURL(path.join(root, 'tools/check-recitation-parity.mjs')).href;

test('no-playback gate rejects every built-in fixture and accepts production sources', async (t) => {
  const gate = await import(gateUrl);

  assert.equal(typeof gate.detectPlaybackViolations, 'function');
  assert.ok(Array.isArray(gate.PLAYBACK_NEGATIVE_FIXTURES));
  assert.ok(gate.PLAYBACK_NEGATIVE_FIXTURES.length >= 12);

  for (const fixture of gate.PLAYBACK_NEGATIVE_FIXTURES) {
    await t.test(fixture.id, () => {
      const violations = gate.detectPlaybackViolations({ fixture: fixture.source });
      assert.equal(typeof fixture.expectedRuleId, 'string');
      assert.ok(
        violations.some((violation) => violation.ruleId === fixture.expectedRuleId),
        `fixture did not trigger ${fixture.expectedRuleId}: ${fixture.id}`
      );
    });
  }

  assert.deepEqual(gate.runPlaybackGateSelfCheck(), {
    passed: true,
    failedFixtureIds: []
  });

  const productionSources = {
    js: fs.readFileSync(path.join(root, 'pages/recitation/index.js'), 'utf8'),
    wxml: fs.readFileSync(path.join(root, 'pages/recitation/index.wxml'), 'utf8'),
    wxss: fs.readFileSync(path.join(root, 'pages/recitation/index.wxss'), 'utf8')
  };
  assert.deepEqual(gate.detectPlaybackViolations(productionSources), []);
});

test('no-playback gate is case-insensitive without matching ordinary Chinese copy', async () => {
  const gate = await import(gateUrl);

  assert.ok(gate.detectPlaybackViolations({ js: 'WX.CREATEINNERAUDIOCONTEXT()' }).length > 0);
  assert.deepEqual(gate.detectPlaybackViolations({
    wxml: '<text>暂停片刻，停止杂念；播放功能不属于本阶段范围。</text>'
  }), []);
});

test('no-playback gate recognizes manager event APIs and colon-style bindings', async () => {
  const gate = await import(gateUrl);
  const cases = [
    { source: 'player.onTimeUpdate(syncProgress);', expectedRuleId: 'audio-event-method-call' },
    { source: 'player.onPlay(handlePlay);', expectedRuleId: 'audio-event-method-call' },
    { source: '<video bind:timeupdate="onTimeUpdate"></video>', expectedRuleId: 'audio-event-binding' },
    { source: '<button bind:tap="togglePlayback">开始</button>', expectedRuleId: 'playback-control-binding' }
  ];

  cases.forEach(({ source, expectedRuleId }) => {
    assert.ok(
      gate.detectPlaybackViolations({ fixture: source })
        .some((violation) => violation.ruleId === expectedRuleId),
      `${expectedRuleId} did not reject ${source}`
    );
  });
});
