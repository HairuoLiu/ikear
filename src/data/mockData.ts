// Mock 数据（离线运行，无需 Supabase）。
// 接入后端时整个模块由 supabase 查询替换，dataSource.ts 是唯一读取入口。
import { CATEGORIES as CATEGORY_META } from './categories';
import type {
  Category,
  Conversation,
  Listing,
  Message,
  User,
} from './types';

const NOW = Date.now();
const DAY = 86_400_000;

const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();
const daysAhead = (d: number) => new Date(NOW + d * DAY).toISOString();
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

// ---------------------------------------------------------------------------
// 用户
// ---------------------------------------------------------------------------

export const CURRENT_USER: User = {
  id: 'u_me',
  email: 'zhanliu@ikear.app',
  nickname: '湛琉',
  avatar_url: null,
  city: '多伦多',
  district: 'North York',
  created_at: '2026-01-08T09:00:00Z',
  rating: 4.9,
  soldCount: 12,
};

export const USERS: User[] = [
  CURRENT_USER,
  {
    id: 'u_2',
    email: 'amy@ikear.app',
    nickname: 'Amy的收纳间',
    avatar_url: null,
    city: '万锦',
    district: 'Unionville',
    created_at: '2025-11-02T09:00:00Z',
    rating: 4.7,
    soldCount: 31,
  },
  {
    id: 'u_3',
    email: 'leo@ikear.app',
    nickname: 'Leo在北边',
    avatar_url: null,
    city: '密西沙加',
    district: 'Square One',
    created_at: '2025-12-19T09:00:00Z',
    rating: 4.5,
    soldCount: 8,
  },
  {
    id: 'u_shop',
    email: 'shop@ikear.app',
    nickname: 'IKEAR 周边小铺',
    avatar_url: null,
    city: '多伦多',
    district: 'Downtown',
    created_at: '2025-09-01T09:00:00Z',
    rating: 5,
    soldCount: 240,
  },
];

const userById = (id: string) => USERS.find((u) => u.id === id);

// ---------------------------------------------------------------------------
// Listings
// 分布（供 M4 生命周期测试）：
//   active 常规      : l_2 l_3 l_5 l_6 l_7 l_8 l_12（到期 9–29 天）
//   active 临期 ≤3d  : l_1(+2d) l_4(+3d)   -> 触发「刷新提醒」
//   expired          : l_9(-2d) l_10(-6d)  -> 触发「已过期，去刷新」
//   sold             : l_11
//   accessory(周边)  : a_1 a_2 a_3         -> M5 商城占位
// ---------------------------------------------------------------------------

const RAW_LISTINGS: Listing[] = [
  {
    id: 'l_1',
    title: '宜家 MALM 双人床架（含床板）',
    description: '用了不到一年，搬家带走不方便。床架结构完好，无任何晃动，原装五金齐全，自提即可。',
    price: 180,
    condition: '良好',
    category: 'bed',
    photos: ['🛏️', '🛏️', '🛏️'],
    coverIndex: 0,
    location: { city: '万锦', district: 'Unionville' },
    sellerId: 'u_2',
    createdAt: daysAgo(28),
    expiresAt: daysAhead(2), // 临期
    status: 'active',
    type: 'secondhand',
    views: 142,
  },
  {
    id: 'l_2',
    title: 'HEMNES 实木书架 白色',
    description: '经典款，承重好。侧面有一道浅划痕（见图），不影响使用。',
    price: 95,
    condition: '一般',
    category: 'storage',
    photos: ['📚', '📚'],
    coverIndex: 0,
    location: { city: '密西沙加', district: 'Square One' },
    sellerId: 'u_3',
    createdAt: daysAgo(5),
    expiresAt: daysAhead(25),
    status: 'active',
    type: 'secondhand',
    views: 88,
    damage_description: '侧面浅划痕约 5cm',
  },
  {
    id: 'l_3',
    title: 'POÄNG 扶手椅 + 坐垫（全新未拆）',
    description: '多买了一把，原封未拆，带灰色坐垫。可小刀。',
    price: 120,
    condition: '全新',
    category: 'chair',
    photos: ['🪑', '🪑'],
    coverIndex: 1,
    location: { city: '万锦', district: 'Milliken Mills' },
    sellerId: 'u_2',
    createdAt: daysAgo(2),
    expiresAt: daysAhead(28),
    status: 'active',
    type: 'secondhand',
    views: 203,
  },
  {
    id: 'l_4',
    title: 'BILLY 书柜 深灰色（带玻璃门）',
    description: '两门带玻璃，客厅用，整体干净无异味。需自行拆装搬运。',
    price: 70,
    condition: '良好',
    category: 'storage',
    photos: ['📚'],
    coverIndex: 0,
    location: { city: '密西沙加', district: 'Erin Mills' },
    sellerId: 'u_3',
    createdAt: daysAgo(27),
    expiresAt: daysAhead(3), // 临期
    status: 'active',
    type: 'secondhand',
    views: 56,
  },
  {
    id: 'l_5',
    title: 'LACK 边几 黑色',
    description: '小边几，放沙发旁刚好。四角略有磕碰。',
    price: 25,
    condition: '一般',
    category: 'table',
    photos: ['🍽️'],
    coverIndex: 0,
    location: { city: '多伦多', district: 'North York' },
    sellerId: 'u_me',
    createdAt: daysAgo(12),
    expiresAt: daysAhead(18),
    status: 'active',
    type: 'secondhand',
    views: 31,
    damage_description: '桌角轻微磕碰',
  },
  {
    id: 'l_6',
    title: 'STOCKHOLM 羊毛地毯 160x230',
    description: '羊毛混纺，脚感很好，已专业清洗。轻微起球。',
    price: 110,
    condition: '一般',
    category: 'textile',
    photos: ['🧵', '🧵'],
    coverIndex: 0,
    location: { city: '万锦', district: 'Unionville' },
    sellerId: 'u_2',
    createdAt: daysAgo(18),
    expiresAt: daysAhead(12),
    status: 'active',
    type: 'secondhand',
    views: 64,
  },
  {
    id: 'l_7',
    title: 'HEKTAR 工业风落地灯',
    description: '可调节灯头，金属质感，附送 LED 灯泡。',
    price: 45,
    condition: '全新',
    category: 'lighting',
    photos: ['💡'],
    coverIndex: 0,
    location: { city: '密西沙加', district: 'Port Credit' },
    sellerId: 'u_3',
    createdAt: daysAgo(9),
    expiresAt: daysAhead(21),
    status: 'active',
    type: 'secondhand',
    views: 77,
  },
  {
    id: 'l_8',
    title: 'MICKE 书桌（含抽屉柜）',
    description: '白色，适合小空间。桌面有使用痕迹，抽屉滑轨顺滑。',
    price: 60,
    condition: '良好',
    category: 'desk',
    photos: ['🖥️', '🖥️'],
    coverIndex: 0,
    location: { city: '多伦多', district: 'Downtown' },
    sellerId: 'u_me',
    createdAt: daysAgo(21),
    expiresAt: daysAhead(9),
    status: 'active',
    type: 'secondhand',
    views: 49,
  },
  {
    id: 'l_9',
    title: 'PAX 衣柜 2.36m（白色，含内部配件）',
    description: '整套出，含挂衣杆与抽屉。需自提并自行拆卸。',
    price: 320,
    condition: '良好',
    category: 'wardrobe',
    photos: ['🚪', '🚪', '🚪'],
    coverIndex: 2,
    location: { city: '多伦多', district: 'Scarborough' },
    sellerId: 'u_me',
    createdAt: daysAgo(32),
    expiresAt: daysAgo(2), // 已过期
    status: 'expired',
    type: 'secondhand',
    views: 310,
  },
  {
    id: 'l_10',
    title: 'KALLAX 4x4 储物架 橡木色',
    description: '搭配 6 个储物盒一起出。层板无变形。',
    price: 130,
    condition: '良好',
    category: 'storage',
    photos: ['📦', '📦'],
    coverIndex: 0,
    location: { city: '万锦', district: 'Markville' },
    sellerId: 'u_2',
    createdAt: daysAgo(36),
    expiresAt: daysAgo(6), // 已过期
    status: 'expired',
    type: 'secondhand',
    views: 175,
  },
  {
    id: 'l_11',
    title: 'EKEDALEN 可伸缩餐桌 + 4 椅',
    description: '已出，感谢关注。',
    price: 260,
    condition: '良好',
    category: 'table',
    photos: ['🍽️'],
    coverIndex: 0,
    location: { city: '多伦多', district: 'Etobicoke' },
    sellerId: 'u_3',
    createdAt: daysAgo(24),
    expiresAt: daysAhead(6),
    status: 'sold',
    type: 'secondhand',
    views: 402,
  },
  {
    id: 'l_12',
    title: 'SÖDERHAMN 三人沙发 米白布艺',
    description: '沙发套可拆洗，已洗净。无宠物无烟家庭。诚意可小刀，本周急出。',
    price: 450,
    condition: '良好',
    category: 'sofa',
    photos: ['🛋️', '🛋️', '🛋️'],
    coverIndex: 1,
    location: { city: '多伦多', district: 'Midtown' },
    sellerId: 'u_me',
    createdAt: daysAgo(1),
    expiresAt: daysAhead(29),
    status: 'active',
    type: 'secondhand',
    boostedUntil: daysAhead(4), // 置顶中
    discount: 10,
    views: 96,
  },
  // ---- 周边配件（M5 商城占位）----
  {
    id: 'a_1',
    title: 'FRAKTA 蓝色购物袋（大号 2 只装）',
    description: '搬家神器，承重 25kg。全新未使用。',
    price: 8,
    condition: '全新',
    category: 'other',
    photos: ['🛍️'],
    coverIndex: 0,
    location: { city: '多伦多', district: 'Downtown' },
    sellerId: 'u_shop',
    createdAt: daysAgo(4),
    expiresAt: daysAhead(26),
    status: 'active',
    type: 'accessory',
    views: 58,
  },
  {
    id: 'a_2',
    title: 'BLÅHAJ 鲨鱼玩偶 100cm',
    description: '全新带吊牌，网红同款，适合送礼。',
    price: 32,
    condition: '全新',
    category: 'kids',
    photos: ['🦈'],
    coverIndex: 0,
    location: { city: '多伦多', district: 'Downtown' },
    sellerId: 'u_shop',
    createdAt: daysAgo(16),
    expiresAt: daysAhead(14),
    status: 'active',
    type: 'accessory',
    discount: 15,
    views: 221,
  },
  {
    id: 'a_3',
    title: '宜家家具通用组装五金包（含内六角）',
    description: '常见螺丝／木榫／内六角扳手一套，补件必备。',
    price: 12,
    condition: '全新',
    category: 'other',
    photos: ['🔧'],
    coverIndex: 0,
    location: { city: '多伦多', district: 'North York' },
    sellerId: 'u_shop',
    createdAt: daysAgo(23),
    expiresAt: daysAhead(7),
    status: 'active',
    type: 'accessory',
    views: 44,
  },
];

/**
 * @deprecated 旧版数字 id 品类表，由新 taxonomy 派生，仅供未迁移的 lib/format.ts 与 screens 使用。
 */
export const CATEGORIES: Category[] = CATEGORY_META.map((c, i) => ({
  id: i + 1,
  name: c.id.charAt(0).toUpperCase() + c.id.slice(1),
  name_zh: c.name,
  icon: c.emoji,
  slug: c.id,
}));

const legacyCategoryId = (slug: string) =>
  CATEGORIES.find((c) => c.slug === slug)?.id ?? CATEGORIES.length;

/** 把 canonical 字段镜像成旧字段，保证未迁移的 UI 仍能渲染。M1 迁移完成后删除。 */
export function applyLegacyMirror(l: Listing): Listing {
  return {
    ...l,
    seller_id: l.sellerId,
    category_id: legacyCategoryId(l.category),
    images: l.photos,
    city: l.location.city,
    created_at: l.createdAt,
    views: l.views ?? 0,
    has_damage: !!l.damage_description,
    damage_description: l.damage_description ?? null,
    lat: null,
    lng: null,
    seller: userById(l.sellerId),
  };
}

export const LISTINGS: Listing[] = RAW_LISTINGS.map(applyLegacyMirror);

// ---------------------------------------------------------------------------
// 会话与消息（M3）
//
// Conversation 类型无 messages 字段（契约在 types.ts，M3 不改），
// 会话与消息通过 Message.conversationId 关联，读取统一走 dataSource.getMessages()。
//
// 分布（供 M3 消息流测试）：
//   c_1 l_1  u_3 ↔ u_2   2 条（1 未读）   —— M0 原有
//   c_2 l_3  u_me ↔ u_2  1 条（1 未读）   —— M0 原有
//   c_3 l_12 u_3 ↔ u_me  4 条（2 未读）   —— 议价 + 自提，收发混合
//   c_4 l_2  u_me ↔ u_3  3 条（0 未读）   —— 问瑕疵，全部已读
//   c_5 l_8  u_2 ↔ u_me  3 条（1 未读）   —— 拆分出售，收发混合
// 不变量：unreadCount === 该会话内 read=false 的消息数；
//         Message.listing_id === 所属 Conversation.listingId。
// ---------------------------------------------------------------------------

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'c_1',
    listingId: 'l_1',
    buyerId: 'u_3',
    sellerId: 'u_2',
    lastMessage: '在的，周六下午可以，地点万锦。',
    lastMessageAt: minsAgo(20),
    unreadCount: 1,
  },
  {
    id: 'c_2',
    listingId: 'l_3',
    buyerId: 'u_me',
    sellerId: 'u_2',
    lastMessage: 'POÄNG 椅子自提还是可以送货？',
    lastMessageAt: minsAgo(120),
    unreadCount: 1,
  },
  {
    id: 'c_3',
    listingId: 'l_12', // SÖDERHAMN 三人沙发，卖家 u_me
    buyerId: 'u_3',
    sellerId: 'u_me',
    lastMessage: '另外方便拍一下沙发底部的框架吗？',
    lastMessageAt: minsAgo(42),
    unreadCount: 2,
  },
  {
    id: 'c_4',
    listingId: 'l_2', // HEMNES 书架，卖家 u_3
    buyerId: 'u_me',
    sellerId: 'u_3',
    lastMessage: '好的，我这两天定一下，谢谢！',
    lastMessageAt: minsAgo(1400),
    unreadCount: 0,
  },
  {
    id: 'c_5',
    listingId: 'l_8', // MICKE 书桌，卖家 u_me
    buyerId: 'u_2',
    sellerId: 'u_me',
    lastMessage: '好的，明天给你答复～',
    lastMessageAt: minsAgo(8),
    unreadCount: 1,
  },
];

export const MESSAGES: Message[] = [
  {
    id: 'm_1',
    listing_id: 'l_1',
    sender_id: 'u_3',
    receiver_id: 'u_me',
    content: '你好，MALM 床架还在吗？可以周末看货吗？',
    read: false,
    created_at: minsAgo(35),
    conversationId: 'c_1',
    sender: USERS[2],
  },
  {
    id: 'm_2',
    listing_id: 'l_1',
    sender_id: 'u_me',
    receiver_id: 'u_3',
    content: '在的，周六下午可以，地点万锦。',
    read: true,
    created_at: minsAgo(20),
    conversationId: 'c_1',
    sender: CURRENT_USER,
  },
  {
    id: 'm_3',
    listing_id: 'l_3',
    sender_id: 'u_2',
    receiver_id: 'u_me',
    content: 'POÄNG 椅子自提还是可以送货？',
    read: false,
    created_at: minsAgo(120),
    conversationId: 'c_2',
    sender: USERS[1],
  },
  // ---- c_3：l_12 沙发，买家 u_3 ↔ 卖家 u_me（收发混合，2 条未读）----
  {
    id: 'm_4',
    listing_id: 'l_12',
    sender_id: 'u_3',
    receiver_id: 'u_me',
    content: '沙发还在吗？写着诚意可小刀，450 能到 400 吗？',
    read: true,
    created_at: minsAgo(300),
    conversationId: 'c_3',
    sender: userById('u_3'),
  },
  {
    id: 'm_5',
    listing_id: 'l_12',
    sender_id: 'u_me',
    receiver_id: 'u_3',
    content: '在的。420 可以，沙发套刚洗过，几乎没有使用痕迹。',
    read: true,
    created_at: minsAgo(288),
    conversationId: 'c_3',
    sender: CURRENT_USER,
  },
  {
    id: 'm_6',
    listing_id: 'l_12',
    sender_id: 'u_3',
    receiver_id: 'u_me',
    content: '成交。我周日下午开车过来自提，需要两个人搬吗？',
    read: false,
    created_at: minsAgo(45),
    conversationId: 'c_3',
    sender: userById('u_3'),
  },
  {
    id: 'm_7',
    listing_id: 'l_12',
    sender_id: 'u_3',
    receiver_id: 'u_me',
    content: '另外方便拍一下沙发底部的框架吗？',
    read: false,
    created_at: minsAgo(42),
    conversationId: 'c_3',
    sender: userById('u_3'),
  },
  // ---- c_4：l_2 书架，买家 u_me ↔ 卖家 u_3（全部已读）----
  {
    id: 'm_8',
    listing_id: 'l_2',
    sender_id: 'u_me',
    receiver_id: 'u_3',
    content: '书架的划痕在哪一面？靠墙摆放会看到吗？',
    read: true,
    created_at: minsAgo(1500),
    conversationId: 'c_4',
    sender: CURRENT_USER,
  },
  {
    id: 'm_9',
    listing_id: 'l_2',
    sender_id: 'u_3',
    receiver_id: 'u_me',
    content: '在右侧板中间，约 5cm，靠墙放完全看不到。',
    read: true,
    created_at: minsAgo(1440),
    conversationId: 'c_4',
    sender: userById('u_3'),
  },
  {
    id: 'm_10',
    listing_id: 'l_2',
    sender_id: 'u_me',
    receiver_id: 'u_3',
    content: '好的，我这两天定一下，谢谢！',
    read: true,
    created_at: minsAgo(1400),
    conversationId: 'c_4',
    sender: CURRENT_USER,
  },
  // ---- c_5：l_8 书桌，买家 u_2 ↔ 卖家 u_me（收发混合，1 条未读）----
  {
    id: 'm_11',
    listing_id: 'l_8',
    sender_id: 'u_2',
    receiver_id: 'u_me',
    content: 'MICKE 书桌的抽屉柜是分体的吗？我只想要桌子。',
    read: true,
    created_at: minsAgo(30),
    conversationId: 'c_5',
    sender: userById('u_2'),
  },
  {
    id: 'm_12',
    listing_id: 'l_8',
    sender_id: 'u_me',
    receiver_id: 'u_2',
    content: '是分体的，桌子可以单独出 45，抽屉柜留着自用。',
    read: true,
    created_at: minsAgo(25),
    conversationId: 'c_5',
    sender: CURRENT_USER,
  },
  {
    id: 'm_13',
    listing_id: 'l_8',
    sender_id: 'u_2',
    receiver_id: 'u_me',
    content: '好的，明天给你答复～',
    read: false,
    created_at: minsAgo(8),
    conversationId: 'c_5',
    sender: userById('u_2'),
  },
];
