import type { Listing, ListingStatus } from '../data/types';
import {
  DEFAULT_SORT,
  SORT_MODES,
  applyBrowseFilters,
  isPubliclyVisible,
  sortLabel,
} from './browse';

const NOW = new Date('2026-06-01T12:00:00.000Z').getTime();
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();
const daysAhead = (d: number) => new Date(NOW + d * DAY).toISOString();

/** 造一条 canonical 挂牌（默认 active、未过期） */
function makeListing(patch: Partial<Listing> & { id: string }): Listing {
  return {
    title: '宜家家具',
    description: '',
    price: 100,
    condition: '良好',
    category: 'sofa',
    photos: ['🛋️'],
    coverIndex: 0,
    location: { city: '多伦多' },
    sellerId: 'u_1',
    createdAt: daysAgo(1),
    expiresAt: daysAhead(29),
    status: 'active',
    type: 'secondhand',
    ...patch,
  };
}

const ids = (list: { id: string }[]) => list.map((l) => l.id);

// l_bed  床  多伦多/North York  ¥300  3 天前
// l_sofa 沙发 万锦/Unionville   ¥180  1 天前
// l_desk 书桌 多伦多/Downtown   ¥ 90 10 天前
const LISTINGS: Listing[] = [
  makeListing({
    id: 'l_bed',
    title: 'MALM 双人床架',
    category: 'bed',
    price: 300,
    createdAt: daysAgo(3),
    location: { city: '多伦多', district: 'North York' },
  }),
  makeListing({
    id: 'l_sofa',
    title: 'KIVIK 三人沙发',
    category: 'sofa',
    price: 180,
    createdAt: daysAgo(1),
    location: { city: '万锦', district: 'Unionville' },
  }),
  makeListing({
    id: 'l_desk',
    title: 'MICKE 白色书桌 desk',
    category: 'desk',
    price: 90,
    createdAt: daysAgo(10),
    location: { city: '多伦多', district: 'Downtown' },
  }),
];

describe('applyBrowseFilters —— 分类过滤', () => {
  it('只返回指定品类', () => {
    expect(ids(applyBrowseFilters(LISTINGS, { category: 'bed' }, NOW))).toEqual(['l_bed']);
  });

  it('不传 category 时返回全部公开挂牌', () => {
    expect(applyBrowseFilters(LISTINGS, {}, NOW)).toHaveLength(3);
  });

  it('无命中品类返回空数组', () => {
    expect(applyBrowseFilters(LISTINGS, { category: 'outdoor' }, NOW)).toEqual([]);
  });
});

describe('applyBrowseFilters —— 地点过滤', () => {
  it('按城市过滤', () => {
    expect(ids(applyBrowseFilters(LISTINGS, { location: { city: '多伦多' } }, NOW))).toEqual([
      'l_bed',
      'l_desk',
    ]);
  });

  it('城市 + 区二级收窄', () => {
    expect(
      ids(applyBrowseFilters(LISTINGS, { location: { city: '多伦多', district: 'North York' } }, NOW))
    ).toEqual(['l_bed']);
  });

  it('区大小写/空格不敏感', () => {
    expect(
      ids(applyBrowseFilters(LISTINGS, { location: { district: ' north york ' } }, NOW))
    ).toEqual(['l_bed']);
  });

  it('空 location（store 初始值）不过滤', () => {
    expect(applyBrowseFilters(LISTINGS, { location: {} }, NOW)).toHaveLength(3);
  });

  it('兼容 legacy 扁平 city 字段', () => {
    const legacy = [
      makeListing({ id: 'l_legacy', location: undefined as never, city: '万锦' }),
    ];
    expect(ids(applyBrowseFilters(legacy, { location: { city: '万锦' } }, NOW))).toEqual([
      'l_legacy',
    ]);
  });
});

describe('applyBrowseFilters —— query 模糊匹配', () => {
  it('匹配标题子串', () => {
    expect(ids(applyBrowseFilters(LISTINGS, { query: '沙发' }, NOW))).toEqual(['l_sofa']);
  });

  it('英文大小写不敏感、首尾空格忽略', () => {
    expect(ids(applyBrowseFilters(LISTINGS, { query: '  DESK ' }, NOW))).toEqual(['l_desk']);
  });

  it('空 query 视为不过滤', () => {
    expect(applyBrowseFilters(LISTINGS, { query: '   ' }, NOW)).toHaveLength(3);
  });

  it('可与分类叠加（交集）', () => {
    expect(applyBrowseFilters(LISTINGS, { query: '沙发', category: 'bed' }, NOW)).toEqual([]);
  });
});

describe('applyBrowseFilters —— 排序', () => {
  it("'new'：createdAt 降序", () => {
    expect(ids(applyBrowseFilters(LISTINGS, { sort: 'new' }, NOW))).toEqual([
      'l_sofa',
      'l_bed',
      'l_desk',
    ]);
  });

  it("'price'：price 升序", () => {
    expect(ids(applyBrowseFilters(LISTINGS, { sort: 'price' }, NOW))).toEqual([
      'l_desk',
      'l_sofa',
      'l_bed',
    ]);
  });

  it("'near'：占位实现，暂与 'new' 一致", () => {
    expect(ids(applyBrowseFilters(LISTINGS, { sort: 'near' }, NOW))).toEqual(
      ids(applyBrowseFilters(LISTINGS, { sort: 'new' }, NOW))
    );
  });

  it('缺省 sort 走「最新」', () => {
    expect(ids(applyBrowseFilters(LISTINGS, {}, NOW))).toEqual(
      ids(applyBrowseFilters(LISTINGS, { sort: DEFAULT_SORT }, NOW))
    );
  });

  it('排序兼容 legacy created_at', () => {
    const legacy = [
      makeListing({ id: 'l_old', createdAt: undefined as never, created_at: daysAgo(20) }),
      makeListing({ id: 'l_new', createdAt: undefined as never, created_at: daysAgo(2) }),
    ];
    expect(ids(applyBrowseFilters(legacy, { sort: 'new' }, NOW))).toEqual(['l_new', 'l_old']);
  });

  it('不修改入参数组', () => {
    const before = ids(LISTINGS);
    applyBrowseFilters(LISTINGS, { sort: 'price' }, NOW);
    expect(ids(LISTINGS)).toEqual(before);
  });
});

describe('公开可见性 —— 非 active 一律不进公开市场', () => {
  const withStatus = (status: ListingStatus, id = 'l_x') => makeListing({ id, status });

  it.each<ListingStatus>(['expired', 'sold', 'archived'])('过滤掉 status=%s 的挂牌', (status) => {
    expect(applyBrowseFilters([withStatus(status)], {}, NOW)).toEqual([]);
  });

  it('保留 active 挂牌', () => {
    expect(ids(applyBrowseFilters([withStatus('active')], {}, NOW))).toEqual(['l_x']);
  });

  it('status 仍为 active 但 TTL 已过（过期扫描未跑）同样隐藏', () => {
    const zombie = makeListing({ id: 'l_zombie', expiresAt: daysAgo(2) });
    expect(applyBrowseFilters([zombie], {}, NOW)).toEqual([]);
    expect(isPubliclyVisible(zombie, NOW)).toBe(false);
  });

  it('混合列表中只留下 active 且未过期的', () => {
    const mixed = [
      ...LISTINGS,
      makeListing({ id: 'l_sold', status: 'sold' }),
      makeListing({ id: 'l_expired', status: 'expired', expiresAt: daysAgo(1) }),
      makeListing({ id: 'l_archived', status: 'archived' }),
    ];
    expect(ids(applyBrowseFilters(mixed, { sort: 'new' }, NOW))).toEqual([
      'l_sofa',
      'l_bed',
      'l_desk',
    ]);
  });

  it('缺省 status 视为 active（草稿发布链路兜底）', () => {
    const noStatus = makeListing({ id: 'l_nostatus', status: undefined as never });
    expect(ids(applyBrowseFilters([noStatus], {}, NOW))).toEqual(['l_nostatus']);
  });
});

describe('sortLabel', () => {
  it('三种排序返回中文标签', () => {
    expect(sortLabel('near')).toBe('附近');
    expect(sortLabel('new')).toBe('最新');
    expect(sortLabel('price')).toBe('降价');
  });

  it('SORT_MODES 覆盖全部排序且都有标签', () => {
    expect(SORT_MODES).toEqual(['near', 'new', 'price']);
    SORT_MODES.forEach((m) => expect(sortLabel(m)).toBeTruthy());
  });

  it('非法持久化值回落到「最新」', () => {
    expect(sortLabel('hot' as never)).toBe('最新');
  });
});
