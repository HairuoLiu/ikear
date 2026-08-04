/**
 * 挂牌生命周期（TTL）纯逻辑 —— M4 过期引擎的计算核心。
 *
 * 约束：本文件**不得** import react-native / expo / 任何原生依赖，
 * 必须能被 jest（或 node）直接执行。
 *
 * 字段兼容：数据层历史上用 snake_case（created_at），M0 契约用 camelCase
 * （expiresAt / boostedUntil）。这里两种写法都能读，避免并行开发时的契约漂移。
 */

export const TTL_DAYS = 30;
export const BOOST_HOURS = 24;
export const REFRESH_REMINDER_DAYS = 3;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export interface ExpirableListing {
  expiresAt?: string | number | null;
  boostedUntil?: string | number | null;
  createdAt?: string | number | null;
  expires_at?: string | number | null;
  created_at?: string | number | null;
}

function toMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** 到期时间戳（ms）。缺省时按「创建时间 + TTL」推导；都没有则返回 null（视为永不过期）。 */
export function expiryAt(listing: ExpirableListing): number | null {
  const explicit = toMs(listing.expiresAt ?? listing.expires_at);
  if (explicit !== null) return explicit;
  const created = toMs(listing.createdAt ?? listing.created_at);
  return created === null ? null : created + TTL_DAYS * DAY_MS;
}

export function isExpired(listing: ExpirableListing, now: number = Date.now()): boolean {
  const exp = expiryAt(listing);
  return exp !== null && now >= exp;
}

/** 距到期天数（向上取整）。已过期为 0 或负数；无到期信息返回 Infinity。 */
export function daysUntilExpiry(listing: ExpirableListing, now: number = Date.now()): number {
  const exp = expiryAt(listing);
  if (exp === null) return Number.POSITIVE_INFINITY;
  return Math.ceil((exp - now) / DAY_MS);
}

/** 临期提醒：未过期且剩余天数 ≤ REFRESH_REMINDER_DAYS。 */
export function needsRefreshReminder(listing: ExpirableListing, now: number = Date.now()): boolean {
  if (isExpired(listing, now)) return false;
  return daysUntilExpiry(listing, now) <= REFRESH_REMINDER_DAYS;
}

/** 刷新：重置 TTL 30 天，并赠送 24h 曝光标。返回新对象，不修改入参。 */
export function refresh<T extends ExpirableListing>(
  listing: T,
  now: number = Date.now()
): T & { expiresAt: string; boostedUntil: string } {
  return {
    ...listing,
    expiresAt: new Date(now + TTL_DAYS * DAY_MS).toISOString(),
    boostedUntil: new Date(now + BOOST_HOURS * HOUR_MS).toISOString(),
  };
}
