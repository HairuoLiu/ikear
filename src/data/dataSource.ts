// 数据源契约 —— M1–M4 只通过这里读写 Listing，不直接 import mockData。
//
// Supabase-ready：未来新增 `supabaseDataSource.ts` 实现同一个 DataSource 接口
//   getListings -> supabase.from('listings').select().match(...)
//   createListing -> supabase.from('listings').insert(...).select().single()
//   refreshListing -> update({ expires_at, status:'active' })
// 然后只替换 `export const dataSource = mockDataSource` 这一行即可切换后端。
import { CONVERSATIONS, CURRENT_USER, LISTINGS, MESSAGES, applyLegacyMirror } from './mockData';
// Supabase 真实后端实现（与 mockDataSource 同契约）。未设置 EXPO_PUBLIC_ 环境变量时不会被启用。
import { supabaseDataSource } from './supabaseDataSource';
import { DAY_MS, TTL_DAYS } from '../lib/expiry';
import type {
  CategoryId,
  Conversation,
  CreateListingInput,
  Listing,
  ListingStatus,
  ListingType,
  Message,
  User,
} from './types';

// 共享契约：M1–M4 可直接从本模块取领域类型，无需再 import './types'。
export type { Conversation, CreateListingInput, Listing, Message, User } from './types';

/**
 * 房源有效期（天）。到期后进入 expired，需要卖家刷新。
 * 单一真源是 lib/expiry.TTL_DAYS，这里只做转发，避免 30 这个常量出现多份拷贝
 * （后端对应 SQL 的 public.listing_ttl_days()）。
 */
export const LISTING_TTL_DAYS = TTL_DAYS;
/** 剩余天数 ≤ 该值时提示卖家刷新。 */
export const EXPIRING_SOON_DAYS = 3;

const DAY = DAY_MS;

export type ListingSort = 'newest' | 'price_asc' | 'price_desc' | 'expiring';

export interface ListingFilter {
  category?: CategoryId;
  city?: string;
  district?: string;
  status?: ListingStatus | ListingStatus[];
  type?: ListingType;
  sellerId?: string;
  query?: string;
  sort?: ListingSort;
}

/**
 * M1 浏览排序条的三档模式（与 store 的 SortMode 同名同义）：
 *   near  = 附近（地点权重在内存里由 lib/browse.ts 计算，数据层回落到最新）
 *   new   = 刚发布
 *   price = 价格（低 → 高）
 */
export type BrowseSortMode = 'near' | 'new' | 'price';

/** BrowseSortMode -> ListingSort 映射表。 */
export const BROWSE_SORT_MAP: Record<BrowseSortMode, ListingSort> = {
  near: 'newest',
  new: 'newest',
  price: 'price_asc',
};

/** 三档模式或原生 ListingSort 都接受，未知值回落 'newest'。 */
export function toListingSort(mode?: BrowseSortMode | ListingSort | null): ListingSort {
  if (!mode) return 'newest';
  const mapped = (BROWSE_SORT_MAP as Record<string, ListingSort>)[mode];
  if (mapped) return mapped;
  return (['newest', 'price_asc', 'price_desc', 'expiring'] as string[]).includes(mode)
    ? (mode as ListingSort)
    : 'newest';
}

/** 浏览用 filter 构造器：映射排序 + 默认只要 active（与 lib/browse.ts 口径一致）。 */
export function toBrowseFilter(
  input: Omit<ListingFilter, 'sort'> & { sort?: BrowseSortMode | ListingSort } = {}
): ListingFilter {
  const { sort, status, ...rest } = input;
  return { ...rest, status: status ?? 'active', sort: toListingSort(sort) };
}

/** 发布入口契约：title/price/category/photos 必填，其余由数据源补全。 */

export interface DataSource {
  getListings(filter?: ListingFilter): Promise<Listing[]>;
  getListing(id: string): Promise<Listing | null>;
  createListing(input: CreateListingInput): Promise<Listing>;
  /** 续期 TTL 并把 expired 重新激活；sold/archived 不受影响。 */
  refreshListing(id: string): Promise<Listing>;
  updateListing(id: string, patch: Partial<Listing>): Promise<Listing>;
  /** 当前登录用户资料（M4 Profile 页）。mock 下同步返回，未来换成 supabase.auth.getUser()。 */
  getProfile(): User;

  // ---- M3 详情与消息社交（同步读，与 getProfile 口径一致；await 亦可安全调用）----
  /** 会话列表，按 lastMessageAt 倒序（最新在前）。→ supabase.from('conversations') */
  getConversations(): Conversation[];
  /** 某会话下的消息，按 created_at 升序（最早在前）。未知 convId 返回 []。 */
  getMessages(convId: string): Message[];
  /** 收藏页：按 ids 批量取 Listing，保持传入顺序，未命中的 id 跳过。 */
  getFavorites(ids: string[]): Listing[];

  /**
   * 可选：预拉取「同步读」方法所依赖的数据（profile / 会话 / 消息）。
   * mock 实现不需要（数据本来就在内存里）；Supabase 实现必须在登录成功后调用一次，
   * 否则 getProfile/getConversations/getMessages 只会返回空缓存。
   * 调用方统一写 `await dataSource.hydrate?.()`，无需感知当前是哪种后端。
   */
  hydrate?(): Promise<void>;

  /**
   * 可选：商品详情页浏览量 +1，fire-and-forget（失败不影响浏览）。
   * mock 不实现 —— 内存数据里的 views 是静态展示值。
   */
  incrementListingViews?(id: string): Promise<void>;

  /**
   * 可选：按 id 读**他人**的公开资料（不含 email）。
   * mock 不实现 —— mock 的 Listing 上直接挂了 seller 快照。
   */
  getPublicProfile?(id: string): Promise<User | null>;
}

// ---------------------------------------------------------------------------
// 生命周期纯函数（M4 复用）
// ---------------------------------------------------------------------------

export function daysUntilExpiry(listing: Listing, now: number = Date.now()): number {
  return Math.ceil((new Date(listing.expiresAt).getTime() - now) / DAY);
}

export function isExpired(listing: Listing, now: number = Date.now()): boolean {
  return new Date(listing.expiresAt).getTime() <= now;
}

/** active 且剩余天数 ≤ EXPIRING_SOON_DAYS（尚未过期）。 */
export function isExpiringSoon(listing: Listing, now: number = Date.now()): boolean {
  if (listing.status !== 'active' || isExpired(listing, now)) return false;
  return daysUntilExpiry(listing, now) <= EXPIRING_SOON_DAYS;
}

/** 读取时惰性结算状态：过了 expiresAt 的 active 自动变 expired。 */
export function settleStatus(listing: Listing, now: number = Date.now()): Listing {
  if (listing.status === 'active' && isExpired(listing, now)) {
    return { ...listing, status: 'expired' };
  }
  return listing;
}

// ---------------------------------------------------------------------------
// Mock 实现（纯内存）
// ---------------------------------------------------------------------------

let db: Listing[] = LISTINGS.map((l) => ({ ...l }));
let seq = 0;

function matches(l: Listing, f: ListingFilter): boolean {
  if (f.category && l.category !== f.category) return false;
  if (f.type && l.type !== f.type) return false;
  if (f.sellerId && l.sellerId !== f.sellerId) return false;
  if (f.city && l.location.city !== f.city) return false;
  if (f.district && l.location.district !== f.district) return false;
  if (f.status) {
    const wanted = Array.isArray(f.status) ? f.status : [f.status];
    if (!wanted.includes(l.status)) return false;
  }
  if (f.query) {
    const q = f.query.trim().toLowerCase();
    if (
      q &&
      !l.title.toLowerCase().includes(q) &&
      !l.description.toLowerCase().includes(q)
    )
      return false;
  }
  return true;
}

function sortBy(list: Listing[], sort: ListingSort): Listing[] {
  const out = [...list];
  switch (sort) {
    case 'price_asc':
      return out.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return out.sort((a, b) => b.price - a.price);
    case 'expiring':
      return out.sort(
        (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
      );
    case 'newest':
    default:
      return out.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }
}

function find(id: string): Listing {
  const l = db.find((x) => x.id === id);
  if (!l) throw new Error(`Listing not found: ${id}`);
  return l;
}

function commit(next: Listing): Listing {
  const mirrored = applyLegacyMirror(next);
  db = db.map((l) => (l.id === mirrored.id ? mirrored : l));
  return mirrored;
}

export const mockDataSource: DataSource = {
  async getListings(filter = {}) {
    const now = Date.now();
    const rows = db.map((l) => settleStatus(l, now)).filter((l) => matches(l, filter));
    return sortBy(rows, filter.sort ?? 'newest');
  },

  async getListing(id) {
    const l = db.find((x) => x.id === id);
    return l ? settleStatus(l) : null;
  },

  async createListing(input) {
    // 必填校验（M2 引导式拍照发布入口依赖此契约）
    const missing: string[] = [];
    if (!input.title || !String(input.title).trim()) missing.push('title');
    if (input.price == null || Number.isNaN(input.price)) missing.push('price');
    if (!input.category) missing.push('category');
    if (!Array.isArray(input.photos) || input.photos.length === 0) missing.push('photos');
    if (missing.length) {
      throw new Error(`createListing 缺少必填字段: ${missing.join(', ')}`);
    }

    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt =
      input.expiresAt ?? new Date(now + LISTING_TTL_DAYS * DAY).toISOString();
    const listing: Listing = {
      id: `l_${now}_${++seq}`,
      title: input.title,
      description: input.description ?? '',
      price: input.price,
      condition: input.condition ?? '良好',
      category: input.category,
      photos: input.photos,
      coverIndex: input.coverIndex ?? 0,
      location: input.location ?? { city: '' },
      sellerId: input.sellerId ?? 'u_me',
      createdAt,
      expiresAt,
      status: input.status ?? 'active',
      type: input.type ?? 'secondhand',
    };
    const mirrored = applyLegacyMirror(listing);
    db = [mirrored, ...db];
    return mirrored;
  },

  async refreshListing(id) {
    const current = find(id);
    if (current.status === 'sold' || current.status === 'archived') return current;
    return commit({
      ...current,
      status: 'active',
      expiresAt: new Date(Date.now() + LISTING_TTL_DAYS * DAY).toISOString(),
    });
  },

  async updateListing(id, patch) {
    const current = find(id);
    return commit({ ...current, ...patch, id: current.id });
  },

  getProfile() {
    return { ...CURRENT_USER };
  },

  // ---- M3 详情与消息社交 ----

  getConversations() {
    return [...CONVERSATIONS].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  },

  getMessages(convId) {
    if (!convId) return [];
    return MESSAGES.filter((m) => m.conversationId === convId).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  },

  getFavorites(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const now = Date.now();
    return ids
      .map((id) => db.find((l) => l.id === id))
      .filter((l): l is Listing => !!l)
      .map((l) => settleStatus(l, now));
  },
};

/** 仅供测试：把内存库恢复成初始 mock 数据。 */
export function __resetMockDb(): void {
  db = LISTINGS.map((l) => ({ ...l }));
  seq = 0;
}

/**
 * 数据源切换（默认 mock，零配置可跑 / 可测）：
 *  - 同时设置 EXPO_PUBLIC_SUPABASE_URL 与 EXPO_PUBLIC_SUPABASE_ANON_KEY → 使用 Supabase 真实后端
 *  - 否则（默认）→ 使用内置 mock
 * 调用方统一 `import { dataSource } from './dataSource'`，无需感知后端切换。
 * 注：EXPO_PUBLIC_ 变量由 Expo 在构建期内联；此处 dot-access 字面量确保能被内联。
 */
function supabaseEnabled(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

export const dataSource: DataSource = supabaseEnabled() ? supabaseDataSource : mockDataSource;
