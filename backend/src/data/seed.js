const GREAT_COMPASSION_SEGMENTS = [
  '南无喝啰怛那哆啰夜耶',
  '南无阿唎耶',
  '婆卢羯帝烁钵啰耶',
  '菩提萨埵婆耶',
  '摩诃萨埵婆耶',
  '摩诃迦卢尼迦耶',
  '唵',
  '萨皤啰罚曳',
  '数怛那怛写',
  '南无悉吉栗埵伊蒙阿唎耶',
  '婆卢吉帝室佛啰楞驮婆',
  '南无那啰谨墀',
  '醯唎摩诃皤哆沙咩',
  '萨婆阿他豆输朋',
  '阿逝孕',
  '萨婆萨哆那摩婆萨哆那摩婆伽',
  '摩罚特豆',
  '怛侄他',
  '唵阿婆卢醯',
  '卢迦帝',
  '迦罗帝',
  '夷醯唎',
  '摩诃菩提萨埵',
  '萨婆萨婆',
  '摩啰摩啰',
  '摩醯摩醯唎驮孕',
  '俱卢俱卢羯蒙',
  '度卢度卢罚阇耶帝',
  '摩诃罚阇耶帝',
  '陀啰陀啰',
  '地唎尼',
  '室佛啰耶',
  '遮啰遮啰',
  '摩么罚摩啰',
  '穆帝隶',
  '伊醯伊醯',
  '室那室那',
  '阿啰参佛啰舍利',
  '罚沙罚参',
  '佛啰舍耶',
  '呼卢呼卢摩啰',
  '呼卢呼卢醯利',
  '娑啰娑啰',
  '悉唎悉唎',
  '苏嚧苏嚧',
  '菩提夜菩提夜',
  '菩驮夜菩驮夜',
  '弥帝唎夜',
  '那啰谨墀',
  '地利瑟尼那',
  '波夜摩那',
  '娑婆诃',
  '悉陀夜',
  '娑婆诃',
  '摩诃悉陀夜',
  '娑婆诃',
  '悉陀喻艺',
  '室皤啰耶',
  '娑婆诃',
  '那啰谨墀',
  '娑婆诃',
  '摩啰那啰',
  '娑婆诃',
  '悉啰僧阿穆佉耶',
  '娑婆诃',
  '娑婆摩诃阿悉陀夜',
  '娑婆诃',
  '者吉啰阿悉陀夜',
  '娑婆诃',
  '波陀摩羯悉陀夜',
  '娑婆诃',
  '那啰谨墀皤伽啰耶',
  '娑婆诃',
  '摩婆利胜羯啰夜',
  '娑婆诃',
  '南无喝啰怛那哆啰夜耶',
  '南无阿唎耶',
  '婆嚧吉帝',
  '烁皤啰夜',
  '娑婆诃',
  '唵悉殿都',
  '漫多啰',
  '跋陀耶',
  '娑婆诃'
];

const GREAT_COMPASSION_BODY = GREAT_COMPASSION_SEGMENTS.join('，');

function buildGreatCompassionSection(sectionIndex, startIndex, endIndex) {
  return {
    id: `great-compassion-section-${sectionIndex}`,
    title: `第${sectionIndex}学习段`,
    sortOrder: sectionIndex,
    units: GREAT_COMPASSION_SEGMENTS.slice(startIndex, endIndex).map((text, offset) => ({
      id: `great-compassion-unit-${startIndex + offset + 1}`,
      text,
      pinyin: '',
      firstCharacterCue: Array.from(text)[0] || '',
      estimatedSeconds: 30,
      sortOrder: startIndex + offset + 1
    }))
  };
}

const GREAT_COMPASSION_SECTIONS = [
  buildGreatCompassionSection(1, 0, 14),
  buildGreatCompassionSection(2, 14, 28),
  buildGreatCompassionSection(3, 28, 42),
  buildGreatCompassionSection(4, 42, 56),
  buildGreatCompassionSection(5, 56, 70),
  buildGreatCompassionSection(6, 70, 84)
];

const contents = [
  {
    id: 'six-syllable-mantra',
    title: '六字大明咒',
    subtitle: '短咒',
    type: 'mantra',
    body: '唵 嘛呢 叭咪 吽',
    preview: '唵 嘛呢 叭咪 吽',
    lengthTier: 'short',
    planDays: 4,
    scene: '通勤路上 · 睡前持诵',
    segments: ['唵嘛呢叭咪吽'],
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
    planDays: 4,
    scene: '祈愿安顺 · 出行平安',
    segments: ['嗡达列都达列都列梭哈'],
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
    title: '大悲咒',
    subtitle: '长咒',
    type: 'sutra_segment',
    body: GREAT_COMPASSION_BODY,
    preview: '南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶，菩提萨埵婆耶。',
    lengthTier: 'long',
    planDays: 28,
    scene: '84 句分段 · 28 天科学背诵',
    segments: GREAT_COMPASSION_SEGMENTS,
    publishedVersion: {
      id: 'great-compassion-v1',
      versionNo: 1,
      reviewStatus: 'approved',
      sourceNote: '经人工校对的首发版本',
      versionNote: '首版 84 句学习结构'
    },
    sections: GREAT_COMPASSION_SECTIONS,
    defaultMode: 'scientific',
    supportedModes: ['scientific'],
    supportsRecitation: true,
    recommendedRecitationTime: 'morning',
    recitationTheme: '大悲咒全文读诵',
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
