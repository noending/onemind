const GREAT_COMPASSION_SEGMENTS = [
  "南无喝啰怛那哆啰夜耶",
  "南无阿唎耶",
  "婆卢羯帝烁钵啰耶",
  "菩提萨埵婆耶",
  "摩诃萨埵婆耶",
  "摩诃迦卢尼迦耶",
  "唵",
  "萨皤啰罚曳",
  "数怛那怛写",
  "南无悉吉栗埵伊蒙阿唎耶",
  "婆卢吉帝室佛啰楞驮婆",
  "南无那啰谨墀",
  "醯唎摩诃皤哆沙咩",
  "萨婆阿他豆输朋",
  "阿逝孕",
  "萨婆萨哆那摩婆萨哆那摩婆伽",
  "摩罚特豆",
  "怛侄他",
  "唵阿婆卢醯",
  "卢迦帝",
  "迦罗帝",
  "夷醯唎",
  "摩诃菩提萨埵",
  "萨婆萨婆",
  "摩啰摩啰",
  "摩醯摩醯唎驮孕",
  "俱卢俱卢羯蒙",
  "度卢度卢罚阇耶帝",
  "摩诃罚阇耶帝",
  "陀啰陀啰",
  "地唎尼",
  "室佛啰耶",
  "遮啰遮啰",
  "摩么罚摩啰",
  "穆帝隶",
  "伊醯伊醯",
  "室那室那",
  "阿啰参佛啰舍利",
  "罚沙罚参",
  "佛啰舍耶",
  "呼卢呼卢摩啰",
  "呼卢呼卢醯利",
  "娑啰娑啰",
  "悉唎悉唎",
  "苏嚧苏嚧",
  "菩提夜菩提夜",
  "菩驮夜菩驮夜",
  "弥帝唎夜",
  "那啰谨墀",
  "地利瑟尼那",
  "波夜摩那",
  "娑婆诃",
  "悉陀夜",
  "娑婆诃",
  "摩诃悉陀夜",
  "娑婆诃",
  "悉陀喻艺",
  "室皤啰耶",
  "娑婆诃",
  "那啰谨墀",
  "娑婆诃",
  "摩啰那啰",
  "娑婆诃",
  "悉啰僧阿穆佉耶",
  "娑婆诃",
  "娑婆摩诃阿悉陀夜",
  "娑婆诃",
  "者吉啰阿悉陀夜",
  "娑婆诃",
  "波陀摩羯悉陀夜",
  "娑婆诃",
  "那啰谨墀皤伽啰耶",
  "娑婆诃",
  "摩婆利胜羯啰夜",
  "娑婆诃",
  "南无喝啰怛那哆啰夜耶",
  "南无阿唎耶",
  "婆嚧吉帝",
  "烁皤啰夜",
  "娑婆诃",
  "唵悉殿都",
  "漫多啰",
  "跋陀耶",
  "娑婆诃"
];

const GREAT_COMPASSION_BODY = GREAT_COMPASSION_SEGMENTS.join("，");

function buildGreatCompassionSection(sectionIndex, startIndex, endIndex) {
  return {
    id: `great-compassion-section-${sectionIndex}`,
    title: `第${sectionIndex}学习段`,
    sortOrder: sectionIndex,
    units: GREAT_COMPASSION_SEGMENTS.slice(startIndex, endIndex).map((text, offset) => ({
      id: `great-compassion-unit-${startIndex + offset + 1}`,
      text,
      pinyin: "",
      firstCharacterCue: Array.from(text)[0] || "",
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
    id: "om-mani",
    title: "六字大明咒",
    category: "短咒",
    body: "唵 嘛呢 叭咪 吽",
    preview: "唵 嘛呢 叭咪 吽",
    segments: ["唵嘛呢叭咪吽"],
    pinyinSegments: ["ōng mā ní bā mī hōng"],
    lengthTier: "short",
    lengthLevel: "short",
    planDays: 4,
    lengthLabel: "长度 短",
    scene: "通勤路上 · 睡前持诵",
    hasAudio: true,
    accessLevel: "public"
  },
  {
    id: "green-tara",
    title: "绿度母心咒",
    category: "短咒",
    body: "嗡 达列 都达列 都列 梭哈",
    preview: "嗡 达列 都达列 都列 梭哈",
    segments: ["嗡达列都达列都列梭哈"],
    pinyinSegments: ["ōng dá liè dū dá liè dū liè suō hā"],
    lengthTier: "short",
    lengthLevel: "short",
    planDays: 4,
    lengthLabel: "长度 短",
    scene: "祈愿安顺 · 出行平安",
    hasAudio: true,
    accessLevel: "public"
  },
  {
    id: "medicine-buddha",
    title: "药师灌顶真言（简）",
    category: "短咒",
    body: "嗡 鞞杀逝 鞞杀逝 鞞杀社 三没揭帝 莎诃",
    preview: "嗡 鞞杀逝 鞞杀逝 鞞杀社 三没揭帝 莎诃",
    segments: ["嗡鞞杀逝鞞杀逝", "鞞杀社", "三没揭帝莎诃"],
    pinyinSegments: ["ōng pí shā shì pí shā shì", "pí shā shè", "sān mò jiē dì suō hē"],
    lengthTier: "medium",
    lengthLevel: "medium",
    planDays: 4,
    lengthLabel: "长度 中",
    festival: "药师佛圣诞",
    festivalTag: "药师佛圣诞",
    scene: "身心调养 · 病中回向",
    hasAudio: true,
    accessLevel: "public"
  },
  {
    id: "heart-sutra-core",
    title: "心经·核心段",
    category: "经文片段",
    body: "色不异空，空不异色，色即是空，空即是色，受想行识，亦复如是。",
    preview: "色不异空，空不异色，色即是空，空即是色，受想行识，亦复如是。",
    segments: ["色不异空", "空不异色", "色即是空", "空即是色", "受想行识，亦复如是。"],
    pinyinSegments: ["sè bù yì kōng", "kōng bù yì sè", "sè jí shì kōng", "kōng jí shì sè", "shòu xiǎng xíng shí, yì fù rú shì"],
    lengthTier: "medium",
    lengthLevel: "medium",
    planDays: 5,
    lengthLabel: "长度 中",
    scene: "晨课静坐 · 心绪烦乱时",
    hasAudio: true,
    accessLevel: "public"
  },
  {
    id: "four-vows",
    title: "四弘誓愿",
    category: "短偈",
    body: "众生无边誓愿度，烦恼无尽誓愿断，法门无量誓愿学，佛道无上誓愿成。",
    preview: "众生无边誓愿度，烦恼无尽誓愿断，法门无量誓愿学，佛道无上誓愿成。",
    segments: ["众生无边誓愿度", "烦恼无尽誓愿断", "法门无量誓愿学", "佛道无上誓愿成"],
    pinyinSegments: ["zhòng shēng wú biān shì yuàn dù", "fán nǎo wú jìn shì yuàn duàn", "fǎ mén wú liàng shì yuàn xué", "fó dào wú shàng shì yuàn chéng"],
    lengthTier: "medium",
    lengthLevel: "medium",
    planDays: 3,
    lengthLabel: "长度 中",
    scene: "发心 · 修行立志",
    hasAudio: false,
    accessLevel: "public"
  },
  {
    id: "amitabha",
    title: "阿弥陀佛圣号",
    category: "短咒",
    body: "南无阿弥陀佛",
    preview: "南无阿弥陀佛",
    segments: ["南无阿弥陀佛"],
    pinyinSegments: ["ná mó ā mí tuó fó"],
    lengthTier: "short",
    lengthLevel: "short",
    planDays: 4,
    lengthLabel: "长度 短",
    scene: "日常持名 · 静心安神",
    hasAudio: true,
    accessLevel: "public"
  },
  {
    id: "diamond-end",
    title: "金刚经·结尾偈",
    category: "经文片段",
    body: "一切有为法，如梦幻泡影，如露亦如电，应作如是观。",
    preview: "一切有为法，如梦幻泡影，如露亦如电，应作如是观。",
    segments: ["一切有为法", "如梦幻泡影", "如露亦如电", "应作如是观"],
    pinyinSegments: ["yī qiè yǒu wéi fǎ", "rú mèng huàn pào yǐng", "rú lù yì rú diàn", "yīng zuò rú shì guān"],
    lengthTier: "medium",
    lengthLevel: "medium",
    planDays: 4,
    lengthLabel: "长度 中",
    scene: "观照无常 · 放下执着",
    hasAudio: true,
    accessLevel: "public"
  },
  {
    id: "great-compassion-snippet",
    title: "大悲咒",
    category: "长咒",
    body: GREAT_COMPASSION_BODY,
    preview: "南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶，菩提萨埵婆耶。",
    segments: GREAT_COMPASSION_SEGMENTS,
    pinyinSegments: [],
    publishedVersionId: "great-compassion-v1",
    sourceNote: "经人工校对的首发版本",
    versionNote: "首版 84 句学习结构",
    reviewStatus: "approved",
    sections: GREAT_COMPASSION_SECTIONS,
    lengthTier: "long",
    lengthLevel: "long",
    planDays: 28,
    lengthLabel: "长度 长",
    festival: "观音菩萨圣诞",
    festivalTag: "观音菩萨圣诞",
    scene: "84 句分段 · 28 天科学背诵",
    hasAudio: false,
    defaultMode: "scientific",
    supportedModes: ["scientific"],
    supportsRecitation: true,
    recommendedRecitationTime: "morning",
    recitationTheme: "大悲咒全文读诵",
    accessLevel: "public"
  }
];

const festivals = [
  {
    id: "guanyin-birth",
    name: "观音菩萨圣诞",
    date: "农历二月十九",
    deity: "观世音菩萨",
    contentIds: ["great-compassion-snippet", "om-mani"],
    reason: "今日忆念观音菩萨愿力，持诵大悲咒与六字大明，可与慈悲相应。"
  },
  {
    id: "medicine-buddha-day",
    name: "药师佛圣诞",
    date: "农历九月三十",
    deity: "药师琉璃光如来",
    contentIds: ["medicine-buddha"],
    reason: "药师佛愿力消除病苦，今日持药师真言为自他祈愿身心安康。"
  }
];

const todayReviews = [
  { id: "om-mani", title: "六字大明咒", category: "短咒", meta: "第 1/4 天 · 拆段跟读", body: "唵 嘛呢 叭咪 吽" },
  { id: "diamond-end", title: "金刚经·结尾偈", category: "经文片段", meta: "第 1/4 天 · 拆段跟读", body: "一切有为法，如梦幻泡影，如露亦如电，应作如是观。" },
  { id: "great-compassion-snippet", title: "大悲咒", category: "长咒", meta: "第 1/28 天 · 拆段跟读", body: "南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶。" }
];

const progressItems = {
  reviewing: [
    { id: "om-mani", title: "六字大明咒", scene: "通勤路上 · 睡前持诵", current: 1, total: 4 },
    { id: "diamond-end", title: "金刚经·结尾偈", scene: "观照无常 · 放下执着", current: 0, total: 4 },
    { id: "great-compassion-snippet", title: "大悲咒", scene: "84 句分段 · 28 天科学背诵", current: 0, total: 28 }
  ],
  atRisk: [],
  mastered: []
};

const CONTENT_ID_ALIASES = {
  "great-compassion-opening": "great-compassion-snippet"
};

function findContent(id) {
  const canonicalId = CONTENT_ID_ALIASES[id] || id;
  return contents.find((item) => item.id === canonicalId);
}

function getApprovedContentStructure(contentId, versionId) {
  const content = findContent(contentId);
  if (
    !content ||
    content.reviewStatus !== "approved" ||
    content.publishedVersionId !== versionId ||
    !Array.isArray(content.sections)
  ) {
    return null;
  }

  return {
    contentId,
    contentVersionId: versionId,
    reviewStatus: content.reviewStatus,
    sourceNote: content.sourceNote || "",
    versionNote: content.versionNote || "",
    sections: content.sections.map((section) => ({
      ...section,
      units: Array.isArray(section.units)
        ? section.units.map((unit) => ({ ...unit }))
        : []
    }))
  };
}

function recommendNext(currentId) {
  const current = findContent(currentId);
  if (!current) return contents[0];
  return contents.find((item) => item.id !== currentId && item.category === current.category)
    || contents.find((item) => item.id !== currentId);
}

module.exports = {
  contents,
  festivals,
  todayReviews,
  progressItems,
  findContent,
  getApprovedContentStructure,
  recommendNext
};
