// Supabase 数据源实现 —— 与 mockDataSource 实现同一个 DataSource 契约。
// 由 src/data/dataSource.ts 在检测到 EXPO_PUBLIC_ 环境变量时切换启用。
//
// 字段映射：DB 用 snake_case，前端 canonical 用 camelCase，本文件负责转换。
// 同步方法（getProfile / getConversations / getMessages / getFavorites）采用
// cache-aside：异步方法或 hydrate() 预拉取后写入缓存，同步方法直接读缓存返回，
// 保证与 DataSource 接口的「同步返回」签名一致（未来可整体改为 async 接口）。
import { getSupabaseClient } from '../lib/supabase';
import { DAY_MS, TTL_DAYS, isExpired } from '../lib/expiry';
import type {
  Conversation,
  CreateConversationInput,
  CreateListingInput,
  Listing,
  Message,
  SendMessageInput,
  User,
} from './types';
import type { DataSource, ListingFilter } from './dataSource';

// ---------------------------------------------------------------------------
// 行映射（DB snake_case → 前端 canonical camelCase）
// ---------------------------------------------------------------------------
function mapListing(row: any): Listing {
  const listing: Listing = {
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
    views: row.views ?? 0,
  };
  // 与 mockDataSource.settleStatus 同口径：过了 expiresAt 的 active 读取时惰性结算为 expired。
  // 否则同一条数据在 mock / Supabase 两种模式下会呈现不同状态。
  if (listing.status === 'active' && isExpired(listing)) {
    return { ...listing, status: 'expired' };
  }
  return listing;
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

/**
 * canonical Listing patch → DB snake_case 行（用于 update）。
 *
 * 0003_privilege_hardening 之后，listings 的特权列由 BEFORE UPDATE 触发器接管：
 *   - views / created_at / seller_id：客户端发了也会被静默钉回原值 → 这里直接不发；
 *   - expires_at / boosted_until：客户端一改就 raise 42501 → 这里提前抛可读错误，
 *     避免调用方拿到一个「看似成功其实没生效」或含糊的数据库报错。
 *     续期唯一入口是 refreshListing()（走 refresh-listing Edge Function）。
 */
function toRow(patch: Partial<Listing>): Record<string, any> {
  if (patch.expiresAt !== undefined) {
    throw new Error('updateListing 不能修改 expiresAt：续期请调用 refreshListing()');
  }
  if (patch.boostedUntil !== undefined) {
    throw new Error('updateListing 不能修改 boostedUntil：推广位由平台侧发放');
  }

  const row: Record<string, any> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.condition !== undefined) row.condition = patch.condition;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.photos !== undefined) row.photos = patch.photos;
  if (patch.coverIndex !== undefined) row.cover_index = patch.coverIndex;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.discount !== undefined) row.discount = patch.discount;
  // seller_id / created_at / views 刻意不映射：服务端会钉回原值，发送只是徒增载荷。
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
  // 未登录：清空缓存直接返回。把空 uid 拼进 .or() 会得到非法 uuid 过滤条件并被后端拒绝。
  if (!uid) {
    cache.profile = undefined;
    cache.conversations = [];
    cache.messages = {};
    return;
  }

  const { data: prof } = await client.from('profiles').select('*').eq('id', uid).maybeSingle();
  cache.profile = prof ? mapProfile(prof) : undefined;

  const { data: convs } = await client
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
    .order('last_message_at', { ascending: false });
  cache.conversations = (convs ?? []).map(mapConversation);

  // 一次性拉全部会话消息，避免按会话逐条查询造成 N+1。
  const convIds = cache.conversations.map((c) => c.id);
  const grouped: Record<string, Message[]> = {};
  if (convIds.length > 0) {
    const { data: msgs } = await client
      .from('messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true });
    for (const row of msgs ?? []) {
      const msg = mapMessage(row);
      const key = msg.conversationId;
      if (!key) continue;
      (grouped[key] ??= []).push(msg);
    }
  }
  for (const id of convIds) grouped[id] ??= [];
  cache.messages = grouped;
}

const TTL_MS = TTL_DAYS * DAY_MS;

export const supabaseDataSource: DataSource = {
  hydrate,

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
    // maybeSingle：查无此条（或被 RLS 过滤）时返回 null 而不是抛错，与接口契约
    // `Promise<Listing | null>` 及 mockDataSource 的行为保持一致。
    const { data, error } = await client.from('listings').select('*').eq('id', id).maybeSingle();
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
    const sellerId = input.sellerId ?? auth?.user?.id;
    // seller_id 是 uuid 外键且受 RLS `seller_id = auth.uid()` 约束，
    // 未登录时提前抛出可读错误，避免落到数据库变成 22P02 / RLS 拒绝。
    if (!sellerId) throw new Error('createListing 失败: 未登录，无法确定卖家身份');

    const row = {
      title: input.title,
      description: input.description ?? '',
      price: input.price,
      condition: input.condition ?? '良好',
      category: input.category,
      photos: input.photos,
      cover_index: input.coverIndex ?? 0,
      location: input.location ?? { city: '' },
      seller_id: sellerId,
      expires_at: input.expiresAt ?? new Date(Date.now() + TTL_MS).toISOString(),
      status: input.status ?? 'active',
      type: input.type ?? 'secondhand',
    };
    const { data, error } = await client.from('listings').insert(row).select().single();
    if (error) throw new Error(`createListing 失败: ${error.message}`);
    return mapListing(data);
  },

  /**
   * 续期。0003_privilege_hardening 之后 expires_at 对客户端只读（直接 update 会 42501），
   * 唯一入口是 refresh-listing Edge Function —— 有效期长度与终态校验都只存在于服务端，
   * 客户端不再持有第二份 TTL 规则。
   */
  async refreshListing(id: string) {
    const client = await getSupabaseClient();
    const { data: cur, error: e1 } = await client
      .from('listings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (e1) throw new Error(`refreshListing 失败: ${e1.message}`);
    if (!cur) throw new Error(`refreshListing 失败: 商品不存在或无权访问 (${id})`);
    // 终态与 mockDataSource 同口径：原样返回，不打服务端（服务端也会回 409）。
    if (cur.status === 'sold' || cur.status === 'archived') return mapListing(cur);

    const { data, error } = await client.functions.invoke('refresh-listing', {
      body: { listingId: id },
    });

    // functions.invoke 的错误语义与 postgrest 不同：非 2xx 时 error 非空，但函数
    // 自己返回的 JSON body（{ ok:false, error }）仍在 data 里，两边都要看才能拿到原因。
    const reason =
      (data && data.ok === false ? data.error : null) ?? (error ? error.message : null);
    if (reason) throw new Error(`refreshListing 失败: ${reason}`);

    // 以服务端返回的权威值收敛本地对象，省一次回查。
    return mapListing({
      ...cur,
      expires_at: data?.expiresAt ?? cur.expires_at,
      status: data?.status ?? 'active',
    });
  },

  /**
   * 详情页浏览量 +1（fire-and-forget）。views 列已被触发器钉死，
   * 唯一写入路径是这个 SECURITY DEFINER RPC，且只对 active 且未过期的商品生效。
   */
  async incrementListingViews(id: string) {
    if (!id) return;
    const client = await getSupabaseClient();
    await client.rpc('increment_listing_views', { p_listing_id: id });
  },

  /**
   * 卖家公开资料。0003 之后 profiles 表只有本人可读，展示他人资料必须走
   * public_profiles 视图（不含 email）。
   */
  async getPublicProfile(id: string) {
    if (!id) return null;
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('public_profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getPublicProfile 失败: ${error.message}`);
    // 视图不含 email，mapProfile 会补成空串（canonical User.email 为必填）。
    return data ? mapProfile({ ...data, email: '' }) : null;
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

  // ---- M3 社交写操作（live 模式落 Supabase）----

  /**
   * 找到或创建「我」与对方在某商品下的会话。
   * 先按 listing + 双向 (buyer,seller) 查重，避免重复建会话；再按角色落库。
   * 角色推导依赖 hydrate() 预拉取进 cache.listings 的 sellerId（live 模式下列表已加载）。
   */
  async createConversation(input: CreateConversationInput) {
    const client = await getSupabaseClient();
    const { data: auth } = await client.auth.getUser();
    const meId = auth?.user?.id;
    if (!meId) throw new Error('createConversation 失败: 未登录，无法确定会话归属');

    const listing = cache.listings.find((l) => l.id === input.listingId);
    const sellerId = listing?.sellerId ?? input.peerId;
    const iAmSeller = meId === sellerId;
    const buyerId = iAmSeller ? input.peerId : meId;
    const sellerIdVal = iAmSeller ? meId : input.peerId;

    const { data: existing } = await client
      .from('conversations')
      .select('*')
      .eq('listing_id', input.listingId)
      .or(
        `and(buyer_id.eq.${meId},seller_id.eq.${input.peerId}),and(buyer_id.eq.${input.peerId},seller_id.eq.${meId})`
      )
      .maybeSingle();
    if (existing) {
      const conv = mapConversation(existing);
      cache.conversations = [conv, ...cache.conversations.filter((c) => c.id !== conv.id)];
      return conv;
    }

    const { data, error } = await client
      .from('conversations')
      .insert({ listing_id: input.listingId, buyer_id: buyerId, seller_id: sellerIdVal })
      .select()
      .single();
    if (error) throw new Error(`createConversation 失败: ${error.message}`);
    const conv = mapConversation(data);
    cache.conversations = [conv, ...cache.conversations];
    return conv;
  },

  /** 在指定会话下发送消息。conversation_id 必填（0004 起 NOT NULL）。 */
  async sendMessage(input: SendMessageInput) {
    const client = await getSupabaseClient();
    const { data: auth } = await client.auth.getUser();
    const meId = auth?.user?.id ?? 'u_me';
    const { data, error } = await client
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        listing_id: input.listingId,
        sender_id: meId,
        receiver_id: input.receiverId,
        content: input.content,
        read: false,
      })
      .select()
      .single();
    if (error) throw new Error(`sendMessage 失败: ${error.message}`);
    const msg = mapMessage(data);
    cache.messages[input.conversationId] = [
      ...(cache.messages[input.conversationId] ?? []),
      msg,
    ];
    const conv = cache.conversations.find((c) => c.id === input.conversationId);
    if (conv) {
      conv.lastMessage = input.content;
      conv.lastMessageAt = msg.created_at;
    }
    return msg;
  },

  /** 切换收藏状态：已收藏则删除，否则插入。依赖 RLS 仅允许操作自己的 favorites。 */
  async toggleFavorite(id: string) {
    if (!id) return;
    const client = await getSupabaseClient();
    const { data: auth } = await client.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) throw new Error('toggleFavorite 失败: 未登录');

    const { data: existing } = await client
      .from('favorites')
      .select('listing_id')
      .eq('user_id', uid)
      .eq('listing_id', id)
      .maybeSingle();
    if (existing) {
      const { error } = await client
        .from('favorites')
        .delete()
        .eq('user_id', uid)
        .eq('listing_id', id);
      if (error) throw new Error(`toggleFavorite 失败: ${error.message}`);
    } else {
      const { error } = await client
        .from('favorites')
        .insert({ user_id: uid, listing_id: id });
      if (error) throw new Error(`toggleFavorite 失败: ${error.message}`);
    }
  },

  /** 将会话内未读消息标记为已读（仅更新 read 列，受 RLS 限制参与者可改）。 */
  async markConversationRead(conversationId: string) {
    if (!conversationId) return;
    const client = await getSupabaseClient();
    const { error } = await client
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .eq('read', false);
    if (error) throw new Error(`markConversationRead 失败: ${error.message}`);
    const conv = cache.conversations.find((c) => c.id === conversationId);
    if (conv) conv.unreadCount = 0;
  },

  /**
   * 监听指定用户的实时私聊消息（通过 Supabase Realtime WebSocket 通道）
   */
  subscribeMessages(userId: string, onMessage: (msg: Message) => void) {
    let channel: any = null;
    let active = true;

    (async () => {
      try {
        const client = await getSupabaseClient();
        if (!active) return;
        channel = client
          .channel(`messages:user:${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `receiver_id=eq.${userId}`,
            },
            (payload: any) => {
              if (payload.new) {
                const msg = mapMessage(payload.new);
                if (msg.conversationId) {
                  cache.messages[msg.conversationId] = [
                    ...(cache.messages[msg.conversationId] ?? []),
                    msg,
                  ];
                }
                onMessage(msg);
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Failed to subscribe to realtime messages:', err);
      }
    })();

    return () => {
      active = false;
      if (channel) {
        channel.unsubscribe();
      }
    };
  },
};
