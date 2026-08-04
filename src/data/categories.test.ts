import {
  CATEGORIES,
  CATEGORY_IDS,
  getCategory,
  getCategoryLabel,
  isCategoryId,
} from './categories';

describe('categories taxonomy', () => {
  it('至少包含 12 个品类且 id 唯一', () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(CATEGORY_IDS).size).toBe(CATEGORIES.length);
  });

  it('每个品类都有中文名和 emoji', () => {
    for (const c of CATEGORIES) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.emoji.length).toBeGreaterThan(0);
    }
  });

  it('getCategory 命中已知品类', () => {
    expect(getCategory('sofa')).toEqual({ id: 'sofa', name: '沙发', emoji: '🛋️' });
    expect(getCategory('wardrobe')?.name).toBe('衣柜');
  });

  it('getCategory 未命中返回 undefined', () => {
    expect(getCategory('spaceship')).toBeUndefined();
    expect(getCategory('')).toBeUndefined();
    expect(getCategory(null)).toBeUndefined();
    expect(getCategory(undefined)).toBeUndefined();
  });

  it('getCategoryLabel 未命中回落到「其他」', () => {
    expect(getCategoryLabel('bed')).toBe('🛏️ 床与床垫');
    expect(getCategoryLabel('nope')).toBe('✨ 其他');
  });

  it('isCategoryId 做类型守卫', () => {
    expect(isCategoryId('kitchen')).toBe(true);
    expect(isCategoryId('kitchenware')).toBe(false);
  });
});
