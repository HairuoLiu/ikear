/**
 * 浏览（M1）纯逻辑 —— 筛选 / 排序 / 公开可见性的唯一计算入口。
 *
 * 约束：本文件**不得** import react / react-native / expo，必须能被 jest（或 node）直接执行。
 * 需要读 store 的版本见 `src/hooks/useBrowse.ts`。
 *
 * 字段兼容：canonical 字段为 camelCase（createdAt / location），历史数据与
 * store.publishDraft 产出的挂牌可能只有 snake_case（created_at）或扁平的 city/district，
 * 两种写法都能读，避免并行开发时的契约漂移。
 */
import type { CategoryId, Location } from '../data/types';
import { isExpired } from './expiry';

export type SortMode = 'near' | 'new' | 'price';

export interface BrowseFilter {
  category?: CategoryId;
  /**
   * 地点筛选。只给 city 时按城市过滤，city + district 时再按区收窄。
   * 用 Partial<Location> 是因为 store 的 location 初始为 {}；canonical 的 Location 可直接传入。
   */
  location?: Partial<Location>;
  query?: string;
  sort?: SortMode;
}

/**
 * 浏览逻辑真正读到的字段（结构化最小契约）。
 * 数据层 `Listing` 与 store 内部 `StoreListing` 都满足它，因此两边都能直接传进来。
 */
export interface BrowsableListing {
  title?: string;
  price?: number;
  category?: CategoryId | string;
  location?: Location;
  status?: string;
  createdAt?: string;
  created_at?: string;
  city?: string;
  district?: string;
  expiresAt?: string | number | null;
  expires_at?: string | number | null;
}

/** 排序条展示顺序（UI 直接消费） */
export const SORT_MODES: SortMode[] = ['near', 'new', 'price'];

export const DEFAULT_SORT: SortMode = 'new';

const SORT_LABELS: Record<SortMode, string> = {
  near: '附近',
  new: '最新',
  price: '降价',
};

/** 排序模式的中文标签。持久化的历史值可能不合法，回落到「最新」。 */
export function sortLabel(sort: SortMode): string {
  return SORT_LABELS[sort] ?? SORT_LABELS[DEFAULT_SORT];
}

// ---------------------------------------------------------------------------
// 字段读取（canonical 优先，legacy 兜底）
// ---------------------------------------------------------------------------

function listingCity(l: BrowsableListing): string {
  return (l.location?.city ?? l.city ?? '').trim();
}

function listingDistrict(l: BrowsableListing): string {
  return (l.location?.district ?? l.district ?? '').trim();
}

function createdMs(l: BrowsableListing): number {
  const raw = l.createdAt ?? l.created_at;
  const ms = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

const norm = (s: string | undefined | null) => (s ?? '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// 公开可见性
// ---------------------------------------------------------------------------

/**
 * 公开市场只展示 active：
 * 1) status 为 'expired' / 'sold' / 'archived' / 'reserved' 一律隐藏（缺省 status 视为 active）；
 * 2) status 仍是 active 但 TTL 已过（M4 过期扫描尚未跑到）也隐藏，避免展示僵尸挂牌。
 */
export function isPubliclyVisible(l: BrowsableListing, now: number = Date.now()): boolean {
  if ((l.status ?? 'active') !== 'active') return false;
  return !isExpired(l, now);
}

// ---------------------------------------------------------------------------
// 筛选 + 排序
// ---------------------------------------------------------------------------

function matches(l: BrowsableListing, f: BrowseFilter): boolean {
  if (f.category && l.category !== f.category) return false;

  const city = norm(f.location?.city);
  if (city && norm(listingCity(l)) !== city) return false;

  const district = norm(f.location?.district);
  if (district && norm(listingDistrict(l)) !== district) return false;

  const q = norm(f.query);
  if (q && !norm(l.title).includes(q)) return false;

  return true;
}

const byNewest = (a: BrowsableListing, b: BrowsableListing) => createdMs(b) - createdMs(a);

/** 无价挂牌排最后，避免 undefined 参与算术 */
const byPriceAsc = (a: BrowsableListing, b: BrowsableListing) =>
  (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);

function comparator(sort: SortMode) {
  switch (sort) {
    case 'price':
      return byPriceAsc;
    // 'near' 占位：地点模型暂无经纬度，先按最新排。
    // TODO(M1+)：接入 lat/lng 后改为「与当前定位的距离升序」，同城/同区优先。
    case 'near':
    case 'new':
    default:
      return byNewest;
  }
}

/**
 * 浏览主入口：过滤掉非公开挂牌 → 应用 category/location/query → 排序。
 * 返回新数组，不修改入参；sort 缺省为「最新」。
 */
export function applyBrowseFilters<T extends BrowsableListing>(
  listings: T[],
  f: BrowseFilter = {},
  now: number = Date.now()
): T[] {
  return listings
    .filter((l) => isPubliclyVisible(l, now) && matches(l, f))
    .sort(comparator(f.sort ?? DEFAULT_SORT));
}
