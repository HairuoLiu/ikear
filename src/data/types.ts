// IKEAR — 领域类型契约（M0）
// 这里是 M1–M4 共同消费的唯一数据契约来源。
// 后端接入 Supabase 后，表结构应与本文件的 canonical 字段一一对应（camelCase -> snake_case 由 dataSource 层负责映射）。

export type ID = string;

// ---------------------------------------------------------------------------
// 品类 taxonomy（对齐宜家官网顶层导航）
// ---------------------------------------------------------------------------

export type CategoryId =
  | 'sofa'
  | 'chair'
  | 'bed'
  | 'table'
  | 'desk'
  | 'lighting'
  | 'storage'
  | 'wardrobe'
  | 'kitchen'
  | 'bath'
  | 'kids'
  | 'textile'
  | 'decor'
  | 'outdoor'
  | 'other';

export interface CategoryMeta {
  id: CategoryId;
  name: string; // 中文展示名
  emoji: string;
}

// ---------------------------------------------------------------------------
// 通用
// ---------------------------------------------------------------------------

export interface Location {
  city: string;
  district?: string;
}

export type Condition = '全新' | '良好' | '一般' | '磨损';

export type ListingStatus = 'active' | 'expired' | 'sold' | 'archived';

/** secondhand = 用户二手家具；accessory = 平台周边/配件（M5 商城） */
export type ListingType = 'secondhand' | 'accessory';

/** 发布入口契约：title/price/category/photos 必填，其余由 dataSource 补全。 */
export type CreateListingInput = Partial<Listing> & {
  title: string;
  price: number;
  category: CategoryId;
  photos: string[];
};

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export interface Listing extends LegacyListingFields {
  id: ID;
  title: string;
  description: string;
  price: number;
  condition: Condition;
  category: CategoryId;
  photos: string[]; // mock 模式下为 emoji 占位符，真实模式下为 uri
  coverIndex: number; // photos 中封面图的下标
  location: Location;
  sellerId: ID;
  createdAt: string; // ISO
  expiresAt: string; // ISO —— 到期后由 M4 生命周期逻辑置为 expired
  status: ListingStatus;
  type: ListingType;
  boostedUntil?: string; // ISO，置顶到期时间
  discount?: number; // 0–100，折扣百分比
}

/**
 * @deprecated 旧版字段镜像，仅为让尚未迁移的 screens/components/lib 继续渲染。
 * M1 完成迁移后整块删除。新代码一律使用上面的 canonical 字段。
 */
export interface LegacyListingFields {
  seller_id?: ID;
  category_id?: number;
  images?: string[];
  city?: string;
  created_at?: string;
  views?: number;
  has_damage?: boolean;
  damage_description?: string | null;
  lat?: number | null;
  lng?: number | null;
  seller?: Partial<User>;
}

// ---------------------------------------------------------------------------
// 用户 / 会话 / 消息（M3）
// ---------------------------------------------------------------------------

export interface User {
  id: ID;
  email: string;
  nickname: string;
  avatar_url: string | null;
  city: string;
  created_at: string;
  district?: string;
  rating?: number; // 0–5
  soldCount?: number;
}

export interface Conversation {
  id: ID;
  listingId: ID;
  buyerId: ID;
  sellerId: ID;
  lastMessage: string;
  lastMessageAt: string; // ISO
  unreadCount: number;
}

export interface Message {
  id: ID;
  listing_id: ID;
  sender_id: ID;
  receiver_id: ID;
  content: string;
  read: boolean;
  created_at: string;
  conversationId?: ID;
  sender?: Partial<User>;
}

export interface Favorite {
  user_id: ID;
  listing_id: ID;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 展示辅助常量
// ---------------------------------------------------------------------------

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: '全新', label: '全新' },
  { value: '良好', label: '良好' },
  { value: '一般', label: '一般' },
  { value: '磨损', label: '磨损' },
];

export const conditionMeta: Record<
  Condition,
  { label: string; bg: string; fg: string }
> = {
  全新: { label: '全新', bg: '#E3F9E5', fg: '#1A7F37' },
  良好: { label: '良好', bg: '#E5F1FB', fg: '#0066D6' },
  一般: { label: '一般', bg: '#FFF4E0', fg: '#B26A00' },
  磨损: { label: '磨损', bg: '#FFE9E7', fg: '#C0392B' },
};

/**
 * @deprecated 旧版数字 id 品类，仅供未迁移的 lib/format.ts 与 screens 使用。
 * 新代码请使用 CategoryMeta + CategoryId（见 categories.ts）。
 */
export interface Category {
  id: number;
  name: string;
  name_zh: string;
  icon: string;
  slug: string;
}
