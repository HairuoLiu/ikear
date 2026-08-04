/**
 * IKEAR 全局状态（M0 契约）—— M1~M4 直接消费，action 命名已冻结。
 *
 * 纯业务规则（TTL / 照片校验）放在 src/lib/expiry.ts 与 src/lib/listingRules.ts，
 * 本文件只做状态编排与持久化。
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENT_USER, LISTINGS, MESSAGES, USERS } from '../data/mockData';
import { CategoryId, Condition, Listing, Message, User } from '../data/types';
import { DAY_MS, TTL_DAYS, refresh } from '../lib/expiry';
import { MAX_PHOTOS, canPublish } from '../lib/listingRules';

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

    messages: MESSAGES,
    filters: defaultFilters,

    async login(email) {
      // 演示模式：任意非空邮箱/密码均可登录。接 Supabase 时只替换这里。
      const user = USERS.find((u) => u.email === email) ?? CURRENT_USER;
      await new Promise((r) => setTimeout(r, 400));
      set({
        currentUser: user,
        isAuthenticated: true,
        location: get().location.city ? get().location : { city: user.city },
      });
      return true;
    },

    async register(nickname, email) {
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
      set({ currentUser: null, isAuthenticated: false });
    },

    toggleFavorite(id) {
      const favorites = get().favorites.includes(id)
        ? get().favorites.filter((f) => f !== id)
        : [...get().favorites, id];
      set({ favorites });
      persist();
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
        // 旧字段镜像，保持向后兼容（canonical 字段已在上文给出）
        images: photos,
        seller_id: sellerId,
        created_at: createdAt,
        city,
      };

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
      const t = Date.now();
      patchListing(id, (l) => {
        const pct = l.price > 0 ? Math.round(((l.price - newPrice) / l.price) * 100) : 0;
        return {
          ...l,
          price: newPrice,
          discount: pct,
          expiresAt: ttlFrom(t),
          status: 'active',
        };
      });
    },

    sendMessage(listingId, receiverId, content) {
      const msg: Message = {
        id: 'm_' + ++msgSeq,
        listing_id: listingId,
        sender_id: get().currentUser?.id ?? 'u_me',
        receiver_id: receiverId,
        content,
        read: true,
        created_at: nowIso(),
        sender: get().currentUser ?? undefined,
      };
      set({ messages: [...get().messages, msg] });
    },

    markConversationRead(listingId, counterpartId) {
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
          Pick<StoreState, 'favorites' | 'biometricEnabled' | 'location' | 'sort' | 'drafts'>
        >;
        set({
          favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
          biometricEnabled: !!saved.biometricEnabled,
          location: saved.location ?? {},
          sort: saved.sort ?? 'new',
          drafts: saved.drafts ?? null,
        });
      } catch {
        /* 读档失败时保持默认值 */
      }
    },
  };
});
