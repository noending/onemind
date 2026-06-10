const contents = [
  {
    id: "om-mani",
    title: "六字大明咒",
    category: "短咒",
    body: "唵 嘛呢 叭咪 吽",
    preview: "唵 嘛呢 叭咪 吽",
    segments: ["唵", "嘛呢", "叭咪", "吽"],
    lengthTier: "short",
    lengthLevel: "short",
    planDays: 1,
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
    segments: ["嗡", "达列", "都达列", "都列", "梭哈"],
    lengthTier: "short",
    lengthLevel: "short",
    planDays: 2,
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
    segments: ["嗡 鞞杀逝", "鞞杀逝", "鞞杀社", "三没揭帝", "莎诃"],
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
    segments: ["南无", "阿弥陀佛"],
    lengthTier: "short",
    lengthLevel: "short",
    planDays: 1,
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
    title: "大悲咒·开头段",
    category: "经文片段",
    body: "南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶。",
    preview: "南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶。",
    segments: ["南无", "喝啰怛那", "哆啰夜耶", "南无", "阿唎耶", "婆卢羯帝", "烁钵啰耶"],
    lengthTier: "long",
    lengthLevel: "long",
    planDays: 10,
    lengthLabel: "长度 长",
    festival: "观音菩萨圣诞",
    festivalTag: "观音菩萨圣诞",
    scene: "慈悲发愿 · 长期修持",
    hasAudio: true,
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
  { id: "om-mani", title: "六字大明咒", category: "短咒", meta: "第 1/1 天 · 拆段跟读", body: "唵 嘛呢 叭咪 吽" },
  { id: "diamond-end", title: "金刚经·结尾偈", category: "经文片段", meta: "第 1/4 天 · 拆段跟读", body: "一切有为法，如梦幻泡影，如露亦如电，应作如是观。" },
  { id: "great-compassion-snippet", title: "大悲咒·开头段", category: "经文片段", meta: "第 1/10 天 · 拆段跟读", body: "南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶。" }
];

const progressItems = {
  reviewing: [
    { id: "diamond-end", title: "金刚经·结尾偈", scene: "观照无常 · 放下执着", current: 0, total: 4 },
    { id: "great-compassion-snippet", title: "大悲咒·开头段", scene: "慈悲发愿 · 长期修持", current: 0, total: 10 }
  ],
  atRisk: [],
  mastered: [
    { id: "om-mani", title: "六字大明咒", scene: "通勤路上 · 睡前持诵", current: 1, total: 1 }
  ]
};

function findContent(id) {
  return contents.find((item) => item.id === id);
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
  recommendNext
};
