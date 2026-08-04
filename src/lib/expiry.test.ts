import {
  BOOST_HOURS,
  DAY_MS,
  HOUR_MS,
  REFRESH_REMINDER_DAYS,
  TTL_DAYS,
  daysUntilExpiry,
  expiryAt,
  isExpired,
  needsRefreshReminder,
  refresh,
} from './expiry';

const NOW = new Date('2026-06-01T12:00:00.000Z').getTime();

/** 造一条「d 天前发布」的挂牌（只有 created_at，走 TTL 推导） */
const postedDaysAgo = (d: number) => ({
  created_at: new Date(NOW - d * DAY_MS).toISOString(),
});

/** 造一条显式带 expiresAt 的挂牌 */
const expiringInDays = (d: number) => ({
  expiresAt: new Date(NOW + d * DAY_MS).toISOString(),
});

describe('常量', () => {
  it('TTL 30 天 / 曝光 24 小时 / 临期 3 天', () => {
    expect(TTL_DAYS).toBe(30);
    expect(BOOST_HOURS).toBe(24);
    expect(REFRESH_REMINDER_DAYS).toBe(3);
  });
});

describe('expiryAt', () => {
  it('优先使用显式 expiresAt', () => {
    const iso = new Date(NOW + 5 * DAY_MS).toISOString();
    expect(expiryAt({ expiresAt: iso, created_at: new Date(NOW).toISOString() })).toBe(
      new Date(iso).getTime()
    );
  });

  it('兼容 snake_case expires_at', () => {
    const iso = new Date(NOW + 5 * DAY_MS).toISOString();
    expect(expiryAt({ expires_at: iso })).toBe(new Date(iso).getTime());
  });

  it('缺省时按 created_at + 30 天推导', () => {
    expect(expiryAt(postedDaysAgo(0))).toBe(NOW + TTL_DAYS * DAY_MS);
  });

  it('无任何时间字段返回 null', () => {
    expect(expiryAt({})).toBe(null);
  });
});

describe('isExpired', () => {
  it('刚发布：未过期', () => {
    expect(isExpired(postedDaysAgo(0), NOW)).toBe(false);
  });

  it('第 29 天：未过期', () => {
    expect(isExpired(postedDaysAgo(29), NOW)).toBe(false);
  });

  it('第 30 天整点：边界即过期', () => {
    expect(isExpired(postedDaysAgo(30), NOW)).toBe(true);
  });

  it('第 31 天：已过期', () => {
    expect(isExpired(postedDaysAgo(31), NOW)).toBe(true);
  });

  it('无到期信息视为永不过期', () => {
    expect(isExpired({}, NOW)).toBe(false);
  });
});

describe('daysUntilExpiry', () => {
  it('刚发布剩 30 天', () => {
    expect(daysUntilExpiry(postedDaysAgo(0), NOW)).toBe(30);
  });

  it('第 29 天剩 1 天', () => {
    expect(daysUntilExpiry(postedDaysAgo(29), NOW)).toBe(1);
  });

  it('第 30 天剩 0 天', () => {
    expect(daysUntilExpiry(postedDaysAgo(30), NOW)).toBe(0);
  });

  it('第 31 天为 -1 天', () => {
    expect(daysUntilExpiry(postedDaysAgo(31), NOW)).toBe(-1);
  });

  it('无到期信息返回 Infinity', () => {
    expect(daysUntilExpiry({}, NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('needsRefreshReminder', () => {
  it('第 26 天（剩 4 天）不提醒', () => {
    expect(needsRefreshReminder(postedDaysAgo(26), NOW)).toBe(false);
  });

  it('第 27 天（剩 3 天）开始提醒 —— 边界', () => {
    expect(needsRefreshReminder(postedDaysAgo(27), NOW)).toBe(true);
  });

  it('临期第 2 天（剩 2 天）提醒', () => {
    expect(needsRefreshReminder(expiringInDays(2), NOW)).toBe(true);
  });

  it('已过期不再提醒（改走归档流程）', () => {
    expect(needsRefreshReminder(postedDaysAgo(31), NOW)).toBe(false);
  });

  it('无到期信息不提醒', () => {
    expect(needsRefreshReminder({}, NOW)).toBe(false);
  });
});

describe('refresh', () => {
  it('重置 TTL 为 30 天后并赠 24h 曝光', () => {
    const before = postedDaysAgo(29);
    const after = refresh(before, NOW);
    expect(new Date(after.expiresAt).getTime()).toBe(NOW + TTL_DAYS * DAY_MS);
    expect(new Date(after.boostedUntil).getTime()).toBe(NOW + BOOST_HOURS * HOUR_MS);
  });

  it('刷新后不再临期、不再过期', () => {
    const after = refresh(postedDaysAgo(31), NOW);
    expect(isExpired(after, NOW)).toBe(false);
    expect(needsRefreshReminder(after, NOW)).toBe(false);
    expect(daysUntilExpiry(after, NOW)).toBe(30);
  });

  it('返回新对象且保留原有字段，不修改入参', () => {
    const before = { id: 'l_1', title: 'MALM', ...postedDaysAgo(29) };
    const after = refresh(before, NOW);
    expect(after).not.toBe(before);
    expect(after.id).toBe('l_1');
    expect(after.title).toBe('MALM');
    expect(Object.prototype.hasOwnProperty.call(before, 'expiresAt')).toBe(false);
  });
});
