/**
 * IKEAR 全局状态（M0 契约）—— M1~M4 直接消费，action 命名已冻结。
 *
 * 纯业务规则（TTL / 照片校验）放在 src/lib/expiry.ts 与 src/lib/listingRules.ts，
 * 本文件只做状态编排与持久化。
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENT_USER, LISTINGS, MESSAGES, USERS } from '../data/mockData';
import { dataSource, isSupabaseMode } from '../data/dataSource';
import { getSupabaseClient } from '../lib/supabase';
import {
  CategoryId,
  Condition,
  Conversation,
  CreateConversationInput,
  Listing,
  ListingMode,
  AIRecognitionMeta,
  TrustProfile,
  Message,
  SendMessageInput,
  User,
} from '../data/types';
import { DAY_MS, TTL_DAYS, refresh } from '../lib/expiry';
import { MAX_PHOTOS, canPublish } from '../lib/listingRules';
import { getTrustProfile } from '../lib/aiEstimate';
import type { SupportedLanguage } from '../lib/i18n';

const STATE_KEY = 'ikear.state.v1';

// store 内部统一使用数据层 canonical `Listing`（见 src/data/types.ts）。
// 二手交易字段（status/discount/expiresAt…）均按 Listing 契约，不再另设并行类型。

export interface DraftListing {
  id: string;
  title: string;
  description: string;
  price: number | null;
  condition: Condition;
  hasDamage: boolean;
  damageDescription: string;
  /** 已选照片 uri，顺序即展示顺序 */
  photos: string[];
  /** 封面在 photos 中的下标 */
  coverIndex: number;
  /** 宜家品类（canonical CategoryId） */
  category: CategoryId | null;
  city?: string;
  district?: string;
  createdAt: string;
  updatedAt: string;
  listingMode?: ListingMode;
  aiMeta?: AIRecognitionMeta;
  sellerTrust?: TrustProfile;
}

export type SortMode = 'near' | 'new' | 'price';

export interface AppLocation {
  city?: string;
  district?: string;
}

export interface Filters {
  query: string;
  categoryId: CategoryId | null;
  condition: Condition | null;
  city: string | null;
}

interface StoreState {
  // ---- state（M0 契约）----
  isAuthenticated: boolean;
  currentUser: User | null;
  listings: Listing[];
  favorites: string[];
  drafts: DraftListing | null;
  location: AppLocation;
  sort: SortMode;
  biometricEnabled: boolean;
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;

  // ---- 附加 state（M1 筛选 / M3 消息，非契约但已在用）----
  messages: Message[];
  filters: Filters;

  // ---- session ----
  login: (email: string, password: string) => Promise<boolean>;
  register: (nickname: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;

  // ---- 收藏 ----
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;

  // ---- 草稿（M2）----
  startDraft: () => DraftListing;
  updateDraft: (patch: Partial<DraftListing>) => void;
  addDraftPhoto: (uri: string) => void;
  removeDraftPhoto: (i: number) => void;
  setDraftCover: (i: number) => void;
  clearDraft: () => void;
  publishDraft: () => Listing | null;

  // ---- 浏览（M1）----
  setLocation: (city: string, district?: string) => void;
  setSort: (mode: SortMode) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;

  // ---- 生命周期（M4）----
  refreshListing: (id: string) => void;
  markSold: (id: string) => void;
  archiveListing: (id: string) => void;
  discountRelist: (id: string, newPrice: number) => void;

  // ---- 消息（M3）----
  sendMessage: (listingId: string, receiverId: string, content: string) => void;
  markConversationRead: (listingId: string, counterpartId: string) => void;

  // ---- 设备 ----
  setBiometric: (v: boolean) => void;
  loadPersisted: () => Promise<void>;
}

const defaultFilters: Filters = {
  query: '',
  categoryId: null,
  condition: null,
  city: null,
};

const nowIso = () => new Date().toISOString();
const ttlFrom = (t: number) => new Date(t + TTL_DAYS * DAY_MS).toISOString();

function   emptyDraft(location: AppLocation): DraftListing {
  const ts = nowIso();
  return {
    id: 'd_' + Date.now(),
    title: '',
    description: '',
    price: null,
    category: null,
    condition: '良好',
    hasDamage: false,
    damageDescription: '',
    photos: [],
    coverIndex: 0,
    city: location.city,
    district: location.district,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** 把封面挪到第一张 */
function ordered(photos: string[], coverIndex: number): string[] {
  if (coverIndex <= 0 || coverIndex >= photos.length) return [...photos];
  const copy = [...photos];
  const [cover] = copy.splice(coverIndex, 1);
  return [cover, ...copy];
}

/**
 * live 模式下找到「我」与对方在某商品下的会话；不存在则创建。
 * 复用 dataSource 的会话缓存（hydrate 已预拉取），避免重复建会话。
 */
async function ensureConversation(
  listingId: string,
  peerId: string,
  _meId: string
): Promise<Conversation> {
  const existing = dataSource
    .getConversations()
    .find((c) => c.listingId === listingId && (c.buyerId === peerId || c.sellerId === peerId));
  if (existing) return existing;
  const input: CreateConversationInput = { listingId, peerId };
  return dataSource.createConversation(input);
}

let msgSeq = 1000;

export const useStore = create<StoreState>((set, get) => {
  /** 写入需要离线保留的片段 */
  const persist = () => {
    const { favorites, biometricEnabled, location, sort, drafts } = get();
    AsyncStorage.setItem(
      STATE_KEY,
      JSON.stringify({ favorites, biometricEnabled, location, sort, drafts })
    ).catch(() => {
      /* 持久化失败不影响会话 */
    });
  };

  /** 局部更新某条挂牌 */
  const patchListing = (id: string, patch: (l: Listing) => Listing) => {
    set({ listings: get().listings.map((l) => (l.id === id ? patch(l) : l)) });
  };

  const withDraft = (fn: (d: DraftListing) => DraftListing) => {
    const d = get().drafts;
    if (!d) return;
    set({ drafts: { ...fn(d), updatedAt: nowIso() } });
    persist();
  };

  return {
    isAuthenticated: false,
    currentUser: null,
    listings: LISTINGS,
    favorites: [],
    drafts: null,
    location: {},
    sort: 'new',
    biometricEnabled: false,
    language: 'zh-CN',

    setLanguage(language) {
      set({ language });
      persist();
    },

    messages: MESSAGES,
    filters: defaultFilters,

    async login(email, password) {
      if (isSupabaseMode()) {
        const client = await getSupabaseClient();
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        // 登录成功后预拉取 profile / 会话 / 消息缓存，供同步读方法使用。
        await dataSource.hydrate?.();
        const user = dataSource.getProfile();
        set({
          currentUser: user,
          isAuthenticated: true,
          location: get().location.city ? get().location : { city: user.city },
        });
        return true;
      }
      // 演示模式：任意非空邮箱/密码均可登录。
      const user = USERS.find((u) => u.email === email) ?? CURRENT_USER;
      await new Promise((r) => setTimeout(r, 400));
      set({
        currentUser: user,
        isAuthenticated: true,
        location: get().location.city ? get().location : { city: user.city },
      });
      return true;
    },

    async register(nickname, email, password) {
      if (isSupabaseMode()) {
        const client = await getSupabaseClient();
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { nickname } },
        });
        if (error) throw new Error(error.message);
        // Supabase 默认开启邮箱确认：没有 session 时不自动登录，等待用户确认邮件。
        if (!data.session) return true;
        await dataSource.hydrate?.();
        const user = dataSource.getProfile();
        set({
          currentUser: user,
          isAuthenticated: true,
          location: { city: user.city },
        });
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
      const user: User = {
        id: 'u_' + Date.now(),
        email,
        nickname: nickname || '新用户',
        avatar_url: null,
        city: '多伦多',
        created_at: nowIso(),
      };
      USERS.push(user);
      set({ currentUser: user, isAuthenticated: true, location: { city: user.city } });
      return true;
    },

    logout() {
      if (isSupabaseMode()) {
        // 退出登录时清掉会话与本地社交缓存；失败不应阻塞 UI。
        getSupabaseClient()
          .then((c) => c.auth.signOut())
          .catch(() => {})
          .finally(() => dataSource.hydrate?.());
      }
      set({ currentUser: null, isAuthenticated: false });
    },

    toggleFavorite(id) {
      // 乐观更新本地收藏列表，保证 UI 即时反馈；live 模式再异步落库。
      const favorites = get().favorites.includes(id)
        ? get().favorites.filter((f) => f !== id)
        : [...get().favorites, id];
      set({ favorites });
      persist();
      if (isSupabaseMode()) {
        dataSource.toggleFavorite(id).catch((e) => console.error('toggleFavorite 失败', e));
      }
    },

    isFavorite(id) {
      return get().favorites.includes(id);
    },

    /** 已有草稿时续编（发布入口可随时进出），没有才新建。 */
    startDraft() {
      const existing = get().drafts;
      if (existing) return existing;
      const draft = emptyDraft(get().location);
      set({ drafts: draft });
      persist();
      return draft;
    },

    updateDraft(patch) {
      withDraft((d) => ({ ...d, ...patch }));
    },

    addDraftPhoto(uri) {
      withDraft((d) =>
        d.photos.length >= MAX_PHOTOS ? d : { ...d, photos: [...d.photos, uri] }
      );
    },

    removeDraftPhoto(i) {
      withDraft((d) => {
        if (i < 0 || i >= d.photos.length) return d;
        const photos = d.photos.filter((_, idx) => idx !== i);
        let coverIndex = d.coverIndex;
        if (i === coverIndex) coverIndex = 0;
        else if (i < coverIndex) coverIndex -= 1;
        return { ...d, photos, coverIndex: Math.min(coverIndex, Math.max(photos.length - 1, 0)) };
      });
    },

    setDraftCover(i) {
      withDraft((d) => (i < 0 || i >= d.photos.length ? d : { ...d, coverIndex: i }));
    },

    clearDraft() {
      set({ drafts: null });
      persist();
    },

    publishDraft() {
      const d = get().drafts;
      if (!d || !canPublish(d)) return null;
      const t = Date.now();
      const photos = ordered(d.photos, d.coverIndex);
      const city = d.city ?? get().location.city ?? '';
      const district = d.district ?? get().location.district;
      const sellerId = get().currentUser?.id ?? 'u_me';
      const createdAt = new Date(t).toISOString();
      const listing: Listing = {
        id: 'l_' + t,
        title: d.title,
        description: d.description || '',
        price: d.price ?? 0,
        condition: d.condition,
        category: d.category ?? 'other',
        photos,
        coverIndex: 0,
        location: { city, district },
        sellerId,
        createdAt,
        expiresAt: ttlFrom(t),
        status: 'active',
        type: 'secondhand',
        views: 0,
        listingMode: d.listingMode || (d.aiMeta?.isReferencePhoto ? 'no_photo_chat' : 'ai_photo'),
        aiMeta: d.aiMeta,
        sellerTrust: getTrustProfile(seller?.rating ?? 4.9, seller?.soldCount ?? 12, true),
        // 旧字段镜像，保持向后兼容（canonical 字段已在上文给出）
        images: photos,
        seller_id: sellerId,
        created_at: createdAt,
        city,
      };

      if (isSupabaseMode()) {
        // live 模式：异步落库，由真实记录接管；同步只清空草稿并返回本地对象供调用方流转，
        // 避免乐观插入的本地 listing 与真实记录重复。
        set({ drafts: null });
        persist();
        (async () => {
          try {
            const created = await dataSource.createListing({
              title: d.title,
              description: d.description ?? '',
              price: d.price ?? 0,
              category: d.category ?? 'other',
              photos,
              condition: d.condition,
              location: { city, district },
              type: 'secondhand',
              sellerId,
            });
            set({
              listings: [created, ...get().listings.filter((l) => l.id !== created.id)],
              drafts: null,
            });
            persist();
          } catch (e) {
            console.error('publishDraft 失败', e);
          }
        })();
        return listing;
      }

      set({ listings: [listing, ...get().listings], drafts: null });
      persist();
      return listing;
    },

    setLocation(city, district) {
      set({ location: { city, district } });
      persist();
    },

    setSort(mode) {
      set({ sort: mode });
      persist();
    },

    setFilters(patch) {
      set({ filters: { ...get().filters, ...patch } });
    },

    resetFilters() {
      set({ filters: defaultFilters });
    },

    /** 临期刷新：重置 30 天 TTL，并赠 24h 曝光（不改变 status）。 */
    refreshListing(id) {
      patchListing(id, (l) => refresh(l));
    },

    markSold(id) {
      patchListing(id, (l) => ({ ...l, status: 'sold' }));
    },

    archiveListing(id) {
      patchListing(id, (l) => ({ ...l, status: 'archived' }));
    },

    /** 降价重上架：改价 + 记录降价百分比 + 重置 TTL + 回到 active。 */
    discountRelist(id, newPrice) {
      const l0 = get().listings.find((x) => x.id === id);
      const pct = l0 && l0.price > 0 ? Math.round(((l0.price - newPrice) / l0.price) * 100) : 0;
      if (isSupabaseMode()) {
        // R2-4：改价 + 重置 TTL 必须拆两步——expires_at 客户端只读（见 toRow 的 42501 保护），
        // 续期唯一入口是 refreshListing()（走 refresh-listing Edge Function，24h 曝光由服务端决定）。
        (async () => {
          try {
            await dataSource.updateListing(id, { price: newPrice, discount: pct, status: 'active' });
            const refreshed = await dataSource.refreshListing(id);
            patchListing(id, () => refreshed);
          } catch (e) {
            console.error('discountRelist 失败', e);
          }
        })();
      }
      // 乐观更新本地：立即体现新价与折扣（TTL 由 refresh 兜底）。
      patchListing(id, (l) => ({
        ...l,
        price: newPrice,
        discount: pct,
        expiresAt: ttlFrom(Date.now()),
        status: 'active',
      }));
    },

    sendMessage(listingId, receiverId, content) {
      const meId = get().currentUser?.id ?? 'u_me';
      if (isSupabaseMode()) {
        // live 模式：先找到/创建会话，再落库；同时乐观更新本地消息供 UI 立即渲染。
        (async () => {
          try {
            const conv = await ensureConversation(listingId, receiverId, meId);
            const input: SendMessageInput = {
              conversationId: conv.id,
              listingId,
              receiverId,
              content,
            };
            await dataSource.sendMessage(input);
          } catch (e) {
            console.error('sendMessage 失败', e);
          }
        })();
        const optimistic: Message = {
          id: 'm_' + ++msgSeq,
          listing_id: listingId,
          sender_id: meId,
          receiver_id: receiverId,
          content,
          read: true,
          created_at: nowIso(),
          sender: get().currentUser ?? undefined,
        };
        set({ messages: [...get().messages, optimistic] });
        return;
      }
      const msg: Message = {
        id: 'm_' + ++msgSeq,
        listing_id: listingId,
        sender_id: meId,
        receiver_id: receiverId,
        content,
        read: true,
        created_at: nowIso(),
        sender: get().currentUser ?? undefined,
      };
      set({ messages: [...get().messages, msg] });
    },

    markConversationRead(listingId, counterpartId) {
      if (isSupabaseMode()) {
        const conv = dataSource
          .getConversations()
          .find(
            (c) => c.listingId === listingId && (c.buyerId === counterpartId || c.sellerId === counterpartId)
          );
        if (conv) {
          dataSource.markConversationRead(conv.id).catch((e) => console.error('markConversationRead 失败', e));
        }
        return;
      }
      set({
        messages: get().messages.map((m) =>
          m.listing_id === listingId && m.sender_id === counterpartId ? { ...m, read: true } : m
        ),
      });
    },

    setBiometric(v) {
      set({ biometricEnabled: v });
      persist();
    },

    async loadPersisted() {
      try {
        const raw = await AsyncStorage.getItem(STATE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<
          Pick<StoreState, 'favorites' | 'biometricEnabled' | 'location' | 'sort' | 'drafts' | 'language'>
        >;
        set({
          favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
          biometricEnabled: !!saved.biometricEnabled,
          location: saved.location ?? {},
          sort: saved.sort ?? 'new',
          drafts: saved.drafts ?? null,
          language: saved.language ?? 'zh-CN',
        });
      } catch {
        /* 读档失败时保持默认值 */
      }
    },
  };
});
