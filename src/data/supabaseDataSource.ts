// Supabase 数据源实现 —— 与 mockDataSource 实现同一个 DataSource 契约。
// 由 src/data/dataSource.ts 在检测到 EXPO_PUBLIC_ 环境变量时切换启用。
//
// 字段映射：DB 用 snake_case，前端 canonical 用 camelCase，本文件负责转换。
// 同步方法（getProfile / getConversations / getMessages / getFavorites）采用
// cache-aside：异步方法或 hydrate() 预拉取后写入缓存，同步方法直接读缓存返回，
// 保证与 DataSource 接口的「同步返回」签名一致（未来可整体改为 async 接口）。
import { getSupabaseClient } from '../lib/supabase';
import type {
  Conversation,
  CreateListingInput,
  Favorite,
  Listing,
  Message,
  User,
} from './types';
import type { DataSource, ListingFilter } from './dataSource';

// ---------------------------------------------------------------------------
// 行映射（DB snake_case → 前端 canonical camelCase）
// ---------------------------------------------------------------------------
function mapListing(row: any): Listing {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    price: row.price ?? 0,
    condition: row.condition,
    category: row.category,
    photos: Array.isArray(row.photos) ? row.photos : [],
    coverIndex: row.cover_index ?? 0,
    location: row.location ?? { city: '' },
    sellerId: row.seller_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status,
    type: row.type ?? 'secondhand',
    boostedUntil: row.boosted_until ?? undefined,
    discount: row.discount ?? undefined,
  };
}

function mapProfile(row: any): User {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    avatar_url: row.avatar_url ?? null,
    city: row.city ?? '',
    created_at: row.created_at,
    district: row.district ?? undefined,
    rating: row.rating ?? undefined,
    soldCount: row.sold_count ?? undefined,
  };
}

function mapConversation(row: any): Conversation {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count ?? 0,
  };
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    listing_id: row.listing_id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    content: row.content,
    read: row.read ?? false,
    created_at: row.created_at,
    conversationId: row.conversation_id ?? undefined,
  };
}

/** canonical Listing patch → DB snake_case 行（用于 update）。 */
function toRow(patch: Partial<Listing>): Record<string, any> {
  const row: Record<string, any> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.condition !== undefined) row.condition = patch.condition;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.photos !== undefined) row.photos = patch.photos;
  if (patch.coverIndex !== undefined) row.cover_index = patch.coverIndex;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.discount !== undefined) row.discount = patch.discount;
  if (patch.boostedUntil !== undefined) row.boosted_until = patch.boostedUntil;
  return row;
}

// ---------------------------------------------------------------------------
// cache-aside：同步方法的数据源
// ---------------------------------------------------------------------------
const cache: {
  profile?: User;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  listings: Listing[];
} = { conversations: [], messages: {}, listings: [] };

/** 登录 / 应用启动后调用，预拉取社交与资料数据，供同步方法读取。 */
export async function hydrate(): Promise<void> {
  const client = await getSupabaseClient();
  const { data: auth } = await client.auth.getUser();
  const uid = auth?.user?.id;
  if (uid) {
    const { data: prof } = await client.from('profiles').select('*').eq('id', uid).single();
    if (prof) cache.profile = mapProfile(prof);
  }
  const { data: convs } = await client
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${uid ?? ''},seller_id.eq.${uid ?? ''}`)
    .order('last_message_at', { ascending: false });
  cache.conversations = (convs ?? []).map(mapConversation);
  for (const c of cache.conversations) {
    const { data: msgs } = await client
      .from('messages')
      .select('*')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: true });
    cache.messages[c.id] = (msgs ?? []).map(mapMessage);
  }
}

const TTL_MS = 30 * 86_400_000;

export const supabaseDataSource: DataSource = {
  async getListings(filter: ListingFilter = {}) {
    const client = await getSupabaseClient();
    let q = client.from('listings').select('*');
    if (filter.category) q = q.eq('category', filter.category);
    if (filter.type) q = q.eq('type', filter.type);
    if (filter.sellerId) q = q.eq('seller_id', filter.sellerId);
    if (filter.city) q = q.eq('location->>city', filter.city);
    if (filter.district) q = q.eq('location->>district', filter.district);
    if (filter.status) {
      const wanted = Array.isArray(filter.status) ? filter.status : [filter.status];
      q = q.in('status', wanted);
    } else {
      q = q.eq('status', 'active');
    }
    if (filter.query) q = q.ilike('title', `%${filter.query}%`);

    const sort = filter.sort ?? 'newest';
    if (sort === 'price_asc') q = q.order('price', { ascending: true });
    else if (sort === 'price_desc') q = q.order('price', { ascending: false });
    else if (sort === 'expiring') q = q.order('expires_at', { ascending: true });
    else q = q.order('created_at', { ascending: false });

    const { data, error } = await q;
    if (error) throw new Error(`getListings 失败: ${error.message}`);
    const rows = (data ?? []).map(mapListing);
    cache.listings = rows;
    return rows;
  },

  async getListing(id: string) {
    const client = await getSupabaseClient();
    const { data, error } = await client.from('listings').select('*').eq('id', id).single();
    if (error) throw new Error(`getListing 失败: ${error.message}`);
    return data ? mapListing(data) : null;
  },

  async createListing(input: CreateListingInput) {
    const client = await getSupabaseClient();
    const missing: string[] = [];
    if (!input.title || !String(input.title).trim()) missing.push('title');
    if (input.price == null || Number.isNaN(input.price)) missing.push('price');
    if (!input.category) missing.push('category');
    if (!Array.isArray(input.photos) || input.photos.length === 0) missing.push('photos');
    if (missing.length) throw new Error(`createListing 缺少必填字段: ${missing.join(', ')}`);

    const { data: auth } = await client.auth.getUser();
    const row = {
      title: input.title,
      description: input.description ?? '',
      price: input.price,
      condition: input.condition ?? '良好',
      category: input.category,
      photos: input.photos,
      cover_index: input.coverIndex ?? 0,
      location: input.location ?? { city: '' },
      seller_id: input.sellerId ?? auth.data.user?.id ?? 'u_me',
      expires_at: input.expiresAt ?? new Date(Date.now() + TTL_MS).toISOString(),
      status: input.status ?? 'active',
      type: input.type ?? 'secondhand',
    };
    const { data, error } = await client.from('listings').insert(row).select().single();
    if (error) throw new Error(`createListing 失败: ${error.message}`);
    return mapListing(data);
  },

  async refreshListing(id: string) {
    const client = await getSupabaseClient();
    const { data: cur, error: e1 } = await client
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();
    if (e1) throw new Error(`refreshListing 失败: ${e1.message}`);
    if (cur.status === 'sold' || cur.status === 'archived') return mapListing(cur);
    const { data, error } = await client
      .from('listings')
      .update({ status: 'active', expires_at: new Date(Date.now() + TTL_MS).toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`refreshListing 失败: ${error.message}`);
    return mapListing(data);
  },

  async updateListing(id: string, patch: Partial<Listing>) {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('listings')
      .update(toRow(patch))
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`updateListing 失败: ${error.message}`);
    return mapListing(data);
  },

  getProfile(): User {
    if (cache.profile) return cache.profile;
    return {
      id: 'u_me',
      email: '',
      nickname: '我',
      avatar_url: null,
      city: '',
      created_at: new Date().toISOString(),
    };
  },

  getConversations(): Conversation[] {
    return cache.conversations;
  },

  getMessages(convId: string): Message[] {
    if (!convId) return [];
    return cache.messages[convId] ?? [];
  },

  getFavorites(ids: string[]): Listing[] {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return ids
      .map((id) => cache.listings.find((l) => l.id === id))
      .filter((l): l is Listing => !!l);
  },
};

// 占位引用，避免未使用类型导入告警（Favorite 在后端表存在，前端通过 listings 读取）。
export type _UnusedFavorite = Favorite;
