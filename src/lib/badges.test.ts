import { DAY_MS } from './expiry';
import { listingStatusBadge, tabBadgeCount, type BadgeListing } from './badges';

const NOW = new Date('2026-06-01T12:00:00.000Z').getTime();

const daysAhead = (d: number) => new Date(NOW + d * DAY_MS).toISOString();

/** 默认造一条健康的在架挂牌，用 patch 覆盖需要的字段 */
const listing = (patch: Partial<BadgeListing> = {}): BadgeListing => ({
  sellerId: 'u_me',
  status: 'active',
  expiresAt: daysAhead(20),
  ...patch,
});

// ---------------------------------------------------------------------------

describe('listingStatusBadge', () => {
  it('健康在架商品无角标', () => {
    expect(listingStatusBadge(listing(), NOW)).toBe(null);
  });

  it('status=expired → muted 已失效', () => {
    const badge = listingStatusBadge(listing({ status: 'expired' }), NOW);
    expect(badge).toEqual({ tone: 'muted', text: '已失效' });
  });

  it('时间已过 TTL（status 未同步）→ muted 已失效', () => {
    const badge = listingStatusBadge(listing({ expiresAt: daysAhead(-1) }), NOW);
    expect(badge).toEqual({ tone: 'muted', text: '已失效' });
  });

  it('临期 ≤3 天 → warning 即将过期·可刷新', () => {
    const badge = listingStatusBadge(listing({ expiresAt: daysAhead(2) }), NOW);
    expect(badge).toEqual({ tone: 'warning', text: '即将过期·可刷新' });
  });

  it('剩 4 天还不算临期，无角标', () => {
    expect(listingStatusBadge(listing({ expiresAt: daysAhead(4) }), NOW)).toBe(null);
  });

  it('status=sold → muted 已售', () => {
    const badge = listingStatusBadge(listing({ status: 'sold' }), NOW);
    expect(badge).toEqual({ tone: 'muted', text: '已售' });
  });

  it('status=archived → muted 已归档', () => {
    const badge = listingStatusBadge(listing({ status: 'archived' }), NOW);
    expect(badge).toEqual({ tone: 'muted', text: '已归档' });
  });

  it('终态优先于时间过期：已售且超 TTL 仍显示「已售」', () => {
    const badge = listingStatusBadge(listing({ status: 'sold', expiresAt: daysAhead(-5) }), NOW);
    expect(badge).toEqual({ tone: 'muted', text: '已售' });
  });

  it('终态优先于临期提醒：已归档商品不提示刷新', () => {
    const badge = listingStatusBadge(listing({ status: 'archived', expiresAt: daysAhead(1) }), NOW);
    expect(badge).toEqual({ tone: 'muted', text: '已归档' });
  });

  it('无到期信息视为永不过期，无角标', () => {
    expect(listingStatusBadge({ status: 'active' }, NOW)).toBe(null);
  });
});

// ---------------------------------------------------------------------------

describe('tabBadgeCount — messages', () => {
  it('只统计发给我的未读消息', () => {
    const state = {
      currentUser: { id: 'u_me' },
      messages: [
        { read: false, receiver_id: 'u_me' },
        { read: false, receiver_id: 'u_me' },
        { read: true, receiver_id: 'u_me' }, // 已读
        { read: false, receiver_id: 'u_3' }, // 不是发给我的
      ],
    };
    expect(tabBadgeCount(state, NOW).messages).toBe(2);
  });

  it('store 提供聚合 unread 时优先采用', () => {
    const state = {
      unread: 7,
      messages: [{ read: false, receiver_id: 'u_me' }],
    };
    expect(tabBadgeCount(state, NOW).messages).toBe(7);
  });

  it('未登录时回落到 u_me 身份统计', () => {
    const state = {
      currentUser: null,
      messages: [{ read: false, receiver_id: 'u_me' }],
    };
    expect(tabBadgeCount(state, NOW).messages).toBe(1);
  });

  it('空 state 返回 0 / 0', () => {
    expect(tabBadgeCount({}, NOW)).toEqual({ messages: 0, profile: 0 });
  });
});

describe('tabBadgeCount — profile 刷新提醒', () => {
  const state = {
    currentUser: { id: 'u_me' },
    listings: [
      listing({ expiresAt: daysAhead(1) }), // 我的·临期 → 计入
      listing({ expiresAt: daysAhead(3) }), // 我的·临期边界 → 计入
      listing({ expiresAt: daysAhead(10) }), // 我的·健康 → 不计
      listing({ expiresAt: daysAhead(-1) }), // 我的·已过期 → 不计（走归档/降价）
      listing({ status: 'sold', expiresAt: daysAhead(1) }), // 已售 → 不计
      listing({ status: 'archived', expiresAt: daysAhead(1) }), // 已归档 → 不计
      listing({ sellerId: 'u_3', expiresAt: daysAhead(1) }), // 别人的 → 不计
    ],
  };

  it('只统计我的、active、临期可刷新的挂牌', () => {
    expect(tabBadgeCount(state, NOW).profile).toBe(2);
  });

  it('不影响 messages 计数', () => {
    expect(tabBadgeCount(state, NOW).messages).toBe(0);
  });

  it('兼容 snake_case seller_id', () => {
    const s = {
      currentUser: { id: 'u_me' },
      listings: [{ seller_id: 'u_me', status: 'active' as const, expiresAt: daysAhead(2) }],
    };
    expect(tabBadgeCount(s, NOW).profile).toBe(1);
  });

  it('刷新后（TTL 重置为 30 天）不再计入角标', () => {
    const s = {
      currentUser: { id: 'u_me' },
      listings: [listing({ expiresAt: daysAhead(30) })],
    };
    expect(tabBadgeCount(s, NOW).profile).toBe(0);
  });
});
