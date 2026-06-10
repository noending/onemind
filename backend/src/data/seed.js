const contents = [
  {
    id: 'six-syllable-mantra',
    title: '六字大明咒',
    subtitle: '短咒',
    type: 'mantra',
    body: '唵 嘛呢 叭咪 吽',
    preview: '唵 嘛呢 叭咪 吽',
    lengthTier: 'short',
    planDays: 1,
    scene: '通勤路上 · 睡前持诵',
    segments: ['唵', '嘛呢', '叭咪', '吽'],
    accessLevel: 'public',
    publishStatus: 'published'
  },
  {
    id: 'green-tara-mantra',
    title: '绿度母心咒',
    subtitle: '短咒',
    type: 'mantra',
    body: '嗡 达列 都达列 都列 梭哈',
    preview: '嗡 达列 都达列 都列 梭哈',
    lengthTier: 'short',
    planDays: 2,
    scene: '祈愿安顺 · 出行平安',
    segments: ['嗡', '达列', '都达列', '都列', '梭哈'],
    accessLevel: 'public',
    publishStatus: 'published'
  },
  {
    id: 'diamond-sutra-ending',
    title: '金刚经·结尾偈',
    subtitle: '经文片段',
    type: 'sutra_segment',
    body: '一切有为法，如梦幻泡影，如露亦如电，应作如是观。',
    preview: '一切有为法，如梦幻泡影，如露亦如电，应作如是观。',
    lengthTier: 'medium',
    planDays: 4,
    scene: '观照无常 · 放下执着',
    segments: ['一切有为法', '如梦幻泡影', '如露亦如电', '应作如是观'],
    accessLevel: 'public',
    publishStatus: 'published'
  },
  {
    id: 'heart-sutra-core',
    title: '心经·核心段',
    subtitle: '经文片段',
    type: 'sutra_segment',
    body: '色不异空，空不异色，色即是空，空即是色，受想行识，亦复如是。',
    preview: '色不异空，空不异色，色即是空，空即是色，受想行识，亦复如是。',
    lengthTier: 'medium',
    planDays: 5,
    scene: '晨课静坐 · 心绪烦乱时',
    segments: ['色不异空', '空不异色', '色即是空', '空即是色', '受想行识，亦复如是'],
    accessLevel: 'public',
    publishStatus: 'published'
  },
  {
    id: 'great-compassion-opening',
    title: '大悲咒·开头段',
    subtitle: '经文片段',
    type: 'sutra_segment',
    body: '南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶。',
    preview: '南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶。',
    lengthTier: 'long',
    planDays: 10,
    scene: '慈悲发愿 · 长期修持',
    segments: ['南无', '喝啰怛那', '哆啰夜耶', '南无', '阿唎耶', '婆卢羯帝', '烁钵啰耶'],
    accessLevel: 'public',
    publishStatus: 'published'
  }
];

const festivals = [
  {
    id: 'guanyin-birthday',
    name: '观音菩萨圣诞',
    lunarDate: '农历二月十九',
    relatedFigure: '观世音菩萨',
    description: '适合诵持观音法门相关经咒，发起慈悲与利他之心。',
    recommendedContentIds: ['six-syllable-mantra', 'great-compassion-opening']
  },
  {
    id: 'medicine-buddha-birthday',
    name: '药师佛圣诞',
    lunarDate: '农历九月三十',
    relatedFigure: '药师琉璃光如来',
    description: '适合修持药师法门，祈愿身心安稳、病苦消融。',
    recommendedContentIds: ['green-tara-mantra']
  }
];

const organizations = [
  {
    id: 'org-demo-dharma',
    name: '一念法藏示范空间',
    type: 'dharma_group',
    status: 'active'
  }
];

const organizationMembers = [
  {
    id: 'member-demo-admin',
    organizationId: 'org-demo-dharma',
    userId: 'demo-user',
    role: 'organization_admin',
    status: 'active',
    joinedAt: '2026-05-25T00:00:00.000Z'
  }
];

const assets = [
  {
    id: 'asset-heart-audio',
    organizationId: 'org-demo-dharma',
    title: '心经·梵唱合集',
    type: 'audio',
    url: 'storage://demo/audio/heart-sutra-chant.mp3',
    thumbnailUrl: '/assets/music-heart.jpg',
    accessLevel: 'public',
    publishStatus: 'published',
    copyrightStatus: 'authorized'
  },
  {
    id: 'asset-guanyin-thangka',
    organizationId: 'org-demo-dharma',
    title: '观音唐卡高清原图',
    type: 'image',
    url: 'storage://demo/image/guanyin-thangka-origin.jpg',
    thumbnailUrl: '/assets/thangka-tara.jpg',
    accessLevel: 'restricted',
    publishStatus: 'published',
    copyrightStatus: 'internal_authorized'
  },
  {
    id: 'asset-private-ritual',
    organizationId: 'org-demo-dharma',
    title: '内部仪轨备份文档',
    type: 'document',
    url: 'storage://demo/document/internal-ritual.pdf',
    thumbnailUrl: null,
    accessLevel: 'private',
    publishStatus: 'published',
    copyrightStatus: 'organization_owned'
  }
];

const auditLogs = [
  {
    id: 'audit-demo-asset-import',
    actorType: 'admin_user',
    actorId: 'system',
    organizationId: 'org-demo-dharma',
    action: 'asset.imported',
    targetType: 'asset',
    targetId: 'asset-guanyin-thangka',
    detail: {
      accessLevel: 'restricted'
    },
    createdAt: '2026-05-25T00:00:00.000Z'
  }
];

module.exports = {
  contents,
  festivals,
  organizations,
  organizationMembers,
  assets,
  auditLogs
};
