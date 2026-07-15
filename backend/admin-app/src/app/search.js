function rows(value) {
  return Array.isArray(value) ? value : [];
}

function item(route, record, title, meta) {
  return {
    id: `${route}:${record.id || record.orderNo || title}`,
    route,
    title: String(title || '未命名'),
    meta: String(meta || '')
  };
}

export function buildAdminSearchIndex(data = {}) {
  return [
    ...rows(data.contents).map((record) => item('contents', record, record.title, `内容 · ${record.type || '经文'}`)),
    ...rows(data.festivals).map((record) => item('festivals', record, record.name, `节日专题 · ${record.lunarDate || ''}`)),
    ...rows(data.assets).map((record) => item('assets', record, record.title, `数字资产 · ${record.type || ''}`)),
    ...rows(data.users).map((record) => item('users', record, record.nickname || record.id, `用户 · ${record.id || ''}`)),
    ...rows(data.plans).map((record) => item('plans', record, record.contentTitle || record.title, `记忆计划 · ${record.userNickname || record.userId || ''}`)),
    ...rows(data.practice).map((record) => item('practice', record, record.contentTitle, `训练记录 · ${record.userNickname || record.userId || ''}`)),
    ...rows(data.recitation).map((record) => item('recitation', record, record.contentTitle, `日常读诵 · ${record.userNickname || record.userId || ''}`)),
    ...rows(data.products).map((record) => item('products', record, record.title, `商品 · ${record.category || ''}`)),
    ...rows(data.orders).map((record) => item('orders', record, record.orderNo, `订单 · ${record.userNickname || record.userId || ''}`)),
    ...rows(data.notifications).map((record) => item('notifications', record, record.title || record.payload?.title || '学习提醒', `通知任务 · ${record.userNickname || record.userId || ''}`))
  ];
}

export function searchAdminIndex(index, query, limit = 6) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return [];

  return rows(index)
    .map((entry, position) => {
      const title = String(entry.title || '').toLowerCase();
      const meta = String(entry.meta || '').toLowerCase();
      const score = title.startsWith(normalized)
        ? 0
        : title.includes(normalized)
          ? 1
          : meta.includes(normalized)
            ? 2
            : -1;
      return { entry, position, score };
    })
    .filter(({ score }) => score >= 0)
    .sort((left, right) => left.score - right.score || left.position - right.position)
    .slice(0, Math.max(1, Number(limit) || 6))
    .map(({ entry }) => entry);
}
