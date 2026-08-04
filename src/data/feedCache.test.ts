import { __resetMockDb, mockDataSource } from './dataSource';
import type { FeedStorage } from './feedCache';
import {
  FEED_CACHE_KEY,
  __resetFeedMemory,
  __setFeedStorage,
  clearFeed,
  getFeed,
  loadFeed,
  peekFeed,
  saveFeed,
} from './feedCache';
import type { Listing } from './types';

/** 可观测的假存储，等价于 AsyncStorage 的三个方法。 */
function fakeStorage() {
  const bin = new Map<string, string>();
  const api: FeedStorage & { bin: Map<string, string> } = {
    bin,
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
  return api;
}

let store = fakeStorage();

beforeEach(() => {
  __resetMockDb();
  __resetFeedMemory();
  store = fakeStorage();
  __setFeedStorage(store);
});

describe('feedCache 读写', () => {
  it('saveFeed 写入 ikear.feed.v1，loadFeed 原样取回', async () => {
    const rows = await mockDataSource.getListings();
    await saveFeed(rows);

    expect(store.bin.has(FEED_CACHE_KEY)).toBe(true);
    __resetFeedMemory(); // 强制走磁盘
    const back = await loadFeed();
    expect(back?.map((l) => l.id)).toEqual(rows.map((l) => l.id));
  });

  it('没有缓存返回 null，脏数据也返回 null', async () => {
    expect(await loadFeed()).toBeNull();

    store.bin.set(FEED_CACHE_KEY, '{不是 JSON');
    expect(await loadFeed()).toBeNull();

    store.bin.set(FEED_CACHE_KEY, '{"a":1}'); // 不是数组
    expect(await loadFeed()).toBeNull();
  });

  it('clearFeed 同时清掉内存与磁盘', async () => {
    await saveFeed([{ id: 'x' } as Listing]);
    expect(peekFeed()).not.toBeNull();

    await clearFeed();
    expect(peekFeed()).toBeNull();
    expect(store.bin.has(FEED_CACHE_KEY)).toBe(false);
  });
});

describe('getFeed', () => {
  it('只返回可浏览的 active，并写入缓存快照', async () => {
    const rows = await getFeed();
    const ids = rows.map((l) => l.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(ids).not.toContain('l_9'); // expired
    expect(ids).not.toContain('l_11'); // sold
    expect(store.bin.has(FEED_CACHE_KEY)).toBe(true);
  });

  it('按品类 / 地点 / 关键词收窄', async () => {
    const storage = await getFeed({ category: 'storage' });
    expect(storage.every((l) => l.category === 'storage')).toBe(true);

    const city = await getFeed({ location: { city: '万锦' } });
    expect(city.every((l) => l.location.city === '万锦')).toBe(true);

    const q = await getFeed({ query: 'MALM' });
    expect(q.map((l) => l.id)).toEqual(['l_1']);
  });

  it('sort=price 价格升序，sort=new 时间倒序', async () => {
    const byPrice = await getFeed({ sort: 'price' });
    for (let i = 1; i < byPrice.length; i++) {
      expect(byPrice[i - 1].price).toBeLessThanOrEqual(byPrice[i].price);
    }

    const byNew = await getFeed({ sort: 'new' });
    for (let i = 1; i < byNew.length; i++) {
      expect(new Date(byNew[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(byNew[i].createdAt).getTime()
      );
    }
  });

  it('数据源异常时回放缓存，仍可离线按品类浏览', async () => {
    const online = await getFeed(); // 先建立缓存
    expect(online.length).toBeGreaterThan(0);
    __resetFeedMemory(); // 只留磁盘缓存

    const real = mockDataSource.getListings;
    mockDataSource.getListings = async () => {
      throw new Error('offline');
    };
    try {
      const offline = await getFeed({ category: 'storage' });
      expect(offline.length).toBeGreaterThan(0);
      expect(offline.every((l) => l.category === 'storage')).toBe(true);
    } finally {
      mockDataSource.getListings = real;
    }
  });

  it('cacheOnly 不查数据源；无缓存时返回空数组', async () => {
    expect(await getFeed({}, { cacheOnly: true })).toEqual([]);

    await getFeed(); // 建立缓存
    const cached = await getFeed({}, { cacheOnly: true });
    expect(cached.length).toBeGreaterThan(0);
  });
});
