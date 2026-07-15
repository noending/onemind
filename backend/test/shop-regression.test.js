const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const storage = new Map();

global.wx = {
  getStorageSync(key) {
    return storage.has(key) ? storage.get(key) : '';
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  }
};

const shop = require('../../common/shop');
const { recommendPlan, allocateDailyUnits } = require('../../common/adaptive-memory');

test('adaptive learning operations do not mutate shop state', () => {
  shop.toggleFavoriteProduct('music-heart-sutra');
  shop.recordRecentViewProduct('thangka-green-tara');
  shop.addProductToCart('energy-painting-compassion');
  const before = JSON.stringify(shop.getShopState());

  recommendPlan({ unitCount: 84, familiarityLevel: 'partial', dailyMinutes: 15 });
  allocateDailyUnits({
    states: Array.from({ length: 84 }, (_, index) => ({
      memoryUnitId: `unit-${index + 1}`,
      phase: 'new'
    })),
    date: '2026-07-10',
    dailyMinutes: 15,
    targetDays: 14
  });

  assert.equal(JSON.stringify(shop.getShopState()), before);
});

test('app registration and tab bar retain the shop route', () => {
  const root = path.resolve(__dirname, '..', '..');
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const tabbarSource = fs.readFileSync(path.join(root, 'components/app-tabbar/index.js'), 'utf8');

  assert.ok(appConfig.pages.includes('pages/shop/index'));
  assert.match(tabbarSource, /key:\s*["']shop["'][\s\S]*?url:\s*["']\/pages\/shop\/index["']/);
});
