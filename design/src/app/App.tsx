import { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  Home, BookOpen, ShoppingBag, User, ChevronRight, Flame, Sparkles,
  RotateCw, AlertTriangle, CheckCircle2, Clock, Play, Pause, Trash2, MoreHorizontal,
  X, ArrowLeft, ArrowRight, Eye, EyeOff, Volume2, Check, Star,
  TrendingUp, Package, Settings, BookMarked, ShoppingCart, Plus, Minus, CreditCard,
  SkipBack, SkipForward, Repeat, FileText, Heart, Share2,
  Award, Info, ChevronDown
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Area, AreaChart } from "recharts";

/* ===================== TYPES & DATA ===================== */
type Tab = "today" | "browse" | "shop" | "mine";
type Status = "reviewing" | "risk" | "done";

type ContentItem = {
  id: string;
  type: "短咒" | "短偈" | "经文片段" | "长咒";
  len: "短" | "中" | "长";
  title: string;
  body: string;
  segments: string[];
  scene: string;
  festival?: string;
  planDays: number;
  seriesId?: string;
  seriesOrder?: number;
  seriesTotal?: number;
  seriesTitle?: string;
};

type SeriesMeta = {
  id: string;
  title: string;
  subtitle: string;
  total: number;
  desc: string;
  scene: string;
};

const SERIES: Record<string, SeriesMeta> = {
  dabeizhou: {
    id: "dabeizhou",
    title: "大悲咒",
    subtitle: "千手千眼观世音菩萨广大圆满无碍大悲心陀罗尼",
    total: 8,
    desc: "全文84句，分8节循序背诵，每节背会后可继续下一节",
    scene: "慈悲发愿 · 长期修持",
  },
};

type Plan = {
  id: string;
  contentId: string;
  totalDays: number;
  currentDay: number;
  status: Status;
  dueToday: boolean;
};

type ShopProduct = {
  id: string;
  category: "经文音频" | "唐卡 · 壁纸" | "图鉴";
  tag: string;
  title: string;
  subtitle: string;
  price: number;
  originalPrice?: number;
  color: string;
  description: string;
  features: string[];
  isFeatured?: boolean;
};

type CartItem = {
  productId: string;
  quantity: number;
};

type Order = {
  id: string;
  title: string;
  date: string;
  price: string;
  status: "待支付" | "处理中" | "已完成" | "已取消";
  color: string;
  items: { productId: string; quantity: number; price: number }[];
  paymentMethod?: string;
  orderNumber?: string;
};

const CONTENT: ContentItem[] = [
  {
    id: "c1", type: "短咒", len: "短",
    title: "六字大明咒",
    body: "唵 嘛呢 叭咪 吽",
    segments: ["唵", "嘛呢", "叭咪", "吽"],
    scene: "通勤路上 · 睡前持诵",
    planDays: 1,
  },
  {
    id: "c2", type: "经文片段", len: "中",
    title: "金刚经 · 结尾偈",
    body: "一切有为法，如梦幻泡影，如露亦如电，应作如是观。",
    segments: ["一切有为法", "如梦幻泡影", "如露亦如电", "应作如是观"],
    scene: "观照无常 · 放下执着",
    planDays: 4,
  },
  {
    id: "c_db1", type: "长咒", len: "长",
    title: "大悲咒 · 第1节",
    body: "南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢羯帝烁钵啰耶，菩提萨埵婆耶，摩诃萨埵婆耶，摩诃迦卢尼迦耶，唵，萨皤啰罚曳，数怛那怛写，南无悉吉栗埵伊蒙阿唎耶。",
    segments: ["南无喝啰怛那哆啰夜耶", "南无阿唎耶", "婆卢羯帝烁钵啰耶", "菩提萨埵婆耶", "摩诃萨埵婆耶", "摩诃迦卢尼迦耶", "唵", "萨皤啰罚曳", "数怛那怛写", "南无悉吉栗埵伊蒙阿唎耶"],
    scene: "慈悲发愿 · 皈敬礼赞",
    planDays: 5,
    seriesId: "dabeizhou", seriesOrder: 1, seriesTotal: 8, seriesTitle: "大悲咒",
  },
  {
    id: "c_db2", type: "长咒", len: "长",
    title: "大悲咒 · 第2节",
    body: "婆卢吉帝室佛啰楞驮婆，南无那啰谨墀，醯利摩诃皤哆沙咩，萨婆阿他豆输朋，阿逝孕，萨婆萨哆那摩婆萨多那摩婆伽，摩罚特豆，怛侄他，唵阿婆卢醯，卢迦帝。",
    segments: ["婆卢吉帝室佛啰楞驮婆", "南无那啰谨墀", "醯利摩诃皤哆沙咩", "萨婆阿他豆输朋", "阿逝孕", "萨婆萨哆那摩婆萨多那摩婆伽", "摩罚特豆", "怛侄他", "唵阿婆卢醯", "卢迦帝"],
    scene: "慈悲发愿 · 称名礼敬",
    planDays: 5,
    seriesId: "dabeizhou", seriesOrder: 2, seriesTotal: 8, seriesTitle: "大悲咒",
  },
  {
    id: "c_db3", type: "长咒", len: "长",
    title: "大悲咒 · 第3节",
    body: "迦罗帝，夷醯唎，摩诃菩提萨埵，萨婆萨婆,摩啰摩啰，摩醯摩醯唎驮孕，俱卢俱卢羯蒙，度卢度卢罚阇耶帝，摩诃罚阇耶帝，陀啰陀啰。",
    segments: ["迦罗帝", "夷醯唎", "摩诃菩提萨埵", "萨婆萨婆", "摩啰摩啰", "摩醯摩醯唎驮孕", "俱卢俱卢羯蒙", "度卢度卢罚阇耶帝", "摩诃罚阇耶帝", "陀啰陀啰"],
    scene: "慈悲发愿 · 呼请加持",
    planDays: 5,
    seriesId: "dabeizhou", seriesOrder: 3, seriesTotal: 8, seriesTitle: "大悲咒",
  },
  {
    id: "c_db4", type: "长咒", len: "长",
    title: "大悲咒 · 第4节",
    body: "地利尼，室佛啰耶，遮啰遮啰，摩么罚摩啰，穆帝隶，伊醯伊醯，室那室那，阿啰嘇佛啰舍利，罚沙罚嘇，佛啰舍耶。",
    segments: ["地利尼", "室佛啰耶", "遮啰遮啰", "摩么罚摩啰", "穆帝隶", "伊醯伊醯", "室那室那", "阿啰嘇佛啰舍利", "罚沙罚嘇", "佛啰舍耶"],
    scene: "慈悲发愿 · 降伏除障",
    planDays: 5,
    seriesId: "dabeizhou", seriesOrder: 4, seriesTotal: 8, seriesTitle: "大悲咒",
  },
  {
    id: "c_db5", type: "长咒", len: "长",
    title: "大悲咒 · 第5节",
    body: "呼嚧呼嚧摩啰，呼嚧呼嚧醯利，娑啰娑啰，悉利悉利，苏嚧苏嚧,菩提夜菩提夜，菩驮夜菩驮夜，弥帝唎夜，那啰谨墀，地利瑟尼那。",
    segments: ["呼嚧呼嚧摩啰", "呼嚧呼嚧醯利", "娑啰娑啰", "悉利悉利", "苏嚧苏嚧", "菩提夜菩提夜", "菩驮夜菩驮夜", "弥帝唎夜", "那啰谨墀", "地利瑟尼那"],
    scene: "慈悲发愿 · 觉悟成就",
    planDays: 5,
    seriesId: "dabeizhou", seriesOrder: 5, seriesTotal: 8, seriesTitle: "大悲咒",
  },
  {
    id: "c_db6", type: "长咒", len: "长",
    title: "大悲咒 · 第6节",
    body: "波夜摩那，娑婆诃，悉陀夜，娑婆诃，摩诃悉陀夜，娑婆诃，悉陀喻艺，室皤啰耶，娑婆诃，那啰谨墀。",
    segments: ["波夜摩那", "娑婆诃", "悉陀夜", "娑婆诃", "摩诃悉陀夜", "娑婆诃", "悉陀喻艺", "室皤啰耶", "娑婆诃", "那啰谨墀"],
    scene: "慈悲发愿 · 圆成回向",
    planDays: 5,
    seriesId: "dabeizhou", seriesOrder: 6, seriesTotal: 8, seriesTitle: "大悲咒",
  },
  {
    id: "c_db7", type: "长咒", len: "长",
    title: "大悲咒 · 第7节",
    body: "娑婆诃，摩啰那啰，娑婆诃，悉啰僧阿穆佉耶，娑婆诃，娑婆摩诃阿悉陀夜，娑婆诃，者吉啰阿悉陀夜，娑婆诃，波陀摩羯悉陀夜，娑婆诃，那啰谨墀皤伽啰耶。",
    segments: ["娑婆诃", "摩啰那啰", "娑婆诃", "悉啰僧阿穆佉耶", "娑婆诃", "娑婆摩诃阿悉陀夜", "娑婆诃", "者吉啰阿悉陀夜", "娑婆诃", "波陀摩羯悉陀夜", "娑婆诃", "那啰谨墀皤伽啰耶"],
    scene: "慈悲发愿 · 礼诸圣众",
    planDays: 5,
    seriesId: "dabeizhou", seriesOrder: 7, seriesTotal: 8, seriesTitle: "大悲咒",
  },
  {
    id: "c_db8", type: "长咒", len: "长",
    title: "大悲咒 · 第8节",
    body: "娑婆诃，摩婆利胜羯啰夜，娑婆诃，南无喝啰怛那哆啰夜耶，南无阿唎耶，婆卢吉帝，烁皤啰夜，娑婆诃，唵悉殿都，漫多啰，跋陀耶，娑婆诃。",
    segments: ["娑婆诃", "摩婆利胜羯啰夜", "娑婆诃", "南无喝啰怛那哆啰夜耶", "南无阿唎耶", "婆卢吉帝", "烁皤啰夜", "娑婆诃", "唵悉殿都", "漫多啰", "跋陀耶", "娑婆诃"],
    scene: "慈悲发愿 · 圆满收摄",
    planDays: 5,
    seriesId: "dabeizhou", seriesOrder: 8, seriesTotal: 8, seriesTitle: "大悲咒",
  },
  {
    id: "c4", type: "短咒", len: "短",
    title: "绿度母心咒",
    body: "嗡 达列 都达列 都列 梭哈",
    segments: ["嗡", "达列", "都达列", "都列", "梭哈"],
    scene: "祈愿安顺 · 出行平安",
    planDays: 2,
  },
  {
    id: "c5", type: "短咒", len: "中",
    title: "药师灌顶真言（简）",
    body: "嗡 鞞杀逝 鞞杀逝 鞞杀社 三没揭帝 莎诃",
    segments: ["嗡", "鞞杀逝", "鞞杀逝", "鞞杀社", "三没揭帝", "莎诃"],
    scene: "身心调养 · 病中回向",
    festival: "药师佛圣诞",
    planDays: 4,
  },
  {
    id: "c6", type: "经文片段", len: "中",
    title: "心经 · 核心段",
    body: "色不异空，空不异色，色即是空，空即是色，受想行识，亦复如是。",
    segments: ["色不异空", "空不异色", "色即是空", "空即是色", "受想行识，亦复如是"],
    scene: "晨课静坐 · 心绪烦乱时",
    planDays: 5,
  },
  {
    id: "c7", type: "短偈", len: "短",
    title: "无常偈",
    body: "诸行无常，是生灭法。生灭灭已，寂灭为乐。",
    segments: ["诸行无常", "是生灭法", "生灭灭已", "寂灭为乐"],
    scene: "送别 · 观照",
    planDays: 2,
  },
];

const INITIAL_PLANS: Plan[] = [
  { id: "p1", contentId: "c1", totalDays: 1, currentDay: 1, status: "reviewing", dueToday: true },
  { id: "p2", contentId: "c2", totalDays: 4, currentDay: 1, status: "reviewing", dueToday: true },
  { id: "p3", contentId: "c_db1", totalDays: 5, currentDay: 1, status: "reviewing", dueToday: true },
];

const SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: "prod1",
    category: "经文音频",
    tag: "本月精选",
    title: "观音法门 · 音频合辑",
    subtitle: "三段经咒 + 一段唱诵导读 + 同步训练",
    price: 9.9,
    originalPrice: 28,
    color: "#7E2A1C",
    description: "精选观音法门三段核心经咒，由资深法师唱诵录制，配合专业音频后期制作，为您呈现最纯净的持诵体验。",
    features: ["大悲咒完整版 · 7分钟", "六字大明咒 · 循环版", "观音圣号 · 静心版", "法师导读 · 修持要点", "高保真音质 · 无损格式"],
    isFeatured: true,
  },
  {
    id: "prod2",
    category: "经文音频",
    tag: "新品",
    title: "心经 · 梵唱合集",
    subtitle: "山月禅 · 28 分钟 · 高保真",
    price: 18,
    color: "#A37049",
    description: "由知名梵唱团队山月禅倾情演绎，融合传统梵音与现代音乐制作技术，带您体验心经的深远意境。",
    features: ["完整心经梵唱 · 28分钟", "晨课版 · 15分钟", "静坐版 · 禅境配乐", "96kHz采样率 · 无损音质", "赠送经文注解PDF"],
  },
  {
    id: "prod3",
    category: "经文音频",
    tag: "热销",
    title: "六字大明咒 · 唱诵冥想",
    subtitle: "自然环境音 · 15 分钟循环",
    price: 12,
    color: "#7E2A1C",
    description: "融合自然环境音的六字大明咒循环唱诵，适合日常持诵、冥想静坐、睡前放松等多种场景。",
    features: ["15分钟循环版", "自然环境音背景", "适合冥想静坐", "助眠放松", "可设定循环次数"],
  },
  {
    id: "prod4",
    category: "经文音频",
    tag: "精选",
    title: "药师琉璃 · 静心三十分",
    subtitle: "助眠 · 病中 · 回向",
    price: 36,
    color: "#5E7A4F",
    description: "药师琉璃光如来本愿功德经选段，专为病中康复、安神助眠、功德回向等场景制作。",
    features: ["药师佛心咒 · 完整版", "药师灌顶真言", "药师经选段诵读", "静心助眠音乐", "病中回向仪轨指导"],
  },
  {
    id: "prod5",
    category: "唐卡 · 壁纸",
    tag: "壁纸",
    title: "唐卡 · 度母系列（4 张）",
    subtitle: "高清壁纸 · 适配锁屏 / 桌面",
    price: 9.9,
    color: "#8B5A1E",
    description: "精选藏传佛教二十一度母唐卡，经专业扫描与色彩还原，提供4K超高清分辨率，完美适配各种设备屏幕。",
    features: ["绿度母 · 白度母主题", "4张精选唐卡", "4K超高清 · 3840×2160", "适配iPhone/iPad", "适配Android设备"],
  },
  {
    id: "prod6",
    category: "唐卡 · 壁纸",
    tag: "壁纸",
    title: "唐卡 · 观音慈悲",
    subtitle: "单图 · 4K",
    price: 6,
    color: "#5E7A4F",
    description: "千手千眼观世音菩萨唐卡，展现大慈大悲救苦救难的殊胜庄严相。",
    features: ["千手观音主题", "4K分辨率", "精细色彩还原", "多种尺寸适配", "赠送观音法门简介"],
  },
  {
    id: "prod7",
    category: "图鉴",
    tag: "图鉴",
    title: "佛菩萨圣诞日历",
    subtitle: "一年节日 · 推荐经咒",
    price: 12,
    color: "#A37049",
    description: "整合全年佛菩萨圣诞日历，每个节日配对应经咒推荐、供养仪轨、功德利益说明，是在家修行的实用指南。",
    features: ["全年圣诞日期", "农历对照", "每个节日配经咒推荐", "供养仪轨说明", "功德利益介绍", "可打印版PDF"],
  },
];

/* ===================== APP ===================== */
export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [mineSubTab, setMineSubTab] = useState<"progress" | "orders">("progress");
  const [plans, setPlans] = useState<Plan[]>(INITIAL_PLANS);
  const [streak, setStreak] = useState(12);
  const [trainingPlanId, setTrainingPlanId] = useState<string | null>(null);
  const [proposalContentId, setProposalContentId] = useState<string | null>(null);
  const [festivalOpen, setFestivalOpen] = useState(false);

  // Shop related state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([
    { id: "o1", title: "六字大明咒 · 唱诵冥想", date: "2026-05-20", price: "¥12", status: "已完成", color: "#7E2A1C", items: [{ productId: "prod3", quantity: 1, price: 12 }], paymentMethod: "微信支付", orderNumber: "20260520001" },
    { id: "o2", title: "唐卡 · 度母系列（4 张）", date: "2026-05-15", price: "¥9.9", status: "已完成", color: "#8B5A1E", items: [{ productId: "prod5", quantity: 1, price: 9.9 }], paymentMethod: "微信支付", orderNumber: "20260515001" },
    { id: "o3", title: "佛菩萨圣诞日历", date: "2026-04-28", price: "¥12", status: "已完成", color: "#A37049", items: [{ productId: "prod7", quantity: 1, price: 12 }], paymentMethod: "微信支付", orderNumber: "20260428001" },
  ]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const contentMap = useMemo(() => Object.fromEntries(CONTENT.map(c => [c.id, c])), []);
  const productMap = useMemo(() => Object.fromEntries(SHOP_PRODUCTS.map(p => [p.id, p])), []);

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartTotal = useMemo(() =>
    cart.reduce((sum, item) => {
      const product = productMap[item.productId];
      return sum + (product?.price || 0) * item.quantity;
    }, 0),
    [cart, productMap]
  );

  const acceptPlan = (contentId: string) => {
    if (plans.some(p => p.contentId === contentId && p.status !== "done")) {
      toast("已在进行中", { description: "这段内容已经在你的计划里" });
      setProposalContentId(null);
      return;
    }
    const c = contentMap[contentId];
    const newPlan: Plan = {
      id: "p" + Math.random().toString(36).slice(2, 7),
      contentId,
      totalDays: c.planDays,
      currentDay: 1,
      status: "reviewing",
      dueToday: true,
    };
    setPlans(p => [...p, newPlan]);
    setProposalContentId(null);
    setTab("today");
    toast.success(`已加入今日计划`, { description: `${c.title} · ${c.planDays} 天计划` });
  };

  const finishReview = (planId: string, result: "更熟" | "已掌握" | "需加强") => {
    const finishedPlan = plans.find(p => p.id === planId);
    setPlans(prev => prev.map(p => {
      if (p.id !== planId) return p;
      if (result === "已掌握") return { ...p, status: "done", currentDay: p.totalDays, dueToday: false };
      if (result === "需加强") return { ...p, status: "risk", dueToday: false };
      const next = Math.min(p.currentDay + 1, p.totalDays);
      return { ...p, currentDay: next, dueToday: false, status: next >= p.totalDays ? "done" : "reviewing" };
    }));
    setTrainingPlanId(null);
    setStreak(s => s + (plans.every(p => !p.dueToday || p.id === planId) ? 1 : 0));
    const map = { 更熟: "记忆已加深 +1 步", 已掌握: "这段已背会 🎉", 需加强: "已标记为需加强，明日会再安排" } as const;
    toast.success(result, { description: map[result] });

    // Chain to next segment in a series
    if (finishedPlan && (result === "已掌握" || result === "更熟")) {
      const c = contentMap[finishedPlan.contentId];
      if (c?.seriesId && c.seriesOrder) {
        const next = CONTENT.find(x => x.seriesId === c.seriesId && x.seriesOrder === c.seriesOrder! + 1);
        if (next && !plans.some(p => p.contentId === next.id && p.status !== "done")) {
          setTimeout(() => setProposalContentId(next.id), 600);
        }
      }
    }
  };

  const resetDemo = () => {
    setPlans(INITIAL_PLANS);
    setStreak(12);
    toast("Demo 已重置");
  };

  // Cart operations
  const addToCart = (productId: string) => {
    const product = productMap[productId];
    if (!product) return;

    setCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) {
        return prev.map(item =>
          item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { productId, quantity: 1 }];
    });
    toast.success("已加入购物车", { description: product.title });
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.productId !== productId));
      toast("已从购物车移除");
    } else {
      setCart(prev =>
        prev.map(item => (item.productId === productId ? { ...item, quantity } : item))
      );
    }
  };

  const createOrder = () => {
    if (cart.length === 0) return;

    setPaymentProcessing(true);

    // Simulate payment processing
    setTimeout(() => {
      const orderItems = cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: productMap[item.productId].price,
      }));

      const orderNumber = new Date().toISOString().split("T")[0].replace(/-/g, "") + Math.floor(Math.random() * 1000).toString().padStart(3, "0");

      const newOrder: Order = {
        id: "o" + Date.now(),
        title: cart.length === 1 ? productMap[cart[0].productId].title : `${cart.length} 件商品`,
        date: new Date().toISOString().split("T")[0],
        price: `¥${cartTotal.toFixed(2)}`,
        status: "已完成",
        color: productMap[cart[0].productId].color,
        items: orderItems,
        paymentMethod: "微信支付",
        orderNumber,
      };

      setOrders(prev => [newOrder, ...prev]);
      setCart([]);
      setPaymentProcessing(false);
      setCheckoutOpen(false);
      setCartOpen(false);
      toast.success("支付成功", { description: `订单号: ${orderNumber}` });
      setTab("mine");
      setMineSubTab("orders");
    }, 1500);
  };

  const toggleFavorite = (productId: string) => {
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
        toast("已取消收藏");
      } else {
        newSet.add(productId);
        toast.success("已收藏", { description: "可在商城顶部查看收藏" });
      }
      return newSet;
    });
  };

  const trainingPlan = trainingPlanId ? plans.find(p => p.id === trainingPlanId) : null;
  const proposalContent = proposalContentId ? contentMap[proposalContentId] : null;
  const selectedProduct = selectedProductId ? productMap[selectedProductId] : null;
  const selectedOrder = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : null;

  return (
    <div className="size-full flex items-center justify-center bg-[#EFE3CB] p-6 overflow-auto">
      <div className="w-[390px] h-[844px] bg-[#F6ECD7] rounded-[44px] shadow-2xl overflow-hidden relative flex flex-col font-sans-sc text-[#2D2018]">
        <div className="flex-1 overflow-y-auto scrollbar-hide pb-28 pt-8">
          {tab === "today" && (
            <TodayScreen
              plans={plans} contentMap={contentMap} streak={streak}
              onStartReview={(id) => setTrainingPlanId(id)}
              onOpenFestival={() => setFestivalOpen(true)}
            />
          )}
          {tab === "browse" && (
            <BrowseScreen onPick={(id) => setProposalContentId(id)} plans={plans} />
          )}
          {tab === "shop" && (
            <ShopScreen
              onProductClick={(id) => setSelectedProductId(id)}
              onCartClick={() => setCartOpen(true)}
              cartCount={cartCount}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          )}
          {tab === "mine" && (
            <MineScreen
              plans={plans} contentMap={contentMap} onReset={resetDemo} streak={streak}
              subTab={mineSubTab} setSubTab={setMineSubTab}
              orders={orders}
              productMap={productMap}
              onOrderClick={(id) => setSelectedOrderId(id)}
              onTap={(id) => {
                const p = plans.find(x => x.id === id);
                if (p?.status === "done") toast(`${contentMap[p.contentId].title} 已背会`, { description: "保持温习，记忆更稳" });
                else if (p) setTrainingPlanId(id);
              }}
            />
          )}
        </div>
        <BottomNav tab={tab} setTab={setTab} />

        {trainingPlan && (
          <TrainingModal
            plan={trainingPlan}
            content={contentMap[trainingPlan.contentId]}
            onClose={() => setTrainingPlanId(null)}
            onFinish={(r) => finishReview(trainingPlan.id, r)}
          />
        )}
        {proposalContent && (
          <PlanProposalModal
            content={proposalContent}
            onClose={() => setProposalContentId(null)}
            onAccept={() => acceptPlan(proposalContent.id)}
          />
        )}
        {festivalOpen && (
          <FestivalSheet
            onClose={() => setFestivalOpen(false)}
            onPick={(id) => { setFestivalOpen(false); setProposalContentId(id); }}
          />
        )}
        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            isFavorite={favorites.has(selectedProduct.id)}
            onClose={() => setSelectedProductId(null)}
            onAddToCart={() => {
              addToCart(selectedProduct.id);
              setSelectedProductId(null);
            }}
            onToggleFavorite={() => toggleFavorite(selectedProduct.id)}
          />
        )}
        {selectedOrder && (
          <OrderDetailModal
            order={selectedOrder}
            productMap={productMap}
            onClose={() => setSelectedOrderId(null)}
          />
        )}
        {cartOpen && (
          <CartModal
            cart={cart}
            productMap={productMap}
            onClose={() => setCartOpen(false)}
            onUpdateQuantity={updateCartQuantity}
            onCheckout={() => {
              setCartOpen(false);
              setCheckoutOpen(true);
            }}
          />
        )}
        {checkoutOpen && (
          <CheckoutModal
            cart={cart}
            productMap={productMap}
            total={cartTotal}
            onClose={() => setCheckoutOpen(false)}
            onConfirm={createOrder}
            processing={paymentProcessing}
          />
        )}

        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#FBF5E9", color: "#2D2018",
              border: "1px solid #E8D7B4", borderRadius: "14px",
              fontFamily: "Noto Sans SC, system-ui",
            },
          }}
        />
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex justify-between items-center px-7 pt-3 text-[14px] text-[#2D2018]/80 font-medium tracking-tight">
      <span>9:41</span>
      <div className="flex gap-1 items-center">
        <span className="w-4 h-2.5 rounded-sm border border-current opacity-70" />
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <div className="w-6" />
      <div className="font-serif-sc tracking-[0.45em] text-[15px] text-[#2D2018]/80 pl-[0.45em]">心 经 记</div>
      <button onClick={() => toast("更多设置开发中")} className="text-[#2D2018]/60"><MoreHorizontal size={20} /></button>
    </div>
  );
}

/* ===================== TODAY ===================== */
function TodayScreen({
  plans, contentMap, streak, onStartReview, onOpenFestival,
}: {
  plans: Plan[]; contentMap: Record<string, ContentItem>; streak: number;
  onStartReview: (planId: string) => void; onOpenFestival: () => void;
}) {
  const dueList = plans.filter(p => p.dueToday);
  const allDone = dueList.length === 0;

  const startFirstDue = () => {
    if (dueList.length) onStartReview(dueList[0].id);
    else toast.success("今日复习已完成 🎉");
  };

  return (
    <div className="px-6 pt-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13px] text-[#8A7860]">5月24日 · 星期日</div>
        <button onClick={() => toast(`已连续坚持 ${streak} 天`)} className="flex items-center gap-1.5 bg-gradient-to-r from-[#E9B86A] to-[#D89A3F] text-white text-[12px] px-3 py-1.5 rounded-full shadow-sm">
          <Flame size={13} className="fill-white" />
          <span className="font-medium">连续 {streak} 天</span>
        </button>
      </div>

      <h1 className="font-serif-sc text-[32px] leading-tight tracking-tight mt-1 mb-5">今日修持</h1>

      <div className="relative rounded-[26px] overflow-hidden mb-6 bg-gradient-to-br from-[#7E2A1C] via-[#8B3322] to-[#5C1F14] text-[#FBE9C8] p-6 shadow-lg">
        <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-[#D89A3F]/20 blur-2xl" />
        <div className="absolute right-4 top-4 opacity-40"><LotusMark /></div>
        <div className="text-[11px] tracking-[0.3em] text-[#E9B86A] mb-2 font-medium">TODAY · 今日偈语</div>
        <div className="font-serif-sc text-[18px] leading-relaxed mb-3 tracking-wide">
          一切有为法，如梦幻泡影，<br />
          如露亦如电，应作如是观。
        </div>
        <div className="text-[11px] text-[#E9B86A]/80 mb-4 tracking-wider">
          ——《金刚经》四句偈
        </div>
        <div className="h-px bg-[#FBE9C8]/20 mb-4" />
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] text-[#FBE9C8]/75">
            {allDone ? "今日修持已圆满" : `今日待复习 ${dueList.length} 段`}
          </div>
          <button onClick={startFirstDue} className="bg-[#FBE9C8] text-[#7E2A1C] text-[12px] font-medium px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-sm active:scale-95 transition">
            <Play size={11} className="fill-[#7E2A1C]" /> {allDone ? "明日预告" : "开始复习"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-[13px] text-[#8A7860] tracking-wider">待复习</div>
        <div className="text-[12px] text-[#8A7860]/70">{dueList.length} 段</div>
      </div>

      <div className="space-y-3">
        {dueList.map(p => {
          const c = contentMap[p.contentId];
          return (
            <ReviewCard
              key={p.id}
              tags={[c.type, `第 ${p.currentDay}/${p.totalDays} 天`, "拆段跟读"]}
              title={c.title}
              body={c.body}
              meta={`约 ${Math.max(3, p.totalDays * 2)} 分钟 · ${c.scene}`}
              onClick={() => onStartReview(p.id)}
            />
          );
        })}
        {dueList.length === 0 && (
          <div className="bg-white/60 rounded-[20px] p-8 text-center border border-[#E8D7B4]/60">
            <CheckCircle2 size={28} className="text-[#5E7A4F] mx-auto mb-2" />
            <div className="font-serif-sc text-[18px] mb-1">今日圆满</div>
            <div className="text-[12px] text-[#8A7860]">在「选内容」里再请一段，明日继续修持。</div>
          </div>
        )}
      </div>

      <button onClick={onOpenFestival} className="mt-5 w-full text-left">
        <div className="relative rounded-[22px] overflow-hidden p-5 bg-gradient-to-r from-[#F4D8A5] to-[#E9B86A]/80 flex items-center gap-4 shadow-sm active:scale-[0.99] transition">
          <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-[#8B3322]" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] text-[#7E2A1C]/80 mb-0.5 tracking-wider">农历二月十九 · 节日精选</div>
            <div className="font-serif-sc text-[19px] leading-tight">观音菩萨圣诞</div>
            <div className="text-[12px] text-[#7E2A1C]/70 mt-1">3 段相关经咒推荐</div>
          </div>
          <ChevronRight size={18} className="text-[#7E2A1C]/60" />
        </div>
      </button>

      <div className="text-center text-[11px] text-[#8A7860]/60 mt-6">Demo · 快讲一天，体验明日复习</div>
    </div>
  );
}

function ReviewCard({ tags, title, body, meta, onClick }: { tags: string[]; title: string; body: string; meta: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white/70 rounded-[20px] p-5 border border-[#E8D7B4]/60 backdrop-blur-sm shadow-[0_1px_2px_rgba(140,90,40,0.04)] active:scale-[0.99] active:bg-white/90 transition">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5 flex-wrap">
          {tags.map((t, i) => (
            <span key={t} className={`text-[10.5px] px-2 py-0.5 rounded-full ${i === 0 ? "bg-[#7E2A1C]/8 text-[#7E2A1C]" : "bg-[#EFE3CB] text-[#8A7860]"}`}>{t}</span>
          ))}
        </div>
        <ChevronRight size={16} className="text-[#8A7860]/60" />
      </div>
      <div className="font-serif-sc text-[22px] leading-snug mb-1.5 text-[#7E2A1C]">{title}</div>
      <div className="text-[13px] text-[#5C4838] leading-relaxed mb-3 line-clamp-2">{body}</div>
      <div className="flex items-center gap-1.5 text-[11px] text-[#8A7860]">
        <Clock size={11} /> <span>{meta}</span>
      </div>
    </button>
  );
}

/* ===================== BROWSE ===================== */
function BrowseScreen({ onPick, plans }: { onPick: (id: string) => void; plans: Plan[] }) {
  const [filter, setFilter] = useState<"全部" | "短咒" | "短偈" | "经文片段" | "长咒">("全部");
  const filters: typeof filter[] = ["全部", "短咒", "短偈", "经文片段", "长咒"];
  const [openSeriesId, setOpenSeriesId] = useState<string | null>(null);
  const regularItems = CONTENT.filter(c => !c.seriesId);
  const items = regularItems.filter(c => filter === "全部" || c.type === filter);
  const activeIds = new Set(plans.filter(p => p.status !== "done").map(p => p.contentId));
  const doneIds = new Set(plans.filter(p => p.status === "done").map(p => p.contentId));

  const showSeries = filter === "全部" || filter === "长咒";
  const dabeiItems = CONTENT.filter(c => c.seriesId === "dabeizhou").sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
  const dabeiDone = dabeiItems.filter(c => doneIds.has(c.id)).length;
  const dabeiActive = dabeiItems.filter(c => activeIds.has(c.id)).length;

  return (
    <div className="px-6 pt-2">
      <h1 className="font-serif-sc text-[30px] leading-tight tracking-tight mb-1">选一段内容</h1>
      <div className="text-[12.5px] text-[#8A7860] mb-5">选好后系统会给你方案，无需自己设置频率</div>

      <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] transition active:scale-95 ${
              filter === f ? "bg-[#7E2A1C] text-[#FBE9C8] shadow-sm" : "bg-white/60 text-[#5C4838] border border-[#E8D7B4]/60"
            }`}
          >{f}</button>
        ))}
      </div>

      <div className="space-y-3">
        {showSeries && (
          <button onClick={() => setOpenSeriesId("dabeizhou")} className="w-full text-left relative rounded-[22px] overflow-hidden p-5 bg-gradient-to-br from-[#7E2A1C] via-[#8B3322] to-[#5C1F14] text-[#FBE9C8] active:scale-[0.99] transition shadow-md">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-[#D89A3F]/15 blur-2xl" />
            <div className="absolute right-3 top-3 opacity-40"><LotusMark small /></div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#FBE9C8]/15 text-[#E9B86A]">长咒 · 系列</span>
              <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#FBE9C8]/15 text-[#E9B86A]">共 {SERIES.dabeizhou.total} 节</span>
              {dabeiActive > 0 && <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#5E7A4F]/30 text-[#FBE9C8]">{dabeiActive} 节进行中</span>}
              {dabeiDone > 0 && <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#5E7A4F]/40 text-[#FBE9C8]">已背会 {dabeiDone}</span>}
            </div>
            <div className="font-serif-sc text-[26px] leading-snug mb-1.5">{SERIES.dabeizhou.title}</div>
            <div className="text-[12px] text-[#FBE9C8]/75 mb-3 leading-relaxed">{SERIES.dabeizhou.subtitle}</div>
            <div className="h-px bg-[#FBE9C8]/15 mb-3" />
            <div className="flex items-center justify-between">
              <div className="text-[11.5px] text-[#FBE9C8]/70">分 8 节循序背诵 · 每节背会自动续下一节</div>
              <ChevronRight size={16} className="text-[#FBE9C8]/70" />
            </div>
          </button>
        )}
        {items.map((it) => {
          const inPlan = activeIds.has(it.id);
          return (
            <button key={it.id} onClick={() => onPick(it.id)} className="w-full text-left bg-white/70 rounded-[20px] p-5 border border-[#E8D7B4]/60 active:scale-[0.99] active:bg-white/90 transition">
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#7E2A1C]/8 text-[#7E2A1C]">{it.type}</span>
                <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#EFE3CB] text-[#8A7860]">长度 {it.len}</span>
                {it.festival && (
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#E9B86A]/25 text-[#8B5A1E] inline-flex items-center gap-0.5">
                    <Sparkles size={9} /> {it.festival}
                  </span>
                )}
                {inPlan && <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#5E7A4F]/15 text-[#3F5A35]">已在计划中</span>}
              </div>
              <div className="font-serif-sc text-[22px] leading-snug text-[#7E2A1C] mb-1.5">{it.title}</div>
              <div className="text-[13px] text-[#5C4838] leading-relaxed mb-3 line-clamp-2">{it.body}</div>
              <div className="flex items-center justify-between text-[11px] text-[#8A7860]">
                <div className="flex items-center gap-1.5">
                  <Clock size={11} /> <span>约 {it.planDays} 天背会</span>
                  <span className="opacity-50">·</span>
                  <span>{it.scene}</span>
                </div>
                <ChevronRight size={14} className="text-[#8A7860]/60" />
              </div>
            </button>
          );
        })}
      </div>

      {openSeriesId === "dabeizhou" && (
        <SeriesSheet
          items={dabeiItems}
          activeIds={activeIds}
          doneIds={doneIds}
          onClose={() => setOpenSeriesId(null)}
          onPick={(id) => { setOpenSeriesId(null); onPick(id); }}
        />
      )}
    </div>
  );
}

function SeriesSheet({ items, activeIds, doneIds, onClose, onPick }: {
  items: ContentItem[];
  activeIds: Set<string>;
  doneIds: Set<string>;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const meta = SERIES.dabeizhou;
  const doneCount = items.filter(c => doneIds.has(c.id)).length;
  const nextItem = items.find(c => !doneIds.has(c.id) && !activeIds.has(c.id))
    ?? items.find(c => activeIds.has(c.id))
    ?? items[0];

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-[#8A7860] active:scale-95"><X size={20} /></button>
        <div className="text-[12px] text-[#8A7860]">长咒系列</div>
        <div className="w-5" />
      </div>

      <div className="relative rounded-[22px] overflow-hidden p-5 mb-4 bg-gradient-to-br from-[#7E2A1C] via-[#8B3322] to-[#5C1F14] text-[#FBE9C8]">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-[#D89A3F]/20 blur-2xl" />
        <div className="text-[11px] tracking-[0.3em] text-[#E9B86A] mb-1">长咒 · {meta.total} 节</div>
        <div className="font-serif-sc text-[28px] leading-tight mb-1.5">{meta.title}</div>
        <div className="text-[12px] text-[#FBE9C8]/75 leading-relaxed mb-3">{meta.subtitle}</div>
        <div className="text-[12px] text-[#FBE9C8]/85">{meta.desc}</div>
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-[12px] text-[#8A7860] tracking-wider">节选目录</div>
        <div className="text-[11.5px] text-[#8A7860]">已背会 {doneCount} / {meta.total}</div>
      </div>

      <div className="space-y-2 mb-4">
        {items.map((c) => {
          const isDone = doneIds.has(c.id);
          const isActive = activeIds.has(c.id);
          const status = isDone ? "已背会" : isActive ? "进行中" : "未开始";
          const statusColor = isDone ? "#5E7A4F" : isActive ? "#7E2A1C" : "#8A7860";
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              className="w-full text-left bg-[#FBF5E9] rounded-2xl p-4 border border-[#E8D7B4]/60 active:scale-[0.99] active:bg-white transition flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-serif-sc text-[15px]" style={{ backgroundColor: isDone ? "#5E7A4F" : "#7E2A1C", color: "#FBE9C8" }}>
                {isDone ? <Check size={14} /> : c.seriesOrder}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-serif-sc text-[16px] text-[#2D2018] leading-tight">第 {c.seriesOrder} 节</div>
                <div className="text-[11.5px] text-[#8A7860] mt-0.5 truncate">{c.body.slice(0, 18)}…</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px]" style={{ color: statusColor }}>{status}</div>
                <ChevronRight size={14} className="text-[#8A7860]/60 inline mt-0.5" />
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onPick(nextItem.id)}
        className="w-full py-3 rounded-2xl bg-[#7E2A1C] text-[#FBE9C8] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
      >
        <Play size={13} className="fill-[#FBE9C8]" />
        {doneCount === 0 ? `从第 1 节开始` : doneCount === items.length ? "通修复习" : `继续第 ${nextItem.seriesOrder} 节`}
      </button>
    </Sheet>
  );
}

/* ===================== SHOP ===================== */
function ShopScreen({ onProductClick, onCartClick, cartCount, favorites, onToggleFavorite }: {
  onProductClick: (id: string) => void;
  onCartClick: () => void;
  cartCount: number;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<ShopProduct["category"] | "收藏">("经文音频");
  const categories: (ShopProduct["category"] | "收藏")[] = ["经文音频", "唐卡 · 壁纸", "图鉴", "收藏"];

  const featuredProduct = SHOP_PRODUCTS.find(p => p.isFeatured);
  const filteredProducts = selectedCategory === "收藏"
    ? SHOP_PRODUCTS.filter(p => favorites.has(p.id))
    : SHOP_PRODUCTS.filter(p => p.category === selectedCategory && !p.isFeatured);

  return (
    <div className="px-6 pt-2">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-serif-sc text-[30px] leading-tight tracking-tight">心经记 · 商城</h1>
        <button onClick={onCartClick} className="relative p-2 text-[#7E2A1C] active:scale-95">
          <ShoppingCart size={22} />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#7E2A1C] text-[#FBE9C8] text-[10px] flex items-center justify-center font-medium">
              {cartCount}
            </span>
          )}
        </button>
      </div>
      <div className="text-[12.5px] text-[#8A7860] mb-5">为修行而选 · 经文音频 · 唐卡视觉</div>

      {featuredProduct && (
        <button onClick={() => onProductClick(featuredProduct.id)} className="w-full text-left relative rounded-[26px] overflow-hidden mb-6 bg-gradient-to-br from-[#7E2A1C] via-[#8B3322] to-[#4A1810] p-6 text-[#FBE9C8] shadow-lg active:scale-[0.99] transition">
          <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-[#D89A3F]/20 blur-3xl" />
          <div className="text-[11px] tracking-[0.3em] text-[#E9B86A] mb-2">{featuredProduct.tag}</div>
          <div className="font-serif-sc text-[26px] leading-tight mb-1.5">{featuredProduct.title}</div>
          <div className="text-[12.5px] text-[#FBE9C8]/75 mb-4 leading-relaxed">{featuredProduct.subtitle}</div>
          <div className="flex items-center gap-3">
            <span className="bg-[#FBE9C8] text-[#7E2A1C] text-[13px] font-medium px-4 py-2 rounded-full">限时 ¥{featuredProduct.price}</span>
            {featuredProduct.originalPrice && (
              <span className="text-[11px] text-[#FBE9C8]/60 line-through">¥{featuredProduct.originalPrice}</span>
            )}
          </div>
        </button>
      )}

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`shrink-0 text-[13px] px-4 py-1.5 rounded-full active:scale-95 transition inline-flex items-center gap-1.5 ${
              selectedCategory === cat ? "bg-[#7E2A1C] text-[#FBE9C8]" : "bg-white/60 text-[#5C4838] border border-[#E8D7B4]/60"
            }`}
          >
            {cat === "收藏" && <Star size={12} className={selectedCategory === cat ? "fill-[#FBE9C8]" : ""} />}
            {cat}
            {cat === "收藏" && favorites.size > 0 && <span className="text-[10px] opacity-70">({favorites.size})</span>}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredProducts.length > 0 ? (
          filteredProducts.map(product => (
            <ShopProductCard
              key={product.id}
              product={product}
              onClick={() => onProductClick(product.id)}
              isFavorite={favorites.has(product.id)}
              onToggleFavorite={(e) => {
                e.stopPropagation();
                onToggleFavorite(product.id);
              }}
            />
          ))
        ) : (
          <div className="bg-white/60 rounded-[20px] p-8 text-center border border-[#E8D7B4]/60">
            <Star size={28} className="text-[#8A7860]/40 mx-auto mb-2" />
            <div className="text-[13px] text-[#8A7860]">
              {selectedCategory === "收藏" ? "暂无收藏商品" : "该分类暂无商品"}
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-[#8A7860]/60 mt-8 mb-2">所有内容承诺无水印 · 一次购买长期可用</div>
    </div>
  );
}

function ShopProductCard({ product, onClick, isFavorite, onToggleFavorite }: {
  product: ShopProduct;
  onClick: () => void;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white/70 rounded-[18px] p-3 flex items-center gap-3.5 border border-[#E8D7B4]/60 active:scale-[0.99] active:bg-white/90 transition relative">
      <div className="w-16 h-16 rounded-2xl shrink-0 relative overflow-hidden flex items-center justify-center" style={{ backgroundColor: product.color }}>
        <LotusMark small />
        <div className="absolute top-1 left-1 text-[9px] bg-white/90 text-[#7E2A1C] px-1.5 py-0.5 rounded-full">{product.tag}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] text-[#2D2018] font-medium leading-snug truncate">{product.title}</div>
        <div className="text-[11.5px] text-[#8A7860] mt-0.5 truncate">{product.subtitle}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[14px] text-[#7E2A1C] font-medium">¥{product.price}</span>
          {product.originalPrice && (
            <span className="text-[11px] text-[#8A7860]/60 line-through">¥{product.originalPrice}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <div
          onClick={onToggleFavorite}
          className="p-1.5 rounded-full active:scale-95 transition cursor-pointer"
        >
          <Star size={16} className={isFavorite ? "fill-[#E9B86A] text-[#E9B86A]" : "text-[#8A7860]/40"} />
        </div>
        <ChevronRight size={16} className="text-[#8A7860]/60" />
      </div>
    </button>
  );
}

/* ===================== MINE ===================== */

// Ebbinghaus forgetting curve data (retention % over days)
function buildCurveData(totalDays: number) {
  const decay = (t: number) => Math.round(100 * Math.exp(-0.4 * t) + 5);
  const reviewPoints = new Set<number>();
  // Spaced repetition schedule: 1, 3, 7, 14, 30 days
  [1, 3, 7, 14, 30].filter(d => d <= Math.max(totalDays, 30)).forEach(d => reviewPoints.add(d));
  const days = Array.from({ length: 31 }, (_, i) => i);
  return days.map(d => ({
    day: d,
    retention: decay(d),
    review: reviewPoints.has(d) ? decay(d) : null,
  }));
}

function OrdersPanel({ orders, onOrderClick }: { orders: Order[]; onOrderClick: (id: string) => void }) {
  const getStatusColor = (status: Order["status"]) => {
    switch (status) {
      case "已完成": return "#5E7A4F";
      case "处理中": return "#E9B86A";
      case "待支付": return "#C58A2E";
      case "已取消": return "#8A7860";
      default: return "#8A7860";
    }
  };

  return (
    <div>
      <div className="text-[12px] text-[#8A7860] mb-3 tracking-wider">订单记录</div>
      {orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map(order => (
            <button
              key={order.id}
              onClick={() => onOrderClick(order.id)}
              className="w-full text-left bg-white/70 rounded-[18px] p-4 border border-[#E8D7B4]/60 flex items-center gap-3.5 active:scale-[0.99] active:bg-white/90 transition"
            >
              <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center" style={{ backgroundColor: order.color }}>
                <Package size={18} color="#FBE9C8" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] text-[#2D2018] font-medium leading-snug truncate">{order.title}</div>
                <div className="text-[11px] text-[#8A7860] mt-0.5">{order.date}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[14px] text-[#7E2A1C] font-medium">{order.price}</div>
                <div className="text-[10.5px] mt-0.5" style={{ color: getStatusColor(order.status) }}>{order.status}</div>
              </div>
              <ChevronRight size={14} className="text-[#8A7860]/60 shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white/60 rounded-[20px] p-8 text-center border border-[#E8D7B4]/60">
          <Package size={28} className="text-[#8A7860]/40 mx-auto mb-2" />
          <div className="text-[13px] text-[#8A7860]">暂无订单记录</div>
        </div>
      )}
      <div className="text-center text-[11px] text-[#8A7860]/60 mt-5">所有内容承诺无水印 · 一次购买长期可用</div>
    </div>
  );
}

const MemoryCurveCustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload.review === null) return null;
  return <circle cx={cx} cy={cy} r={5} fill="#7E2A1C" stroke="#FBE9C8" strokeWidth={2} />;
};

const MemoryCurveTooltip = ({ active, payload, label, reviewDays }: any) => {
  if (!active || !payload?.length) return null;
  const isReview = reviewDays.includes(label);
  return (
    <div className="bg-[#FBF5E9] border border-[#E8D7B4] rounded-xl px-3 py-2 text-[11px] shadow-md">
      <div className="text-[#8A7860]">第 {label} 天</div>
      <div className="text-[#7E2A1C] font-medium">记忆留存 {payload[0].value}%</div>
      {isReview && <div className="text-[#5E7A4F] mt-0.5">📍 复习节点</div>}
    </div>
  );
};

function ProgressPanel({ plans, contentMap, onReset, onTap }: { plans: Plan[]; contentMap: Record<string, ContentItem>; onReset: () => void; onTap: (id: string) => void }) {
  const reviewing = plans.filter(p => p.status === "reviewing");
  const risk = plans.filter(p => p.status === "risk");
  const done = plans.filter(p => p.status === "done");

  // Memory curve data
  const activePlans = plans.filter(p => p.status !== "done");
  const [selectedPlanId, setSelectedPlanId] = useState(activePlans[0]?.id ?? plans[0]?.id ?? "");
  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const curveData = buildCurveData(selectedPlan?.totalDays ?? 7);
  const reviewDays = [1, 3, 7, 14, 30];

  return (
    <div>
      {/* Status pills */}
      <div className="flex gap-2 mb-5">
        <div className="flex-1 bg-[#7E2A1C]/8 rounded-[14px] px-3 py-2.5 flex items-center gap-2 border border-[#7E2A1C]/10">
          <RotateCw size={14} className="text-[#7E2A1C]" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-[#8A7860]">复习中</div>
            <div className="font-serif-sc text-[16px] text-[#7E2A1C] leading-none mt-0.5">{reviewing.length}</div>
          </div>
        </div>
        <div className="flex-1 bg-[#C58A2E]/10 rounded-[14px] px-3 py-2.5 flex items-center gap-2 border border-[#C58A2E]/15">
          <AlertTriangle size={14} className="text-[#C58A2E]" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-[#8A7860]">遗忘风险</div>
            <div className="font-serif-sc text-[16px] text-[#C58A2E] leading-none mt-0.5">{risk.length}</div>
          </div>
        </div>
        <div className="flex-1 bg-[#5E7A4F]/10 rounded-[14px] px-3 py-2.5 flex items-center gap-2 border border-[#5E7A4F]/15">
          <CheckCircle2 size={14} className="text-[#5E7A4F]" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-[#8A7860]">已背会</div>
            <div className="font-serif-sc text-[16px] text-[#5E7A4F] leading-none mt-0.5">{done.length}</div>
          </div>
        </div>
      </div>

      {/* Memory Curve Section */}
      <div className="mb-5">
        <div className="text-[12px] text-[#8A7860] mb-2 tracking-wider">记忆曲线</div>
        <div className="text-[11px] text-[#8A7860]/70 mb-3">基于艾宾浩斯遗忘曲线，红点为复习节点</div>

        {plans.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {plans.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlanId(p.id)}
                className={`shrink-0 px-3 py-1 rounded-full text-[11.5px] transition ${
                  selectedPlanId === p.id ? "bg-[#7E2A1C] text-[#FBE9C8]" : "bg-white/60 text-[#5C4838] border border-[#E8D7B4]/60"
                }`}
              >
                {contentMap[p.contentId].title}
              </button>
            ))}
          </div>
        )}

        <div className="bg-white/70 rounded-[20px] p-4 border border-[#E8D7B4]/60 mb-4">
          {selectedPlan ? (
            <div key={`chart-wrapper-${selectedPlan.id}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-serif-sc text-[15px] text-[#7E2A1C]">{contentMap[selectedPlan.contentId].title}</div>
                <div className="text-[11px] text-[#8A7860]">第 {selectedPlan.currentDay}/{selectedPlan.totalDays} 天</div>
              </div>
              <ResponsiveContainer width="100%" height={160} key={`chart-${selectedPlan.id}`}>
                <AreaChart data={curveData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`retentionGrad-${selectedPlan.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop key="stop-1" offset="5%" stopColor="#7E2A1C" stopOpacity={0.15} />
                      <stop key="stop-2" offset="95%" stopColor="#7E2A1C" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#8A7860" }} tickLine={false} axisLine={false} interval={4} tickFormatter={v => `${v}d`} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#8A7860" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<MemoryCurveTooltip reviewDays={reviewDays} />} />
                  {reviewDays.map(d => (
                    <ReferenceLine key={`ref-${selectedPlan.id}-${d}`} x={d} stroke="#7E2A1C" strokeDasharray="3 3" strokeOpacity={0.3} />
                  ))}
                  <Area
                    type="monotone"
                    dataKey="retention"
                    stroke="#7E2A1C"
                    strokeWidth={2}
                    fill={`url(#retentionGrad-${selectedPlan.id})`}
                    dot={<MemoryCurveCustomDot />}
                    activeDot={{ r: 5, fill: "#7E2A1C" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 justify-center">
                {reviewDays.filter(d => d <= 30).map(d => (
                  <div key={`indicator-${selectedPlan.id}-${d}`} className={`flex flex-col items-center gap-1 ${d <= selectedPlan.currentDay ? "opacity-100" : "opacity-40"}`}>
                    <div className={`w-2 h-2 rounded-full ${d <= selectedPlan.currentDay ? "bg-[#7E2A1C]" : "bg-[#8A7860]"}`} />
                    <div className="text-[9px] text-[#8A7860]">第{d}天</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <TrendingUp size={28} className="text-[#8A7860]/40 mx-auto mb-2" />
              <div className="text-[12px] text-[#8A7860]">开始一段内容后，这里将显示你的记忆曲线</div>
            </div>
          )}
        </div>

        <div className="bg-[#FBF5E9] rounded-[18px] p-4 border border-[#E8D7B4]/60 mb-5">
          <div className="text-[11.5px] text-[#7E2A1C] font-medium mb-2">复习节点说明</div>
          <div className="space-y-1.5">
            {[
              { day: "第 1 天", desc: "学习后第1天，留存率约50%，首次复习" },
              { day: "第 3 天", desc: "衰减放缓，第3天巩固效果最佳" },
              { day: "第 7 天", desc: "一周后重要节点，防止遗忘加速" },
              { day: "第 14 天", desc: "进入长期记忆过渡阶段" },
              { day: "第 30 天", desc: "月度温习，稳固长期记忆" },
            ].map(r => (
              <div key={r.day} className="flex gap-2 text-[11px]">
                <div className="text-[#7E2A1C] shrink-0 w-14">{r.day}</div>
                <div className="text-[#8A7860]">{r.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reviewing.length > 0 && (
        <>
          <SectionLabel>复习中</SectionLabel>
          <div className="space-y-3 mb-5">
            {reviewing.map(p => (
              <PlanCard key={p.id} title={contentMap[p.contentId].title} tag={contentMap[p.contentId].scene}
                progress={p.currentDay / p.totalDays} progressText={`${p.currentDay}/${p.totalDays}`} color="#7E2A1C"
                onClick={() => onTap(p.id)} />
            ))}
          </div>
        </>
      )}

      {risk.length > 0 && (
        <>
          <SectionLabel>高遗忘风险</SectionLabel>
          <div className="space-y-3 mb-5">
            {risk.map(p => (
              <PlanCard key={p.id} title={contentMap[p.contentId].title} tag={contentMap[p.contentId].scene}
                progress={p.currentDay / p.totalDays} progressText={`${p.currentDay}/${p.totalDays}`} color="#C58A2E"
                onClick={() => onTap(p.id)} />
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <SectionLabel>已背会</SectionLabel>
          <div className="space-y-3 mb-5">
            {done.map(p => (
              <PlanCard key={p.id} title={contentMap[p.contentId].title} tag={contentMap[p.contentId].scene}
                progress={1} progressText={`${p.totalDays}/${p.totalDays}`} color="#5E7A4F" done
                onClick={() => onTap(p.id)} />
            ))}
          </div>
        </>
      )}

      {reviewing.length === 0 && risk.length === 0 && done.length === 0 && (
        <div className="bg-white/60 rounded-[20px] p-8 text-center border border-[#E8D7B4]/60 mb-5">
          <BookMarked size={28} className="text-[#8A7860]/40 mx-auto mb-2" />
          <div className="text-[13px] text-[#8A7860]">去「选内容」开始你的第一段记忆计划</div>
        </div>
      )}

      <button onClick={onReset} className="w-full py-3 rounded-[16px] text-[13px] text-[#8A7860] border border-dashed border-[#8A7860]/40 inline-flex items-center justify-center gap-1.5 active:bg-[#8A7860]/5">
        <Trash2 size={13} /> 重置 Demo
      </button>
    </div>
  );
}

function MineScreen({
  plans, contentMap, onReset, streak, subTab, setSubTab, orders, productMap, onOrderClick, onTap
}: {
  plans: Plan[]; contentMap: Record<string, ContentItem>; onReset: () => void; streak: number;
  subTab: "progress" | "orders"; setSubTab: (t: "progress" | "orders") => void;
  orders: Order[]; productMap: Record<string, ShopProduct>;
  onOrderClick: (id: string) => void;
  onTap: (id: string) => void;
}) {
  const done = plans.filter(p => p.status === "done").length;
  const tabs: { key: "progress" | "orders"; icon: React.ReactNode; label: string }[] = [
    { key: "progress", icon: <RotateCw size={14} />, label: "进度" },
    { key: "orders", icon: <Package size={14} />, label: "订单" },
  ];

  return (
    <div className="pb-2">
      {/* Hero header with subtle texture */}
      <div className="relative px-6 pt-2 pb-5 mb-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#F4E0B0]/40 via-[#FBF5E9]/20 to-transparent pointer-events-none" />
        <div className="absolute top-3 right-5 opacity-[0.06] pointer-events-none">
          <LotusMark />
        </div>

        <div className="relative flex items-start gap-4 mb-4">
          <div className="relative shrink-0">
            <div className="w-[60px] h-[60px] rounded-full bg-gradient-to-br from-[#8B3322] to-[#5C1F14] flex items-center justify-center shadow-md ring-2 ring-[#FBE9C8]/80">
              <LotusMark small />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-[#FBE9C8] rounded-full p-0.5 shadow-sm border border-[#E8D7B4]">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E9B86A] to-[#C58A2E] flex items-center justify-center">
                <Award size={11} className="text-[#FBE9C8]" />
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2">
              <div className="font-serif-sc text-[20px] leading-tight text-[#2D2018]">修行者</div>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#7E2A1C]/10 text-[#7E2A1C]">Lv.2 行愿</span>
            </div>
            <div className="text-[11.5px] text-[#8A7860] mt-1 inline-flex items-center gap-1.5">
              <Flame size={11} className="text-[#C58A2E]" />
              已坚持 {streak} 天 · 在家修行
            </div>
          </div>
          <button onClick={() => toast("设置开发中")} className="text-[#8A7860]/70 active:scale-95 p-1.5 rounded-full hover:bg-white/40">
            <Settings size={18} />
          </button>
        </div>

        {/* Daily verse */}
        <div className="relative bg-gradient-to-br from-[#7E2A1C] to-[#5C1F14] rounded-[18px] px-4 py-3.5 shadow-sm overflow-hidden">
          <div className="absolute -right-2 -top-2 opacity-10">
            <Sparkles size={48} className="text-[#FBE9C8]" />
          </div>
          <div className="text-[10.5px] text-[#FBE9C8]/70 tracking-[0.2em] mb-1.5">今日寄语</div>
          <div className="font-serif-sc text-[15px] text-[#FBE9C8] leading-relaxed">
            念念相续，无有间断
          </div>
          <div className="text-[10.5px] text-[#FBE9C8]/60 mt-1.5">心定则慧生 · 慧生则烦恼断</div>
        </div>
      </div>

      <div className="px-6">
        {/* Stats Row — three-pillar with subtle dividers */}
        <div className="bg-white/70 rounded-[20px] border border-[#E8D7B4]/60 mb-5 overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-[#E8D7B4]/60">
            <div className="py-4 flex flex-col items-center">
              <div className="font-serif-sc text-[24px] leading-none text-[#7E2A1C]">{streak}</div>
              <div className="text-[10.5px] text-[#8A7860] mt-1.5">连续天数</div>
            </div>
            <div className="py-4 flex flex-col items-center">
              <div className="font-serif-sc text-[24px] leading-none text-[#5E7A4F]">{done}</div>
              <div className="text-[10.5px] text-[#8A7860] mt-1.5">已背会</div>
            </div>
            <div className="py-4 flex flex-col items-center">
              <div className="font-serif-sc text-[24px] leading-none text-[#C58A2E]">{plans.length}</div>
              <div className="text-[10.5px] text-[#8A7860] mt-1.5">累计学习</div>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 mb-5 bg-white/50 rounded-2xl p-1 border border-[#E8D7B4]/40">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`flex-1 py-2 rounded-xl text-[12px] flex items-center justify-center gap-1.5 transition ${
                subTab === t.key ? "bg-[#7E2A1C] text-[#FBE9C8] shadow-sm" : "text-[#8A7860]"
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {subTab === "progress" && (
          <ProgressPanel plans={plans} contentMap={contentMap} onReset={onReset} onTap={onTap} />
        )}
        {subTab === "orders" && (
          <OrdersPanel orders={orders} onOrderClick={onOrderClick} />
        )}

        {/* Footer brand line */}
        <div className="text-center mt-8 mb-2">
          <div className="inline-flex items-center gap-2 text-[#8A7860]/40">
            <div className="h-px w-8 bg-[#8A7860]/20" />
            <Sparkles size={10} />
            <div className="h-px w-8 bg-[#8A7860]/20" />
          </div>
          <div className="text-[10.5px] text-[#8A7860]/60 mt-2">心经记 · 与你一起慢慢修</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, num, label, color }: { icon: React.ReactNode; num: string; label: string; color: string }) {
  return (
    <div className="bg-white/70 rounded-[18px] py-4 flex flex-col items-center border border-[#E8D7B4]/60">
      <div style={{ color }} className="mb-1.5">{icon}</div>
      <div className="font-serif-sc text-[26px] leading-none" style={{ color }}>{num}</div>
      <div className="text-[11.5px] text-[#8A7860] mt-1.5">{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-[#8A7860] tracking-[0.2em] mb-2.5 px-1">{children}</div>;
}

function PlanCard({ title, tag, progress, progressText, color, done, onClick }: { title: string; tag: string; progress: number; progressText: string; color: string; done?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white/70 rounded-[20px] p-5 border border-[#E8D7B4]/60 active:scale-[0.99] active:bg-white/90 transition">
      <div className="flex justify-between items-start mb-2">
        <div className="font-serif-sc text-[19px]" style={{ color: done ? "#5E7A4F" : "#2D2018" }}>{title}</div>
        <div className="text-[12px] text-[#8A7860]">{progressText}</div>
      </div>
      <div className="h-[5px] rounded-full bg-[#EFE3CB] overflow-hidden mb-2.5">
        <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, backgroundColor: color }} />
      </div>
      <div className="text-[11.5px] text-[#8A7860]">{tag}</div>
    </button>
  );
}

/* ===================== TRAINING MODAL ===================== */
function TrainingModal({ plan, content, onClose, onFinish }: { plan: Plan; content: ContentItem; onClose: () => void; onFinish: (r: "更熟" | "已掌握" | "需加强") => void }) {
  const steps = ["跟读", "首字提示", "遮挡回忆", "填空回填", "本次反馈"] as const;
  const [step, setStep] = useState(0);
  const [fullTextOpen, setFullTextOpen] = useState(false);
  const next = () => setStep(s => Math.min(s + 1, steps.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={onClose} className="text-[#8A7860] active:scale-95"><X size={20} /></button>
        <div className="text-[12px] text-[#8A7860]">{step + 1} / {steps.length} · {steps[step]}</div>
        <button
          onClick={() => setFullTextOpen(true)}
          className="inline-flex items-center gap-1 text-[11.5px] text-[#7E2A1C] bg-[#7E2A1C]/10 px-2.5 py-1 rounded-full active:scale-95"
        >
          <FileText size={11} /> 查看全文
        </button>
      </div>
      {fullTextOpen && (
        <FullTextModal content={content} onClose={() => setFullTextOpen(false)} />
      )}
      <div className="h-1 rounded-full bg-[#EFE3CB] mb-4 overflow-hidden">
        <div className="h-full bg-[#7E2A1C] transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#7E2A1C]/8 text-[#7E2A1C]">{content.type}</span>
        <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#EFE3CB] text-[#8A7860]">第 {plan.currentDay}/{plan.totalDays} 天</span>
      </div>
      <div className="font-serif-sc text-[26px] text-[#7E2A1C] mb-5">{content.title}</div>

      <div className="min-h-[260px]">
        {step === 0 && <StepRead content={content} />}
        {step === 1 && <StepFirstChar content={content} />}
        {step === 2 && <StepMask content={content} />}
        {step === 3 && <StepBlank content={content} />}
        {step === 4 && <StepFeedback onFinish={onFinish} />}
      </div>

      {step < 4 && (
        <div className="flex gap-3 mt-6">
          <button onClick={prev} disabled={step === 0} className="flex-1 py-3 rounded-2xl border border-[#E8D7B4] text-[#8A7860] text-[13px] inline-flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98]">
            <ArrowLeft size={14} /> 上一步
          </button>
          <button onClick={next} className="flex-[2] py-3 rounded-2xl bg-[#7E2A1C] text-[#FBE9C8] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98]">
            下一步 <ArrowRight size={14} />
          </button>
        </div>
      )}
    </Sheet>
  );
}

function StepRead({ content }: { content: ContentItem }) {
  return (
    <div>
      <div className="text-[12px] text-[#8A7860] mb-3">跟着音频，逐段诵读</div>
      <div className="space-y-2.5">
        {content.segments.map((s, i) => (
          <div key={i} className="bg-[#FBF5E9] rounded-2xl p-4 flex items-center gap-3 border border-[#E8D7B4]/60">
            <button onClick={() => toast("播放音频示意", { duration: 1200 })} className="w-9 h-9 rounded-full bg-[#7E2A1C] text-[#FBE9C8] flex items-center justify-center shrink-0 active:scale-95">
              <Volume2 size={15} />
            </button>
            <div className="font-serif-sc text-[18px] text-[#2D2018] flex-1">{s}</div>
            <div className="text-[10px] text-[#8A7860]">{i + 1}/{content.segments.length}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepFirstChar({ content }: { content: ContentItem }) {
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  return (
    <div>
      <div className="text-[12px] text-[#8A7860] mb-3">只看首字，回忆整段</div>
      <div className="space-y-2.5">
        {content.segments.map((s, i) => (
          <button key={i} onClick={() => setReveal(r => ({ ...r, [i]: !r[i] }))} className="w-full text-left bg-[#FBF5E9] rounded-2xl p-4 border border-[#E8D7B4]/60 active:scale-[0.99]">
            <div className="font-serif-sc text-[20px] text-[#2D2018]">
              {reveal[i] ? s : <>
                <span className="text-[#7E2A1C]">{s[0]}</span>
                <span className="text-[#8A7860]/40">{" " + "○ ".repeat(Math.max(0, s.length - 1)).trim()}</span>
              </>}
            </div>
            <div className="text-[10.5px] text-[#8A7860] mt-1.5 inline-flex items-center gap-1">
              {reveal[i] ? <><EyeOff size={11} /> 收起</> : <><Eye size={11} /> 点击查看完整</>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepMask({ content }: { content: ContentItem }) {
  const [shown, setShown] = useState(true);
  return (
    <div>
      <div className="text-[12px] text-[#8A7860] mb-3">遮挡整段，凭记忆复诵后再揭开</div>
      <div className={`rounded-2xl p-6 border border-[#E8D7B4]/60 min-h-[180px] flex items-center justify-center transition-all ${shown ? "bg-[#FBF5E9]" : "bg-[#7E2A1C]/90"}`}>
        {shown ? (
          <div className="font-serif-sc text-[20px] leading-loose text-center text-[#2D2018]">{content.body}</div>
        ) : (
          <div className="text-[#FBE9C8] text-center">
            <EyeOff size={28} className="mx-auto mb-3 opacity-70" />
            <div className="text-[13px] opacity-80">凭记忆默诵<br />然后揭开核对</div>
          </div>
        )}
      </div>
      <button onClick={() => setShown(s => !s)} className="mt-4 w-full py-2.5 rounded-2xl border border-[#7E2A1C]/30 text-[#7E2A1C] text-[13px] active:scale-[0.99]">
        {shown ? "遮挡" : "揭开核对"}
      </button>
    </div>
  );
}

function StepBlank({ content }: { content: ContentItem }) {
  const seg = content.segments[0];
  const target = seg.length > 1 ? seg[Math.floor(seg.length / 2)] : seg[0];
  const display = seg.split("").map((ch, i) => i === Math.floor(seg.length / 2) ? "▢" : ch).join("");
  const [val, setVal] = useState("");
  const correct = val.trim() === target;

  return (
    <div>
      <div className="text-[12px] text-[#8A7860] mb-3">填空回填，巩固记忆细节</div>
      <div className="bg-[#FBF5E9] rounded-2xl p-5 border border-[#E8D7B4]/60 mb-4">
        <div className="text-[11px] text-[#8A7860] mb-2">补全这一段：</div>
        <div className="font-serif-sc text-[22px] text-[#2D2018] mb-4">{display}</div>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="填入缺失的字"
          className="w-full bg-white/70 rounded-xl px-4 py-3 border border-[#E8D7B4] outline-none text-[15px] text-[#2D2018] focus:border-[#7E2A1C]"
        />
        {val && (
          <div className={`mt-3 text-[12px] inline-flex items-center gap-1.5 ${correct ? "text-[#5E7A4F]" : "text-[#C58A2E]"}`}>
            {correct ? <><Check size={13} /> 完全正确</> : <><AlertTriangle size={13} /> 正确答案：{target}</>}
          </div>
        )}
      </div>
    </div>
  );
}

function StepFeedback({ onFinish }: { onFinish: (r: "更熟" | "已掌握" | "需加强") => void }) {
  const opts: { key: "更熟" | "已掌握" | "需加强"; desc: string; color: string; icon: React.ReactNode }[] = [
    { key: "需加强", desc: "还有点生疏，明日重点复习", color: "#C58A2E", icon: <AlertTriangle size={16} /> },
    { key: "更熟", desc: "比上一次更熟，按曲线继续", color: "#7E2A1C", icon: <Star size={16} /> },
    { key: "已掌握", desc: "已能默诵，转入背会", color: "#5E7A4F", icon: <CheckCircle2 size={16} /> },
  ];
  return (
    <div>
      <div className="text-[12px] text-[#8A7860] mb-3">这一次的感觉是？</div>
      <div className="space-y-2.5">
        {opts.map(o => (
          <button key={o.key} onClick={() => onFinish(o.key)} className="w-full bg-[#FBF5E9] rounded-2xl p-4 border border-[#E8D7B4]/60 flex items-center gap-3 active:scale-[0.99] active:bg-white">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: o.color }}>{o.icon}</div>
            <div className="flex-1 text-left">
              <div className="font-serif-sc text-[17px]" style={{ color: o.color }}>{o.key}</div>
              <div className="text-[11.5px] text-[#8A7860] mt-0.5">{o.desc}</div>
            </div>
            <ChevronRight size={16} className="text-[#8A7860]/60" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ===================== FULL TEXT MODAL ===================== */
function FullTextModal({ content, onClose }: { content: ContentItem; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0.18);
  const [speed, setSpeed] = useState<0.75 | 1 | 1.25 | 1.5>(1);
  const [looping, setLooping] = useState(true);
  const [liked, setLiked] = useState(false);
  const [activeLine, setActiveLine] = useState(0);

  // For series items, gather full text from all segments
  const isSeries = !!content.seriesId;
  const seriesItems = isSeries
    ? CONTENT.filter(c => c.seriesId === content.seriesId).sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0))
    : [];
  const allLines = isSeries
    ? seriesItems.flatMap(c => c.segments.map(s => ({ text: s, segOrder: c.seriesOrder ?? 0 })))
    : content.segments.map(s => ({ text: s, segOrder: 0 }));

  const seriesMeta = isSeries && content.seriesId ? SERIES[content.seriesId] : null;
  const displayTitle = seriesMeta ? seriesMeta.title : content.title;
  const displaySubtitle = seriesMeta ? seriesMeta.subtitle : content.scene;

  useEffect(() => {
    const total = allLines.length;
    setActiveLine(Math.min(total - 1, Math.floor(progress * total)));
  }, [progress, allLines.length]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setProgress(p => {
        const inc = 0.012 * speed;
        const np = p + inc;
        if (np >= 1) return looping ? 0 : 1;
        return np;
      });
    }, 500);
    return () => clearInterval(id);
  }, [playing, speed, looping]);

  const togglePlay = () => {
    setPlaying(p => !p);
    if (!playing) toast("开始播放唱诵", { duration: 1200 });
  };

  const skip = (dir: -1 | 1) => {
    const stepSize = 1 / Math.max(allLines.length, 1);
    setProgress(p => Math.max(0, Math.min(1, p + dir * stepSize * 3)));
  };

  const totalSec = Math.round(allLines.length * 4.5 / speed);
  const curSec = Math.round(totalSec * progress);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const speeds: (0.75 | 1 | 1.25 | 1.5)[] = [0.75, 1, 1.25, 1.5];

  return (
    <div className="absolute inset-0 z-40">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 bg-[#F6ECD7] flex flex-col animate-[slideUp_.25s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#E8D7B4]/60 shrink-0">
          <button onClick={onClose} className="text-[#8A7860] active:scale-95 inline-flex items-center gap-1 text-[13px]">
            <ArrowLeft size={18} /> 返回训练
          </button>
          <div className="text-[12px] text-[#8A7860]">经文全文</div>
          <button
            onClick={() => { setLiked(l => !l); toast(liked ? "已取消" : "已加入收藏"); }}
            className="active:scale-95"
          >
            <Heart size={18} className={liked ? "fill-[#7E2A1C] text-[#7E2A1C]" : "text-[#8A7860]"} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Decorative banner */}
          <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#7E2A1C] via-[#8B3322] to-[#4A1810] text-[#FBE9C8]">
            <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-[#D89A3F]/25 blur-3xl" />
            <div className="absolute -left-12 -bottom-16 w-52 h-52 rounded-full bg-[#E9B86A]/15 blur-3xl" />
            <div className="absolute right-5 top-6 opacity-50"><LotusMark /></div>
            <div className="absolute left-5 bottom-8 opacity-25 rotate-12"><LotusMark small /></div>
            <div className="relative z-10 h-full flex flex-col justify-end px-6 pb-5">
              <div className="text-[11px] tracking-[0.4em] text-[#E9B86A] mb-2">
                {content.type}{isSeries ? ` · 共 ${seriesItems.length} 节` : ""}
              </div>
              <div className="font-serif-sc text-[30px] leading-tight mb-1">{displayTitle}</div>
              <div className="text-[12px] text-[#FBE9C8]/75">{displaySubtitle}</div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 px-6 py-4 border-b border-[#E8D7B4]/60 bg-[#FBF5E9]/40">
            <div className="text-center">
              <div className="font-serif-sc text-[18px] text-[#7E2A1C]">{allLines.length}</div>
              <div className="text-[10.5px] text-[#8A7860] mt-0.5">总句数</div>
            </div>
            <div className="text-center border-x border-[#E8D7B4]/60">
              <div className="font-serif-sc text-[18px] text-[#7E2A1C]">{fmt(totalSec)}</div>
              <div className="text-[10.5px] text-[#8A7860] mt-0.5">单遍时长</div>
            </div>
            <div className="text-center">
              <div className="font-serif-sc text-[18px] text-[#7E2A1C]">
                {isSeries ? content.seriesTotal : Math.max(content.planDays * 2, 3) + "分"}
              </div>
              <div className="text-[10.5px] text-[#8A7860] mt-0.5">
                {isSeries ? "节数" : "日修时"}
              </div>
            </div>
          </div>

          {/* Full text */}
          <div className="px-6 py-5">
            {isSeries ? (
              seriesItems.map(seg => (
                <div key={seg.id} className="mb-5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#7E2A1C] text-[#FBE9C8] flex items-center justify-center text-[11px] font-serif-sc shrink-0">{seg.seriesOrder}</div>
                    <div className="text-[12px] text-[#7E2A1C] tracking-wider">第 {seg.seriesOrder} 节 · {seg.scene}</div>
                    <div className="flex-1 h-px bg-[#E8D7B4]" />
                  </div>
                  <div className="space-y-1.5">
                    {seg.segments.map((line, i) => {
                      const globalIdx = allLines.findIndex(l => l.text === line && l.segOrder === seg.seriesOrder);
                      const isActive = playing && globalIdx === activeLine;
                      return (
                        <div
                          key={`${seg.id}-${i}`}
                          className={`font-serif-sc text-[18px] leading-relaxed transition-all px-3 py-1.5 rounded-lg ${
                            isActive ? "bg-[#E9B86A]/25 text-[#7E2A1C]" : "text-[#2D2018]"
                          }`}
                        >
                          {line}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-1.5">
                {content.segments.map((line, i) => {
                  const isActive = playing && i === activeLine;
                  return (
                    <div
                      key={i}
                      className={`font-serif-sc text-[20px] leading-relaxed transition-all px-3 py-2 rounded-lg ${
                        isActive ? "bg-[#E9B86A]/25 text-[#7E2A1C]" : "text-[#2D2018]"
                      }`}
                    >
                      <span className="text-[10px] text-[#8A7860]/60 mr-2 align-top">{String(i + 1).padStart(2, "0")}</span>
                      {line}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Description block */}
            <div className="mt-6 bg-[#FBF5E9] rounded-2xl p-4 border border-[#E8D7B4]/60">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={13} className="text-[#7E2A1C]" />
                <div className="text-[12px] text-[#7E2A1C] tracking-wider">修持要点</div>
              </div>
              <div className="text-[12.5px] text-[#5C4838] leading-relaxed">
                {isSeries
                  ? "本咒为千手千眼观世音菩萨慈悲法门，全文 84 句。建议每日定时持诵，专注当下字音，不求快，重在心念清净相续。"
                  : "诵读时心念清净，逐句体会其义。可配合呼吸节奏，每段稍作停顿，让经文沉入心识。"}
              </div>
            </div>

            <div className="text-center text-[10.5px] text-[#8A7860]/60 mt-5 pb-4">
              — 经文恭录 · 仅供修持参考 —
            </div>
          </div>
        </div>

        {/* Bottom Player */}
        <div className="shrink-0 bg-[#FBF5E9] border-t border-[#E8D7B4] px-5 pt-3 pb-5">
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-[#8A7860] w-8 text-right tabular-nums">{fmt(curSec)}</span>
            <div
              className="flex-1 h-1.5 rounded-full bg-[#E8D7B4] relative cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setProgress(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
              }}
            >
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#7E2A1C] to-[#D89A3F]" style={{ width: `${progress * 100}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#7E2A1C] shadow-md" style={{ left: `calc(${progress * 100}% - 6px)` }} />
            </div>
            <span className="text-[10px] text-[#8A7860] w-8 tabular-nums">{fmt(totalSec)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-1">
            <button
              onClick={() => setLooping(l => !l)}
              className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 ${looping ? "text-[#7E2A1C] bg-[#7E2A1C]/10" : "text-[#8A7860]"}`}
            >
              <Repeat size={16} />
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => skip(-1)} className="w-10 h-10 rounded-full flex items-center justify-center text-[#5C4838] active:scale-95">
                <SkipBack size={20} className="fill-[#5C4838]" />
              </button>
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-gradient-to-br from-[#7E2A1C] to-[#5C1F14] text-[#FBE9C8] flex items-center justify-center shadow-lg active:scale-95"
              >
                {playing ? <Pause size={22} className="fill-[#FBE9C8]" /> : <Play size={22} className="fill-[#FBE9C8] ml-0.5" />}
              </button>
              <button onClick={() => skip(1)} className="w-10 h-10 rounded-full flex items-center justify-center text-[#5C4838] active:scale-95">
                <SkipForward size={20} className="fill-[#5C4838]" />
              </button>
            </div>
            <button
              onClick={() => {
                const i = speeds.indexOf(speed);
                setSpeed(speeds[(i + 1) % speeds.length]);
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-medium text-[#7E2A1C] bg-[#7E2A1C]/10 active:scale-95"
            >
              {speed}×
            </button>
          </div>
          <div className="flex items-center justify-center gap-1 text-[10.5px] text-[#8A7860] mt-2">
            <Volume2 size={11} /> 唱诵示意 · {looping ? "循环开启" : "单次播放"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== PROPOSAL ===================== */
function PlanProposalModal({ content, onClose, onAccept }: { content: ContentItem; onClose: () => void; onAccept: () => void }) {
  const milestones = content.planDays <= 2
    ? ["今日：拆段跟读", "明日：遮挡回忆 + 反馈"]
    : ["第 1 天：拆段跟读 + 首字提示", "第 3 天：遮挡回忆", `第 ${content.planDays} 天：默诵核对`];

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-[#8A7860] active:scale-95"><X size={20} /></button>
        <div className="text-[12px] text-[#8A7860]">系统记忆方案</div>
        <div className="w-5" />
      </div>

      <div className="text-[11px] tracking-[0.3em] text-[#8A7860] mb-1">{content.type}{content.seriesId ? ` · 系列 ${content.seriesOrder}/${content.seriesTotal}` : ""}</div>
      <div className="font-serif-sc text-[28px] text-[#7E2A1C] leading-tight mb-2">{content.title}</div>
      {content.seriesId && content.seriesOrder && content.seriesOrder > 1 && (
        <div className="text-[12px] text-[#5E7A4F] bg-[#5E7A4F]/10 rounded-xl px-3 py-2 mb-3 inline-flex items-center gap-1.5">
          <CheckCircle2 size={13} /> 上一节已完成，续接背诵
        </div>
      )}
      <div className="text-[13px] text-[#5C4838] leading-relaxed bg-[#FBF5E9] rounded-2xl p-4 border border-[#E8D7B4]/60 mb-4">{content.body}</div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <ProposalStat label="长度" val={content.len} />
        <ProposalStat label="预计天数" val={`${content.planDays} 天`} />
        <ProposalStat label="每日时长" val={`${Math.max(3, content.planDays * 2)} 分`} />
      </div>

      <div className="text-[12px] text-[#8A7860] mb-2">记忆节点</div>
      <div className="space-y-2 mb-5">
        {milestones.map((m, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[13px] text-[#5C4838]">
            <div className="w-6 h-6 rounded-full bg-[#7E2A1C]/10 text-[#7E2A1C] flex items-center justify-center text-[11px] font-medium shrink-0">{i + 1}</div>
            <div>{m}</div>
          </div>
        ))}
      </div>

      <div className="text-[12px] text-[#8A7860] mb-2">适合场景</div>
      <div className="text-[13px] text-[#5C4838] mb-6">{content.scene}</div>

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-[#E8D7B4] text-[#8A7860] text-[13px] active:scale-[0.98]">再看看</button>
        <button onClick={onAccept} className="flex-[2] py-3 rounded-2xl bg-[#7E2A1C] text-[#FBE9C8] text-[13px] font-medium active:scale-[0.98]">接受方案 · 加入今日</button>
      </div>
    </Sheet>
  );
}

function ProposalStat({ label, val }: { label: string; val: string }) {
  return (
    <div className="bg-[#FBF5E9] rounded-xl py-2.5 text-center border border-[#E8D7B4]/60">
      <div className="text-[10px] text-[#8A7860] mb-0.5">{label}</div>
      <div className="font-serif-sc text-[15px] text-[#7E2A1C]">{val}</div>
    </div>
  );
}

/* ===================== FESTIVAL SHEET ===================== */
function FestivalSheet({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const picks = CONTENT.filter(c => ["c1", "c5", "c7"].includes(c.id));
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-[#8A7860] active:scale-95"><X size={20} /></button>
        <div className="text-[12px] text-[#8A7860]">节日精选</div>
        <div className="w-5" />
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-[#F4D8A5] to-[#E9B86A]/80 p-5 mb-5">
        <div className="text-[11px] text-[#7E2A1C]/80 tracking-wider mb-1">农历二月十九</div>
        <div className="font-serif-sc text-[24px] text-[#7E2A1C]">观音菩萨圣诞</div>
        <div className="text-[12px] text-[#7E2A1C]/70 mt-1.5">慈悲愿力 · 普门示现</div>
      </div>

      <div className="text-[12px] text-[#8A7860] mb-2">推荐内容</div>
      <div className="space-y-2.5">
        {picks.map(c => (
          <button key={c.id} onClick={() => onPick(c.id)} className="w-full text-left bg-[#FBF5E9] rounded-2xl p-4 border border-[#E8D7B4]/60 active:scale-[0.99]">
            <div className="flex items-center justify-between mb-1">
              <div className="font-serif-sc text-[18px] text-[#7E2A1C]">{c.title}</div>
              <ChevronRight size={16} className="text-[#8A7860]/60" />
            </div>
            <div className="text-[11.5px] text-[#8A7860]">{c.type} · 约 {c.planDays} 天背会</div>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ===================== SHARED SHEET ===================== */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 bg-[#F6ECD7] rounded-t-[28px] max-h-[88%] overflow-y-auto scrollbar-hide p-6 pb-8 shadow-2xl animate-[slideUp_.25s_ease-out]">
        <div className="w-10 h-1 rounded-full bg-[#8A7860]/30 mx-auto mb-4" />
        {children}
      </div>
      <style>{`@keyframes slideUp {from {transform: translateY(40px); opacity:0} to {transform: translateY(0); opacity:1}}`}</style>
    </div>
  );
}

/* ===================== SHOP MODALS ===================== */
function ProductDetailModal({ product, isFavorite, onClose, onAddToCart, onToggleFavorite }: {
  product: ShopProduct;
  isFavorite: boolean;
  onClose: () => void;
  onAddToCart: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-[#8A7860] active:scale-95"><X size={20} /></button>
        <div className="text-[12px] text-[#8A7860]">商品详情</div>
        <button onClick={onToggleFavorite} className="active:scale-95">
          <Star size={20} className={isFavorite ? "fill-[#E9B86A] text-[#E9B86A]" : "text-[#8A7860]/60"} />
        </button>
      </div>

      <div className="w-full h-32 rounded-[20px] overflow-hidden mb-4 flex items-center justify-center relative" style={{ backgroundColor: product.color }}>
        <LotusMark />
        <div className="absolute top-3 left-3 text-[10px] bg-white/90 text-[#7E2A1C] px-2.5 py-1 rounded-full font-medium">{product.tag}</div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="font-serif-sc text-[26px] text-[#7E2A1C] leading-tight">{product.title}</div>
        <div className="text-right">
          <div className="text-[22px] text-[#7E2A1C] font-medium">¥{product.price}</div>
          {product.originalPrice && (
            <div className="text-[12px] text-[#8A7860]/60 line-through">¥{product.originalPrice}</div>
          )}
        </div>
      </div>

      <div className="text-[12.5px] text-[#8A7860] mb-4">{product.subtitle}</div>

      <div className="bg-[#FBF5E9] rounded-[20px] p-4 border border-[#E8D7B4]/60 mb-4">
        <div className="text-[13px] text-[#5C4838] leading-relaxed mb-3">{product.description}</div>
        <div className="text-[11px] text-[#8A7860] mb-2 font-medium">包含内容：</div>
        <div className="space-y-1.5">
          {product.features.map((feature, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px] text-[#5C4838]">
              <div className="w-1 h-1 rounded-full bg-[#7E2A1C] mt-1.5 shrink-0" />
              <div>{feature}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-[#E8D7B4] text-[#8A7860] text-[13px] active:scale-[0.98]">
          再看看
        </button>
        <button onClick={onAddToCart} className="flex-[2] py-3 rounded-2xl bg-[#7E2A1C] text-[#FBE9C8] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98]">
          <ShoppingCart size={14} /> 加入购物车
        </button>
      </div>
    </Sheet>
  );
}

function CartModal({ cart, productMap, onClose, onUpdateQuantity, onCheckout }: {
  cart: CartItem[];
  productMap: Record<string, ShopProduct>;
  onClose: () => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onCheckout: () => void;
}) {
  const total = cart.reduce((sum, item) => sum + (productMap[item.productId]?.price || 0) * item.quantity, 0);

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-[#8A7860] active:scale-95"><X size={20} /></button>
        <div className="text-[12px] text-[#8A7860]">购物车</div>
        <div className="w-5" />
      </div>

      {cart.length > 0 ? (
        <>
          <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto scrollbar-hide">
            {cart.map(item => {
              const product = productMap[item.productId];
              if (!product) return null;
              return (
                <div key={item.productId} className="bg-[#FBF5E9] rounded-[18px] p-3 border border-[#E8D7B4]/60">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center" style={{ backgroundColor: product.color }}>
                      <LotusMark small />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] text-[#2D2018] font-medium leading-snug truncate">{product.title}</div>
                      <div className="text-[11px] text-[#8A7860] mt-0.5 truncate">{product.subtitle}</div>
                      <div className="text-[14px] text-[#7E2A1C] font-medium mt-1">¥{product.price}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-full bg-white border border-[#E8D7B4] flex items-center justify-center text-[#7E2A1C] active:scale-95"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-[14px] text-[#2D2018] font-medium w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                        className="w-7 h-7 rounded-full bg-white border border-[#E8D7B4] flex items-center justify-center text-[#7E2A1C] active:scale-95"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-[15px] text-[#7E2A1C] font-medium">
                      ¥{(product.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-[#FBF5E9] rounded-[18px] p-4 border border-[#E8D7B4]/60 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-[#8A7860]">商品小计</span>
              <span className="text-[14px] text-[#2D2018]">¥{total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#E8D7B4]">
              <span className="text-[15px] text-[#7E2A1C] font-medium">合计</span>
              <span className="font-serif-sc text-[22px] text-[#7E2A1C]">¥{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-[#E8D7B4] text-[#8A7860] text-[13px] active:scale-[0.98]">
              继续选购
            </button>
            <button onClick={onCheckout} className="flex-[2] py-3 rounded-2xl bg-[#7E2A1C] text-[#FBE9C8] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98]">
              <CreditCard size={14} /> 去结算
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <ShoppingCart size={32} className="text-[#8A7860]/40 mx-auto mb-3" />
          <div className="text-[14px] text-[#8A7860] mb-2">购物车是空的</div>
          <div className="text-[12px] text-[#8A7860]/70">去商城看看吧</div>
        </div>
      )}
    </Sheet>
  );
}

function CheckoutModal({ cart, productMap, total, onClose, onConfirm, processing }: {
  cart: CartItem[];
  productMap: Record<string, ShopProduct>;
  total: number;
  onClose: () => void;
  onConfirm: () => void;
  processing: boolean;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-[#8A7860] active:scale-95"><X size={20} /></button>
        <div className="text-[12px] text-[#8A7860]">确认订单</div>
        <div className="w-5" />
      </div>

      <div className="bg-[#FBF5E9] rounded-[20px] p-4 border border-[#E8D7B4]/60 mb-4">
        <div className="text-[13px] text-[#7E2A1C] font-medium mb-3">订单商品</div>
        <div className="space-y-2">
          {cart.map(item => {
            const product = productMap[item.productId];
            if (!product) return null;
            return (
              <div key={item.productId} className="flex items-center justify-between text-[12px]">
                <div className="flex-1 truncate text-[#5C4838]">{product.title} × {item.quantity}</div>
                <div className="text-[#7E2A1C] font-medium ml-2">¥{(product.price * item.quantity).toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#FBF5E9] rounded-[20px] p-4 border border-[#E8D7B4]/60 mb-4">
        <div className="text-[13px] text-[#7E2A1C] font-medium mb-3">支付方式</div>
        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border-2 border-[#7E2A1C]">
          <CreditCard size={20} className="text-[#7E2A1C]" />
          <div className="flex-1">
            <div className="text-[13px] text-[#2D2018] font-medium">微信支付</div>
            <div className="text-[11px] text-[#8A7860]">安全快捷</div>
          </div>
          <Check size={16} className="text-[#7E2A1C]" />
        </div>
      </div>

      <div className="bg-gradient-to-br from-[#7E2A1C] to-[#5C1F14] rounded-[20px] p-4 mb-4 text-[#FBE9C8]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px]">应付金额</span>
          <span className="font-serif-sc text-[28px]">¥{total.toFixed(2)}</span>
        </div>
        <div className="text-[11px] opacity-75">一次购买 · 长期可用 · 无水印</div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          disabled={processing}
          className="flex-1 py-3 rounded-2xl border border-[#E8D7B4] text-[#8A7860] text-[13px] active:scale-[0.98] disabled:opacity-40"
        >
          返回
        </button>
        <button
          onClick={onConfirm}
          disabled={processing}
          className="flex-[2] py-3 rounded-2xl bg-[#7E2A1C] text-[#FBE9C8] text-[13px] font-medium active:scale-[0.98] disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-[#FBE9C8]/30 border-t-[#FBE9C8] rounded-full animate-spin" />
              支付处理中...
            </>
          ) : (
            "确认支付"
          )}
        </button>
      </div>
    </Sheet>
  );
}

/* ===================== ORDER DETAIL MODAL ===================== */
function OrderDetailModal({ order, productMap, onClose }: {
  order: Order;
  productMap: Record<string, ShopProduct>;
  onClose: () => void;
}) {
  const getStatusColor = (status: Order["status"]) => {
    switch (status) {
      case "已完成": return "#5E7A4F";
      case "处理中": return "#E9B86A";
      case "待支付": return "#C58A2E";
      case "已取消": return "#8A7860";
      default: return "#8A7860";
    }
  };

  const getStatusIcon = (status: Order["status"]) => {
    switch (status) {
      case "已完成": return <CheckCircle2 size={16} />;
      case "处理中": return <Clock size={16} />;
      case "待支付": return <CreditCard size={16} />;
      case "已取消": return <X size={16} />;
      default: return <Package size={16} />;
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-[#8A7860] active:scale-95"><X size={20} /></button>
        <div className="text-[12px] text-[#8A7860]">订单详情</div>
        <div className="w-5" />
      </div>

      {/* Order Status */}
      <div className="rounded-[20px] p-5 mb-4 flex items-center gap-3" style={{ backgroundColor: getStatusColor(order.status) + "15", border: `1px solid ${getStatusColor(order.status)}30` }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: getStatusColor(order.status), color: "#FBE9C8" }}>
          {getStatusIcon(order.status)}
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-medium" style={{ color: getStatusColor(order.status) }}>
            {order.status}
          </div>
          <div className="text-[11px] text-[#8A7860] mt-0.5">订单号: {order.orderNumber}</div>
        </div>
      </div>

      {/* Order Info */}
      <div className="bg-[#FBF5E9] rounded-[20px] p-4 border border-[#E8D7B4]/60 mb-4">
        <div className="text-[13px] text-[#7E2A1C] font-medium mb-3">订单信息</div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#8A7860]">下单时间</span>
            <span className="text-[#2D2018]">{order.date}</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#8A7860]">支付方式</span>
            <span className="text-[#2D2018]">{order.paymentMethod || "微信支付"}</span>
          </div>
          <div className="flex items-center justify-between text-[12px] pt-2 border-t border-[#E8D7B4]">
            <span className="text-[#8A7860]">订单金额</span>
            <span className="font-serif-sc text-[18px] text-[#7E2A1C]">{order.price}</span>
          </div>
        </div>
      </div>

      {/* Order Items */}
      <div className="bg-[#FBF5E9] rounded-[20px] p-4 border border-[#E8D7B4]/60 mb-4">
        <div className="text-[13px] text-[#7E2A1C] font-medium mb-3">商品清单</div>
        <div className="space-y-3">
          {order.items.map((item, idx) => {
            const product = productMap[item.productId];
            if (!product) return null;
            return (
              <div key={idx} className="flex items-center gap-3 pb-3 border-b border-[#E8D7B4] last:border-0 last:pb-0">
                <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center" style={{ backgroundColor: product.color }}>
                  <LotusMark small />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[#2D2018] font-medium truncate">{product.title}</div>
                  <div className="text-[11px] text-[#8A7860] mt-0.5">¥{item.price} × {item.quantity}</div>
                </div>
                <div className="text-[14px] text-[#7E2A1C] font-medium">
                  ¥{(item.price * item.quantity).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={onClose} className="w-full py-3 rounded-2xl bg-[#7E2A1C] text-[#FBE9C8] text-[13px] font-medium active:scale-[0.98]">
        关闭
      </button>
    </Sheet>
  );
}

/* ===================== BOTTOM NAV ===================== */
function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: "today", icon: <Home size={20} />, label: "今日" },
    { key: "browse", icon: <BookOpen size={20} />, label: "选内容" },
    { key: "shop", icon: <ShoppingBag size={20} />, label: "商城" },
    { key: "mine", icon: <User size={20} />, label: "我的" },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[#F6ECD7]/95 backdrop-blur-md border-t border-[#E8D7B4]/60 pb-6 pt-2 px-2">
      <div className="flex justify-around">
        {items.map((it) => {
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setTab(it.key)}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition active:scale-95 ${active ? "text-[#7E2A1C]" : "text-[#8A7860]/70"}`}
            >
              {it.icon}
              <span className={`text-[11px] ${active ? "font-medium" : ""}`}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== DECOR ===================== */
function LotusMark({ small }: { small?: boolean }) {
  const size = small ? 36 : 64;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="opacity-70">
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        <path d="M32 12 C 36 22, 36 32, 32 42 C 28 32, 28 22, 32 12 Z" />
        <path d="M32 14 C 42 22, 46 32, 42 44 C 34 38, 30 28, 32 14 Z" />
        <path d="M32 14 C 22 22, 18 32, 22 44 C 30 38, 34 28, 32 14 Z" />
        <circle cx="32" cy="44" r="3" />
      </g>
    </svg>
  );
}
