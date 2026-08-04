import {
  HARD_PHOTO_MIN,
  MAX_PHOTOS,
  SUGGESTED_PHOTO_MIN,
  canAddPhoto,
  canPublish,
  photoCount,
  photoProgress,
} from './listingRules';

const withPhotos = (n: number) => ({
  photos: Array.from({ length: n }, (_, i) => `file://photo-${i}.jpg`),
});

describe('常量', () => {
  it('硬底 2 张 / 建议 3 张 / 上限 9 张', () => {
    expect(HARD_PHOTO_MIN).toBe(2);
    expect(SUGGESTED_PHOTO_MIN).toBe(3);
    expect(MAX_PHOTOS).toBe(9);
  });
});

describe('photoCount', () => {
  it('读 photos 字段', () => {
    expect(photoCount(withPhotos(4))).toBe(4);
  });

  it('兼容数据层的 images 字段', () => {
    expect(photoCount({ images: ['🛏️', '🛏️'] })).toBe(2);
  });

  it('空/未定义安全返回 0', () => {
    expect(photoCount(null)).toBe(0);
    expect(photoCount(undefined)).toBe(0);
    expect(photoCount({})).toBe(0);
    expect(photoCount({ photos: null })).toBe(0);
  });
});

describe('photoProgress', () => {
  it('0 张：硬底与建议都未达成', () => {
    expect(photoProgress(withPhotos(0))).toEqual({
      required: 2,
      met: false,
      suggested: 3,
      suggestedMet: false,
      count: 0,
    });
  });

  it('1 张：硬底未达成 —— 边界', () => {
    const p = photoProgress(withPhotos(1));
    expect(p.met).toBe(false);
    expect(p.count).toBe(1);
  });

  it('2 张：硬底达成，建议未达成', () => {
    expect(photoProgress(withPhotos(2))).toEqual({
      required: 2,
      met: true,
      suggested: 3,
      suggestedMet: false,
      count: 2,
    });
  });

  it('3 张：硬底与建议都达成', () => {
    const p = photoProgress(withPhotos(3));
    expect(p.met).toBe(true);
    expect(p.suggestedMet).toBe(true);
  });
});

describe('canPublish', () => {
  it('0 张不可发布', () => {
    expect(canPublish(withPhotos(0))).toBe(false);
  });

  it('硬底不足（1 张）不可发布', () => {
    expect(canPublish(withPhotos(1))).toBe(false);
  });

  it('刚好 2 张即可发布 —— 硬底边界', () => {
    expect(canPublish(withPhotos(2))).toBe(true);
  });

  it('建议未满（2 张）不阻塞发布', () => {
    const p = photoProgress(withPhotos(2));
    expect(p.suggestedMet).toBe(false);
    expect(canPublish(withPhotos(2))).toBe(true);
  });

  it('9 张仍可发布 —— 上限边界', () => {
    expect(canPublish(withPhotos(9))).toBe(true);
  });

  it('超过 9 张不可发布', () => {
    expect(canPublish(withPhotos(10))).toBe(false);
  });

  it('空对象不可发布', () => {
    expect(canPublish({})).toBe(false);
    expect(canPublish(null)).toBe(false);
  });
});

describe('canAddPhoto', () => {
  it('8 张时还能再加', () => {
    expect(canAddPhoto(withPhotos(8))).toBe(true);
  });

  it('9 张时不能再加 —— 上限边界', () => {
    expect(canAddPhoto(withPhotos(9))).toBe(false);
  });
});
