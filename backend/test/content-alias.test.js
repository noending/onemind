const test = require('node:test');
const assert = require('node:assert/strict');

const { contents, findContent } = require('../../common/content');

test('canonical great compassion ID resolves to the local long-mantra content for practice', () => {
  const content = findContent('great-compassion-opening');

  assert.equal(content.id, 'great-compassion-snippet');
  assert.equal(content.title, '大悲咒');
  assert.notEqual(content, contents[0]);
});
