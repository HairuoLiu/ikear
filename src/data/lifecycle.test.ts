// M4 生命周期集成测试：refresh 续期 / expired 复活 / sold·archived 免疫 / 降价重上架。
// 只经 dataSource 读写，不直接碰 mockData。
import {
  __resetMockDb,
  LISTING_TTL_DAYS,
  daysUntilExpiry,
  isExpired,
  mockDataSource,
} from './dataSource';
import { CURRENT_USER } from './mockData';

beforeEach(() => {
  __resetMockDb();
});

describe('refreshListing 续期', () => {
  it('临期 active 刷新后 TTL 重置为 30 天', async () => {
    const before = await mockDataSource.getListing('l_1'); // 剩 2 天
    expect(daysUntilExpiry(before!)).toBeLessThanOrEqual(3);

    const after = await mockDataSource.refreshListing('l_1');
    expect(after.status).toBe('active');
    expect(daysUntilExpiry(after)).toBe(LISTING_TTL_DAYS);
    expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(
      new Date(before!.expiresAt).getTime()
    );
  });

  it('刷新只动 status/expiresAt，业务字段不变', async () => {
    const before = await mockDataSource.getListing('l_1');
    const after = await mockDataSource.refreshListing('l_1');
    expect(after.title).toBe(before!.title);
    expect(after.price).toBe(before!.price);
    expect(after.createdAt).toBe(before!.createdAt);
  });

  it('expired 复活为 active 并持久化', async () => {
    const before = await mockDataSource.getListing('l_9');
    expect(before!.status).toBe('expired');
    expect(isExpired(before!)).toBe(true);

    const after = await mockDataSource.refreshListing('l_9');
    expect(after.status).toBe('active');
    expect(isExpired(after)).toBe(false);

    const reread = await mockDataSource.getListing('l_9');
    expect(reread!.status).toBe('active');
    expect(daysUntilExpiry(reread!)).toBe(LISTING_TTL_DAYS);
  });

  it('sold 不被 refresh 改变（状态与到期时间都不动）', async () => {
    const before = await mockDataSource.getListing('l_11');
    expect(before!.status).toBe('sold');

    const after = await mockDataSource.refreshListing('l_11');
    expect(after.status).toBe('sold');
    expect(after.expiresAt).toBe(before!.expiresAt);
    expect((await mockDataSource.getListing('l_11'))!.status).toBe('sold');
  });

  it('archived 同样免疫 refresh', async () => {
    const archived = await mockDataSource.updateListing('l_5', { status: 'archived' });
    const after = await mockDataSource.refreshListing('l_5');
    expect(after.status).toBe('archived');
    expect(after.expiresAt).toBe(archived.expiresAt);
  });
});

describe('updateListing 降价重上架', () => {
  it('改价 + discount 并持久化', async () => {
    const updated = await mockDataSource.updateListing('l_12', {
      price: 399,
      discount: 20,
    });
    expect(updated.price).toBe(399);
    expect(updated.discount).toBe(20);

    const reread = await mockDataSource.getListing('l_12');
    expect(reread!.price).toBe(399);
    expect(reread!.discount).toBe(20);
  });

  it('expired 挂牌可降价后重新上架为 active', async () => {
    const revived = await mockDataSource.refreshListing('l_10'); // 先续期复活
    expect(revived.status).toBe('active');

    const discounted = await mockDataSource.updateListing('l_10', {
      price: 99,
      discount: 25,
    });
    expect(discounted.status).toBe('active');
    expect(discounted.price).toBe(99);
    expect(isExpired(discounted)).toBe(false);
  });
});

describe('getProfile', () => {
  it('返回当前用户资料副本', () => {
    const me = mockDataSource.getProfile();
    expect(me.id).toBe(CURRENT_USER.id);
    expect(me.nickname).toBe(CURRENT_USER.nickname);

    me.nickname = '被改坏了';
    expect(mockDataSource.getProfile().nickname).toBe(CURRENT_USER.nickname);
  });
});
