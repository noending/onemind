const { PRODUCTS } = require('../../../common/products');

const products = PRODUCTS.map((item) => ({
  ...item,
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-15T02:30:00.000Z'
}));

const orders = [
  {
    id: 'order-demo-001',
    orderNo: 'OM202607150001',
    userId: 'demo-user',
    userNickname: 'Demo 用户',
    amount: 27.9,
    status: 'paid',
    paymentStatus: 'paid',
    paymentMethod: 'wechat_jsapi',
    items: [
      { productId: 'prod1', title: '观音法门 · 音频合辑', quantity: 1, unitPrice: 9.9 },
      { productId: 'prod2', title: '心经 · 梵唱合集', quantity: 1, unitPrice: 18 }
    ],
    createdAt: '2026-07-15T02:18:00.000Z',
    updatedAt: '2026-07-15T02:19:00.000Z'
  },
  {
    id: 'order-demo-002',
    orderNo: 'OM202607150002',
    userId: 'demo-user',
    userNickname: 'Demo 用户',
    amount: 12,
    status: 'pending',
    paymentStatus: 'unpaid',
    paymentMethod: 'wechat_jsapi',
    items: [
      { productId: 'prod7', title: '佛菩萨圣诞日历', quantity: 1, unitPrice: 12 }
    ],
    createdAt: '2026-07-15T03:05:00.000Z',
    updatedAt: '2026-07-15T03:05:00.000Z'
  }
];

module.exports = { products, orders };
