export const NAV_GROUPS = [
  {
    id: 'core',
    label: '',
    items: [
      { id: 'overview', label: '运营总览', description: '关键指标、待办与业务动态', icon: 'House' }
    ]
  },
  {
    id: 'practice-ops',
    label: '修学运营',
    items: [
      { id: 'contents', label: '内容库', description: '经咒内容、模式与版本', icon: 'BookOpenText', permission: 'content.write' },
      { id: 'festivals', label: '节日专题', description: '节日内容与首页推荐', icon: 'CalendarDots', permission: 'content.write' },
      { id: 'assets', label: '数字资产', description: '音频、图片与文档权限', icon: 'ArchiveBox', permission: 'asset.write' }
    ]
  },
  {
    id: 'learning-data',
    label: '学习数据',
    items: [
      { id: 'users', label: '用户', description: '用户身份与修学状态', icon: 'UsersThree' },
      { id: 'plans', label: '记忆计划', description: '科学与趣味计划运行情况', icon: 'Brain' },
      { id: 'practice', label: '训练记录', description: '训练结果与薄弱点', icon: 'ListChecks' },
      { id: 'recitation', label: '日常读诵', description: '读诵目标、轮次与连续性', icon: 'BookBookmark' }
    ]
  },
  {
    id: 'commerce',
    label: '商城运营',
    items: [
      { id: 'products', label: '商品', description: '商品目录、价格与上下架', icon: 'Handbag', permission: 'commerce.write' },
      { id: 'orders', label: '订单', description: '订单处理与支付状态', icon: 'Receipt', permission: 'commerce.order.manage' }
    ]
  },
  {
    id: 'governance',
    label: '触达与治理',
    items: [
      { id: 'notifications', label: '通知任务', description: '订阅消息任务与派发', icon: 'PaperPlaneTilt', permission: 'notification.dispatch' },
      { id: 'organizations', label: '组织成员', description: '组织、成员与角色权限', icon: 'Buildings', permission: 'organization.member.manage' },
      { id: 'audit', label: '审计日志', description: '敏感操作与变更追踪', icon: 'Scroll' },
      { id: 'settings', label: '系统设置', description: '服务状态与能力配置', icon: 'GearSix' }
    ]
  }
];

const ROUTES = NAV_GROUPS.flatMap((group) => group.items);

export function findRoute(routeId) {
  return ROUTES.find((route) => route.id === routeId) || ROUTES[0];
}

export function routeFromHash(hash = '') {
  const routeId = String(hash || '').replace(/^#\/?/, '').split('/')[0];
  return findRoute(routeId).id;
}

export function routeToHash(routeId) {
  return `#/${findRoute(routeId).id}`;
}
