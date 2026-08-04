/**
 * Feed 离线缓存（M1 数据层）—— 首页/探索页的唯一取数入口。
 *
 * 分层：
 *   dataSource.getListings  取「可公开浏览」的快照（默认 status=active，见 toBrowseFilter）
 *   feedCache               内存 + AsyncStorage 双层缓存，断网时回放上一次快照
 *   lib/browse.applyBrowseFilters  品类 / 地点 / 关键词 / 排序（唯一计算入口，本文件不重复实现）
 *
 * 缓存的是**未按品类/地点收窄的整份 active 快照**，所以离线时切品类、切城市、
 * 换排序都还能在本地算出结果，不必联网。
 *
 * Supabase-ready：把 mockDataSource 换成 supabaseDataSource 即可，本文件无需改动。
 */
import type { BrowseFilter } from '../lib/browse';
import { applyBrowseFilters } from '../lib/browse';
import { mockDataSource, toBrowseFilter } from './dataSource';
import type { Listing } from './types';

/** AsyncStorage 键。改结构时升版本号（v2…），旧键自然失效。 */
export const FEED_CACHE_KEY = 'ikear.feed.v1';

/** 只依赖三个方法，便于测试注入与后续换存储实现。 */
export interface FeedStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// RN 环境下用 AsyncStorage 落盘；node/jest 下（无原生依赖）回退到内存字典，
// 行为一致、只是不跨进程持久化，所以本文件在纯 node 下也能直接跑单测。
declare const require: ((id: string) => unknown) | undefined;

function nativeStorage(): FeedStorage | null {
  try {
    if (typeof require !== 'function') return null;
    const mod = require('@react-native-async-storage/async-storage') as
      | { default?: FeedStorage }
      | FeedStorage;
    return ((mod as { default?: FeedStorage }).default ?? mod) as FeedStorage;
  } catch {
    return null;
  }
}

function fallbackStorage(): FeedStorage {
  const bin = new Map<string, string>();
  return {
    async getItem(k) {
      return bin.get(k) ?? null;
    },
    async setItem(k, v) {
      bin.set(k, v);
    },
    async removeItem(k) {
      bin.delete(k);
    },
  };
}

let storage: FeedStorage | null = null;

function getStorage(): FeedStorage {
  if (!storage) storage = nativeStorage() ?? fallbackStorage();
  return storage;
}

/** 内存层：同一次会话内避免重复读盘，且能给 UI 首帧同步兜底数据。 */
let memory: Listing[] | null = null;

// ---------------------------------------------------------------------------
// 缓存读写
// ---------------------------------------------------------------------------

/** 写入内存 + 落盘。落盘失败只降级为内存缓存，不抛错打断浏览。 */
export async function saveFeed(listings: Listing[]): Promise<void> {
  memory = [...listings];
  try {
    await getStorage().setItem(FEED_CACHE_KEY, JSON.stringify(memory));
  } catch {
    /* 落盘失败不影响本次会话 */
  }
}

/** 内存优先，其次读盘；无缓存或数据损坏返回 null（调用方自行决定空态）。 */
export async function loadFeed(): Promise<Listing[] | null> {
  if (memory) return memory;
  try {
    const raw = await getStorage().getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    memory = parsed as Listing[];
    return memory;
  } catch {
    return null;
  }
}

/** 同步读内存缓存，供 UI 首帧渲染占位（未加载过返回 null）。 */
export function peekFeed(): Listing[] | null {
  return memory;
}

export async function clearFeed(): Promise<void> {
  memory = null;
  try {
    await getStorage().removeItem(FEED_CACHE_KEY);
  } catch {
    /* 清盘失败不影响内存已清空 */
  }
}

// ---------------------------------------------------------------------------
// 取数主入口
// ---------------------------------------------------------------------------

export interface GetFeedOptions {
  /** 注入当前时间，便于测试过期边界。 */
  now?: number;
  /** true = 跳过网络/数据源，直接用缓存（下拉刷新以外的场景可省一次查询）。 */
  cacheOnly?: boolean;
}

/**
 * 浏览取数：拉 active 快照 → 落缓存 → 走 applyBrowseFilters 出最终列表。
 * 数据源异常（离线）时自动回放缓存快照，仍能按品类/地点/排序浏览。
 */
export async function getFeed(
  filter: BrowseFilter = {},
  opts: GetFeedOptions = {}
): Promise<Listing[]> {
  const now = opts.now ?? Date.now();
  let snapshot: Listing[] | null = null;

  if (opts.cacheOnly) {
    snapshot = await loadFeed();
  } else {
    try {
      // 只把排序透传给数据源；品类/地点/关键词交给 applyBrowseFilters，
      // 这样缓存里始终是整份 active 快照。
      snapshot = await mockDataSource.getListings(toBrowseFilter({ sort: filter.sort }));
      await saveFeed(snapshot);
    } catch {
      snapshot = await loadFeed();
    }
  }

  return applyBrowseFilters(snapshot ?? [], filter, now);
}

// ---------------------------------------------------------------------------
// 测试钩子
// ---------------------------------------------------------------------------

/** 仅供测试：替换持久化后端；传 null 恢复默认（AsyncStorage / 内存兜底）。 */
export function __setFeedStorage(next: FeedStorage | null): void {
  storage = next;
}

/** 仅供测试：清空内存层（不动磁盘）。 */
export function __resetFeedMemory(): void {
  memory = null;
}
