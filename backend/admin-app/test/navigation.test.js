import test from 'node:test';
import assert from 'node:assert/strict';

import { NAV_GROUPS, findRoute } from '../src/app/navigation.js';

const REQUIRED_ROUTES = [
  'overview',
  'contents',
  'festivals',
  'assets',
  'users',
  'plans',
  'practice',
  'recitation',
  'products',
  'orders',
  'notifications',
  'organizations',
  'audit',
  'settings'
];

test('admin navigation exposes every mini-program-aligned module once', () => {
  const routes = NAV_GROUPS.flatMap((group) => group.items);
  const ids = routes.map((route) => route.id);

  assert.deepEqual([...new Set(ids)].sort(), [...REQUIRED_ROUTES].sort());
  REQUIRED_ROUTES.forEach((routeId) => {
    const route = findRoute(routeId);
    assert.equal(route.id, routeId);
    assert.ok(route.label);
    assert.ok(route.description);
  });
});

test('mutation-heavy modules declare their required permission', () => {
  assert.equal(findRoute('contents').permission, 'content.write');
  assert.equal(findRoute('products').permission, 'commerce.write');
  assert.equal(findRoute('orders').permission, 'commerce.order.manage');
  assert.equal(findRoute('notifications').permission, 'notification.dispatch');
  assert.equal(findRoute('organizations').permission, 'organization.member.manage');
});
