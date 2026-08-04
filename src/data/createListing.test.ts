// M2 发布契约测试：createListing 必须补全全字段并校验必填项。
import { __resetMockDb, LISTING_TTL_DAYS, mockDataSource } from './dataSource';
import type { CreateListingInput } from './types';

const DAY = 86_400_000;

beforeEach(() => {
  __resetMockDb();
});

// 满足契约的合法输入（含可选字段，用于验证「缺省补全」行为）
const validInput: CreateListingInput = {
  title: 'BEKANT 升降办公桌',
  description: '搬家闲置，升降顺滑。',
  price: 150,
  condition: '良好',
  category: 'desk',
  photos: ['🖥️', '🖥️'],
  location: { city: '多伦多', district: 'North York' },
  sellerId: 'u_me',
  type: 'secondhand',
  coverIndex: 0,
};

describe('createListing 字段补全 (M2)', () => {
  it('expiresAt ≈ now + 30d（允许 ±2s 抖动）', async () => {
    const before = Date.now();
    const created = await mockDataSource.createListing(validInput);
    const after = Date.now();
    const delta = new Date(created.expiresAt).getTime() - after;
    expect(delta).toBeGreaterThan(LISTING_TTL_DAYS * DAY - 2000);
    expect(delta).toBeLessThan(LISTING_TTL_DAYS * DAY + 2000);
  });

  it('status 固定补为 active', async () => {
    const created = await mockDataSource.createListing(validInput);
    expect(created.status).toBe('active');
  });

  it('coverIndex 缺省补为 0', async () => {
    const { coverIndex: _omit, ...rest } = validInput;
    const created = await mockDataSource.createListing(rest);
    expect(created.coverIndex).toBe(0);
  });

  it('type 缺省补为 secondhand', async () => {
    const { type: _omit, ...rest } = validInput;
    const created = await mockDataSource.createListing(rest);
    expect(created.type).toBe('secondhand');
  });

  it('生成 id 与 ISO createdAt', async () => {
    const created = await mockDataSource.createListing(validInput);
    expect(created.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
  });

  it('必填字段被原样持久化到返回的完整 Listing', async () => {
    const created = await mockDataSource.createListing(validInput);
    expect(created.title).toBe(validInput.title);
    expect(created.price).toBe(validInput.price);
    expect(created.category).toBe(validInput.category);
    expect(created.photos).toEqual(validInput.photos);
  });
});

describe('createListing 必填校验 (M2)', () => {
  it('title 为空时抛错', async () => {
    await expect(
      mockDataSource.createListing({ ...validInput, title: '  ' })
    ).rejects.toThrow(/title/);
  });

  it('price 缺失时抛错', async () => {
    await expect(
      mockDataSource.createListing({ ...validInput, price: undefined } as CreateListingInput)
    ).rejects.toThrow(/price/);
  });

  it('category 缺失时抛错', async () => {
    await expect(
      mockDataSource.createListing({ ...validInput, category: undefined } as CreateListingInput)
    ).rejects.toThrow(/category/);
  });

  it('photos 为空数组时抛错', async () => {
    await expect(
      mockDataSource.createListing({ ...validInput, photos: [] })
    ).rejects.toThrow(/photos/);
  });

  it('合法输入不抛错且进入数据源', async () => {
    const created = await mockDataSource.createListing(validInput);
    expect(await mockDataSource.getListing(created.id)).not.toBeNull();
  });
});
