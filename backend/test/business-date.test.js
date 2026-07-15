const test = require('node:test');
const assert = require('node:assert/strict');

const { BUSINESS_TIME_ZONE, businessDate } = require('../../common/business-date');

test('business date changes at Asia Shanghai midnight independent of UTC date', () => {
  assert.equal(BUSINESS_TIME_ZONE, 'Asia/Shanghai');
  assert.equal(businessDate(new Date('2026-07-11T15:59:59.999Z')), '2026-07-11');
  assert.equal(businessDate(new Date('2026-07-11T16:00:00.000Z')), '2026-07-12');
});

test('business date accepts an injected instant for deterministic tests', () => {
  assert.equal(businessDate('2026-12-31T16:00:00.000Z'), '2027-01-01');
});
