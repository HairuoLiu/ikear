import { applyBrowseFilters } from '../lib/browse';
import {
  __resetMockDb,
  BROWSE_SORT_MAP,
  daysUntilExpiry,
  isExpiringSoon,
  LISTING_TTL_DAYS,
  mockDataSource,
  settleStatus,
  toBrowseFilter,
  toListingSort,
} from './dataSource';
import type { CreateListingInput } from './dataSource';
import type { Listing } from './types';

const DAY = 86_400_000;

beforeEach(() => {
  __resetMockDb();
});

const draft: CreateListingInput = {
  title: 'FLISAT 儿童小凳',
  description: '实木小凳，孩子长大了闲置。',
  price: 20,
  condition: '良好',
  category: 'kids',
  photos: ['🧸'],
  coverIndex: 0,
  location: { city: '多伦多', district: 'North York' },
  sellerId: 'u_me',
  type: 'secondhand',
};

describe('mockDataSource.getListings 过滤与排序', () => {
  it('无 filter 返回全部', async () => {
    const all = await mockDataSource.getListings();
    expect(all.length).toBeGreaterThanOrEqual(15);
  });

  it('按 category 过滤', async () => {
    const rows = await mockDataSource.getListings({ category: 'storage' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((l) => l.category === 'storage')).toBe(true);
  });

  it('按 location.city 过滤', async () => {
    const rows = await mockDataSource.getListings({ city: '万锦' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((l) => l.location.city === '万锦')).toBe(true);
  });

  it('按 status 过滤（支持数组）', async () => {
    const active = await mockDataSource.getListings({ status: 'active' });
    expect(active.every((l) => l.status === 'active')).toBe(true);

    const expired = await mockDataSource.getListings({ status: 'expired' });
    expect(expired.length).toBeGreaterThanOrEqual(2);

    const both = await mockDataSource.getListings({ status: ['sold', 'expired'] });
    expect(both.length).toBe(expired.length + 1);
  });

  it('按 type 过滤出周边配件', async () => {
    const acc = await mockDataSource.getListings({ type: 'accessory' });
    expect(acc.length).toBeGreaterThanOrEqual(2);
    expect(acc.every((l) => l.type === 'accessory')).toBe(true);
  });

  it('按关键词搜索标题/描述', async () => {
    const rows = await mockDataSource.getListings({ query: 'malm' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('l_1');
  });

  it('排序：newest / price_asc / price_desc / expiring', async () => {
    const newest = await mockDataSource.getListings({ sort: 'newest' });
    for (let i = 1; i < newest.length; i++) {
      expect(new Date(newest[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(newest[i].createdAt).getTime()
      );
    }

    const asc = await mockDataSource.getListings({ sort: 'price_asc' });
    expect(asc[0].price).toBeLessThanOrEqual(asc[asc.length - 1].price);

    const desc = await mockDataSource.getListings({ sort: 'price_desc' });
    expect(desc[0].price).toBeGreaterThanOrEqual(desc[desc.length - 1].price);

    const expiring = await mockDataSource.getListings({ sort: 'expiring' });
    for (let i = 1; i < expiring.length; i++) {
      expect(new Date(expiring[i - 1].expiresAt).getTime()).toBeLessThanOrEqual(
        new Date(expiring[i].expiresAt).getTime()
      );
    }
  });

  it('组合过滤：品类 + 城市 + 状态', async () => {
    const rows = await mockDataSource.getListings({
      category: 'storage',
      city: '密西沙加',
      status: 'active',
    });
    expect(rows.every((l) => l.category === 'storage' && l.location.city === '密西沙加')).toBe(
      true
    );
  });
});

describe('mockDataSource.getListing', () => {
  it('命中返回详情', async () => {
    const l = await mockDataSource.getListing('l_12');
    expect(l?.title).toContain('SÖDERHAMN');
    expect(l?.photos[l.coverIndex]).toBeDefined();
  });

  it('未命中返回 null', async () => {
    expect(await mockDataSource.getListing('l_nope')).toBeNull();
  });
});

describe('mockDataSource.createListing', () => {
  it('补全 id / createdAt / expiresAt / status 并插入表头', async () => {
    const created = await mockDataSource.createListing(draft);
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('active');
    expect(daysUntilExpiry(created)).toBe(LISTING_TTL_DAYS);

    const all = await mockDataSource.getListings();
    expect(all.some((l) => l.id === created.id)).toBe(true);
    expect(await mockDataSource.getListing(created.id)).not.toBeNull();
  });

  it('同步旧字段镜像，未迁移 UI 仍可渲染', async () => {
    const created = await mockDataSource.createListing(draft);
    expect(created.images).toEqual(created.photos);
    expect(created.city).toBe('多伦多');
    expect(created.seller_id).toBe('u_me');
    expect(created.created_at).toBe(created.createdAt);
  });
});

describe('mockDataSource.refreshListing', () => {
  it('把 expired 重新激活并续期 30 天', async () => {
    const before = await mockDataSource.getListing('l_9');
    expect(before?.status).toBe('expired');

    const after = await mockDataSource.refreshListing('l_9');
    expect(after.status).toBe('active');
    expect(daysUntilExpiry(after)).toBe(LISTING_TTL_DAYS);
    expect((await mockDataSource.getListing('l_9'))?.status).toBe('active');
  });

  it('对临期 active 续期后不再是临期', async () => {
    const before = await mockDataSource.getListing('l_1');
    expect(isExpiringSoon(before as Listing)).toBe(true);

    const after = await mockDataSource.refreshListing('l_1');
    expect(isExpiringSoon(after)).toBe(false);
  });

  it('sold / archived 不被续期', async () => {
    const sold = await mockDataSource.refreshListing('l_11');
    expect(sold.status).toBe('sold');
  });

  it('id 不存在时抛错', async () => {
    await expect(mockDataSource.refreshListing('l_nope')).rejects.toThrow(
      /Listing not found/
    );
  });
});

describe('mockDataSource.updateListing', () => {
  it('局部更新并持久化到内存库', async () => {
    const updated = await mockDataSource.updateListing('l_3', {
      price: 99,
      status: 'sold',
    });
    expect(updated.price).toBe(99);
    expect((await mockDataSource.getListing('l_3'))?.status).toBe('sold');
  });

  it('不允许改写 id', async () => {
    const updated = await mockDataSource.updateListing('l_5', {
      id: 'hacked',
    } as Partial<Listing>);
    expect(updated.id).toBe('l_5');
  });
});

describe('生命周期纯函数', () => {
  const base = (expiresAt: string, status: Listing['status'] = 'active'): Listing =>
    ({ ...draft, id: 'x', createdAt: new Date().toISOString(), expiresAt, status } as Listing);

  it('settleStatus 把过期的 active 结算为 expired', () => {
    const stale = base(new Date(Date.now() - DAY).toISOString());
    expect(settleStatus(stale).status).toBe('expired');
  });

  it('settleStatus 不影响未到期与 sold', () => {
    const fresh = base(new Date(Date.now() + 5 * DAY).toISOString());
    expect(settleStatus(fresh).status).toBe('active');

    const sold = base(new Date(Date.now() - DAY).toISOString(), 'sold');
    expect(settleStatus(sold).status).toBe('sold');
  });

  it('isExpiringSoon 只对 ≤3 天的 active 为真', () => {
    expect(isExpiringSoon(base(new Date(Date.now() + 2 * DAY).toISOString()))).toBe(true);
    expect(isExpiringSoon(base(new Date(Date.now() + 10 * DAY).toISOString()))).toBe(false);
    expect(isExpiringSoon(base(new Date(Date.now() - DAY).toISOString()))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M1 浏览：排序映射 + 过期排除（与 lib/browse.ts 口径对齐）
// ---------------------------------------------------------------------------

describe('M1 浏览排序映射', () => {
  it('near / new / price 映射到 newest / newest / price_asc', () => {
    expect(toListingSort('near')).toBe('newest');
    expect(toListingSort('new')).toBe('newest');
    expect(toListingSort('price')).toBe('price_asc');
    expect(BROWSE_SORT_MAP.price).toBe('price_asc');
  });

  it('原生 ListingSort 透传，缺省/非法值回落 newest', () => {
    expect(toListingSort('expiring')).toBe('expiring');
    expect(toListingSort('price_desc')).toBe('price_desc');
    expect(toListingSort()).toBe('newest');
    expect(toListingSort('乱来' as never)).toBe('newest');
  });

  it('toBrowseFilter 默认只取 active 且完成排序映射', () => {
    expect(toBrowseFilter({ category: 'storage', sort: 'price' })).toEqual({
      category: 'storage',
      status: 'active',
      sort: 'price_asc',
    });
    // 显式指定 status 时不被覆盖（M4 profile 要看 expired/sold）
    expect(toBrowseFilter({ status: 'expired' }).status).toBe('expired');
  });

  it('按 price 档取到的列表价格升序', async () => {
    const rows = await mockDataSource.getListings(toBrowseFilter({ sort: 'price' }));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].price).toBeLessThanOrEqual(rows[i].price);
    }
  });
});

describe('M1 浏览过期排除', () => {
  it('active 结果不含 expired / sold 挂牌', async () => {
    const rows = await mockDataSource.getListings(toBrowseFilter());
    const ids = rows.map((l) => l.id);
    expect(ids).not.toContain('l_9'); // 已过期
    expect(ids).not.toContain('l_10'); // 已过期
    expect(ids).not.toContain('l_11'); // 已售
    expect(rows.every((l) => l.status === 'active')).toBe(true);
  });

  it('TTL 已过但 status 还是 active 的挂牌会被惰性结算掉', async () => {
    await mockDataSource.updateListing('l_3', {
      expiresAt: new Date(Date.now() - DAY).toISOString(),
    });
    const rows = await mockDataSource.getListings(toBrowseFilter());
    expect(rows.some((l) => l.id === 'l_3')).toBe(false);

    const expired = await mockDataSource.getListings({ status: 'expired' });
    expect(expired.some((l) => l.id === 'l_3')).toBe(true);
  });

  it('品类 + 城市 + active 组合：只回本城在售，过期的 l_10 被剔除', async () => {
    const rows = await mockDataSource.getListings(
      toBrowseFilter({ category: 'storage', city: '密西沙加' })
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (l) =>
          l.category === 'storage' && l.location.city === '密西沙加' && l.status === 'active'
      )
    ).toBe(true);
    expect(rows.some((l) => l.id === 'l_10')).toBe(false); // 万锦 + 已过期
  });

  it('与 applyBrowseFilters 口径一致：可见集合完全相同', async () => {
    const fromDs = await mockDataSource.getListings(toBrowseFilter({ sort: 'new' }));
    const all = await mockDataSource.getListings();
    const fromLib = applyBrowseFilters(all, { sort: 'new' });
    expect(fromDs.map((l) => l.id).sort()).toEqual(fromLib.map((l) => l.id).sort());
  });
});
