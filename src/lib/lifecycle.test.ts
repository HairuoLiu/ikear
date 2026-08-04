/**
 * M4 生命周期端到端语义测试（纯函数，无 RN）。
 *
 * 与 expiry.test.ts 的分工：那边逐个函数做单元校验，
 * 这边按「发布 → 临期 → 刷新 / 过期 → 售出 / 归档」的真实流转串起来验收。
 *
 * 状态流转（markSold / archiveListing / discountRelist）由 useStore 持有，
 * 而 useStore 依赖 AsyncStorage 等原生模块、无法在纯 node/jest 环境内加载，
 * 故此处按契约只验收 refresh 部分，以及终态挂牌在角标逻辑上的语义。
 */
import {
  BOOST_HOURS,
  DAY_MS,
  HOUR_MS,
  TTL_DAYS,
  daysUntilExpiry,
  isExpired,
  needsRefreshReminder,
  refresh,
} from './expiry';
import { listingStatusBadge, tabBadgeCount } from './badges';

const NOW = new Date('2026-06-01T12:00:00.000Z').getTime();

/** 模拟 store.publishDraft：创建时即写入 createdAt + expiresAt(+30d) */
const publishedAt = (t: number) => ({
  id: 'l_1',
  sellerId: 'u_me',
  status: 'active' as const,
  price: 300,
  createdAt: new Date(t).toISOString(),
  expiresAt: new Date(t + TTL_DAYS * DAY_MS).toISOString(),
});

/** 「d 天前发布」的挂牌 */
const agedDays = (d: number) => publishedAt(NOW - d * DAY_MS);

// ---------------------------------------------------------------------------

describe('生命周期 · 过期判定', () => {
  it('刚发布：未过期，剩余 30 天', () => {
    const l = agedDays(0);
    expect(isExpired(l, NOW)).toBe(false);
    expect(daysUntilExpiry(l, NOW)).toBe(TTL_DAYS);
  });

  it('第 29 天：仍未过期', () => {
    expect(isExpired(agedDays(29), NOW)).toBe(false);
  });

  it('第 31 天：已过期', () => {
    expect(isExpired(agedDays(31), NOW)).toBe(true);
  });

  it('第 30 天整点：边界即过期', () => {
    expect(isExpired(agedDays(30), NOW)).toBe(true);
  });
});

describe('生命周期 · 临期提醒', () => {
  it('剩 3 天：进入提醒窗口（边界）', () => {
    expect(needsRefreshReminder(agedDays(27), NOW)).toBe(true);
  });

  it('剩 1 天：提醒', () => {
    expect(needsRefreshReminder(agedDays(29), NOW)).toBe(true);
  });

  it('剩 4 天：尚未提醒', () => {
    expect(needsRefreshReminder(agedDays(26), NOW)).toBe(false);
  });

  it('已过期：不再提醒，改走归档/降价流程', () => {
    expect(needsRefreshReminder(agedDays(31), NOW)).toBe(false);
  });

  it('临期挂牌同时产生 warning 角标与 profile 角标', () => {
    const l = agedDays(28);
    expect(listingStatusBadge(l, NOW)).toEqual({ tone: 'warning', text: '即将过期·可刷新' });
    expect(tabBadgeCount({ currentUser: { id: 'u_me' }, listings: [l] }, NOW).profile).toBe(1);
  });
});

describe('生命周期 · 刷新（refreshListing 的纯逻辑内核）', () => {
  it('expiresAt 重置为 +30 天，boostedUntil 为 +24 小时', () => {
    const after = refresh(agedDays(29), NOW);
    expect(new Date(after.expiresAt).getTime()).toBe(NOW + TTL_DAYS * DAY_MS);
    expect(new Date(after.boostedUntil).getTime()).toBe(NOW + BOOST_HOURS * HOUR_MS);
  });

  it('省略 now 时以当前时刻为基准（≈ 容差 2s）', () => {
    const t = Date.now();
    const after = refresh(agedDays(29));
    const expDiff = Math.abs(new Date(after.expiresAt).getTime() - (t + TTL_DAYS * DAY_MS));
    const boostDiff = Math.abs(new Date(after.boostedUntil).getTime() - (t + BOOST_HOURS * HOUR_MS));
    expect(expDiff).toBeLessThan(2000);
    expect(boostDiff).toBeLessThan(2000);
  });

  it('临期商品刷新后：角标消失、退出提醒窗口', () => {
    const before = agedDays(28);
    expect(needsRefreshReminder(before, NOW)).toBe(true);

    const after = refresh(before, NOW);
    expect(needsRefreshReminder(after, NOW)).toBe(false);
    expect(listingStatusBadge(after, NOW)).toBe(null);
    expect(tabBadgeCount({ currentUser: { id: 'u_me' }, listings: [after] }, NOW).profile).toBe(0);
  });

  it('已过期商品也能被刷新救活', () => {
    const after = refresh(agedDays(31), NOW);
    expect(isExpired(after, NOW)).toBe(false);
    expect(daysUntilExpiry(after, NOW)).toBe(TTL_DAYS);
  });

  it('不修改入参，且保留 id / 价格 / 状态等业务字段', () => {
    const before = agedDays(29);
    const after = refresh(before, NOW);
    expect(after).not.toBe(before);
    expect(after.id).toBe('l_1');
    expect(after.price).toBe(300);
    expect(after.status).toBe('active');
    expect(before.expiresAt).toBe(new Date(NOW - 29 * DAY_MS + TTL_DAYS * DAY_MS).toISOString());
  });

  it('刷新不改变 status（售出/归档由 store 单独处理）', () => {
    expect(refresh({ ...agedDays(29), status: 'sold' as const }, NOW).status).toBe('sold');
  });
});

describe('生命周期 · 终态（售出 / 归档 / 降价重上架）', () => {
  // store.markSold / archiveListing 只做 { ...l, status } 的整体替换，
  // 这里以同样的形状验收终态在生命周期逻辑中的语义。
  const sold = { ...agedDays(29), status: 'sold' as const };
  const archived = { ...agedDays(29), status: 'archived' as const };

  it('已售：显示「已售」而非临期提醒', () => {
    expect(listingStatusBadge(sold, NOW)).toEqual({ tone: 'muted', text: '已售' });
  });

  it('已归档：显示「已归档」', () => {
    expect(listingStatusBadge(archived, NOW)).toEqual({ tone: 'muted', text: '已归档' });
  });

  it('终态挂牌不计入 profile 刷新角标', () => {
    const state = { currentUser: { id: 'u_me' }, listings: [sold, archived] };
    expect(tabBadgeCount(state, NOW).profile).toBe(0);
  });

  it('过期后归档：状态与时间双重终结，仍只显示「已归档」', () => {
    const l = { ...agedDays(31), status: 'archived' as const };
    expect(isExpired(l, NOW)).toBe(true);
    expect(listingStatusBadge(l, NOW)).toEqual({ tone: 'muted', text: '已归档' });
  });

  it('降价重上架（store 重置 TTL 并置回 active）后恢复在架且无角标', () => {
    // 对应 store.discountRelist：price 改写 + expiresAt=+30d + status='active'
    const relisted = {
      ...agedDays(31),
      price: 240,
      status: 'active' as const,
      expiresAt: new Date(NOW + TTL_DAYS * DAY_MS).toISOString(),
    };
    expect(isExpired(relisted, NOW)).toBe(false);
    expect(listingStatusBadge(relisted, NOW)).toBe(null);
  });
});
