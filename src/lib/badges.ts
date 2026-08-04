/**
 * 角标（badge）计算 —— M4 生命周期里程碑的纯展示逻辑层。
 *
 * 约束：本文件**不得** import react-native / expo / zustand / 任何原生依赖。
 * 只消费 src/lib/expiry.ts 的过期引擎与 src/data/types.ts 的类型，
 * 保证可被 jest（或 node）直接执行，也可被 M4-UI 在 render 期同步调用。
 *
 * 用法（M4-UI）：
 *   const { messages, profile } = tabBadgeCount(useStore.getState());
 *   const badge = listingStatusBadge(listing);
 */
import type { ListingStatus } from '../data/types';
import { isExpired, needsRefreshReminder, type ExpirableListing } from './expiry';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type BadgeTone = 'default' | 'warning' | 'muted';

export interface StatusBadge {
  tone: BadgeTone;
  text: string;
}

export interface TabBadges {
  messages: number;
  profile: number;
}

/**
 * store 的 LifecycleStatus 比数据层 ListingStatus 多了 'reserved'、少了 'expired'，
 * 这里取并集，使本文件对 store 挂牌与 mock 挂牌都成立。
 */
export type BadgeStatus = ListingStatus | 'reserved';

/** 结构化入参：只要求角标真正用到的字段，避免与任一侧 schema 强耦合。 */
export interface BadgeListing extends ExpirableListing {
  status?: BadgeStatus;
  sellerId?: string;
  seller_id?: string;
}

export interface BadgeMessage {
  read?: boolean;
  receiver_id?: string;
}

export interface BadgeState {
  listings?: BadgeListing[];
  messages?: BadgeMessage[];
  currentUser?: { id: string } | null;
  /** store 若自行维护聚合未读数，则优先采用，不再逐条统计 */
  unread?: number;
}

/** 未登录时的兜底身份，与 useStore 内 `currentUser?.id ?? 'u_me'` 的约定保持一致。 */
const FALLBACK_USER_ID = 'u_me';

const ownerId = (l: BadgeListing) => l.sellerId ?? l.seller_id;

// ---------------------------------------------------------------------------
// Tab 角标
// ---------------------------------------------------------------------------

/**
 * 底部 Tab 角标数量。
 * - messages：发给「我」且未读的消息数（store 提供 unread 时直接采用）。
 * - profile：我的 active 挂牌中「临期可刷新」的条数，作为刷新提醒角标。
 *   已售 / 已归档 / 已过期的挂牌不计入 —— 它们走的是归档或降价重上架流程。
 */
export function tabBadgeCount(state: BadgeState = {}, now: number = Date.now()): TabBadges {
  const me = state.currentUser?.id ?? FALLBACK_USER_ID;

  const messages =
    typeof state.unread === 'number'
      ? state.unread
      : (state.messages ?? []).filter((m) => m.read === false && m.receiver_id === me).length;

  const profile = (state.listings ?? []).filter(
    (l) =>
      ownerId(l) === me &&
      (l.status ?? 'active') === 'active' &&
      needsRefreshReminder(l, now)
  ).length;

  return { messages, profile };
}

// ---------------------------------------------------------------------------
// 挂牌状态角标
// ---------------------------------------------------------------------------

/**
 * 挂牌卡片上的状态角标；健康的在架商品返回 null（不渲染角标）。
 *
 * 优先级：已售 > 已归档 > 已失效 > 即将过期。
 * 注意：sold / archived 是用户主动置入的终态，即使同时已过 TTL 也应显示终态，
 * 在一件已卖出的商品上显示「已失效」会误导卖家。除此重叠场景外，
 * 映射与 M4 契约表逐条一致。
 */
export function listingStatusBadge(
  listing: BadgeListing,
  now: number = Date.now()
): StatusBadge | null {
  if (!listing) return null;

  if (listing.status === 'sold') return { tone: 'muted', text: '已售' };
  if (listing.status === 'archived') return { tone: 'muted', text: '已归档' };
  if (listing.status === 'expired' || isExpired(listing, now)) {
    return { tone: 'muted', text: '已失效' };
  }
  if (needsRefreshReminder(listing, now)) {
    return { tone: 'warning', text: '即将过期·可刷新' };
  }
  return null;
}
