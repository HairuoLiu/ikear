/**
 * M2 发布流程的**纯逻辑**单测：不 import react / react-native / zustand，
 * 只 import listingRules 的真实函数，可在任意 node 环境直接跑。
 *
 * 下面两个 reducer 是 useStore 的 addDraftPhoto / removeDraftPhoto 与
 * useCreateListing 的 addPhoto / removePhoto 的等价镜像（去掉 set/persist 的副作用），
 * 判定点全部复用 listingRules，保证测的是同一套规则。
 */
import {
  HARD_PHOTO_MIN,
  MAX_PHOTOS,
  canAddPhoto,
  canPublish,
  photoProgress,
} from './listingRules';

interface DraftShape {
  photos: string[];
  coverIndex: number;
}

const draftOf = (n: number, coverIndex = 0): DraftShape => ({
  photos: Array.from({ length: n }, (_, i) => `file://p${i}.jpg`),
  coverIndex,
});

/** 等价于 hook 的 addPhoto：超上限拒绝，返回是否成功 */
function addPhoto(d: DraftShape, uri: string): { draft: DraftShape; ok: boolean } {
  if (!canAddPhoto(d)) return { draft: d, ok: false };
  return { draft: { ...d, photos: [...d.photos, uri] }, ok: true };
}

/** 等价于 store 的 removeDraftPhoto：删除并修正封面下标 */
function removePhoto(d: DraftShape, i: number): DraftShape {
  if (i < 0 || i >= d.photos.length) return d;
  const photos = d.photos.filter((_, idx) => idx !== i);
  let coverIndex = d.coverIndex;
  if (i === coverIndex) coverIndex = 0;
  else if (i < coverIndex) coverIndex -= 1;
  return { ...d, photos, coverIndex: Math.min(coverIndex, Math.max(photos.length - 1, 0)) };
}

describe('addPhoto —— 9 张上限', () => {
  it('8 张时可继续添加', () => {
    const r = addPhoto(draftOf(8), 'file://new.jpg');
    expect(r.ok).toBe(true);
    expect(r.draft.photos.length).toBe(9);
  });

  it('第 10 张被拒绝，返回 false 且照片数不变 —— 上限边界', () => {
    const r = addPhoto(draftOf(MAX_PHOTOS), 'file://new.jpg');
    expect(r.ok).toBe(false);
    expect(r.draft.photos.length).toBe(9);
  });

  it('连续加 12 张：前 9 张成功、后 3 张全被拒', () => {
    let d = draftOf(0);
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < 12; i++) {
      const r = addPhoto(d, `file://batch-${i}.jpg`);
      d = r.draft;
      if (r.ok) accepted++;
      else rejected++;
    }
    expect(accepted).toBe(9);
    expect(rejected).toBe(3);
    expect(d.photos.length).toBe(MAX_PHOTOS);
  });

  it('拒绝后不影响已达标的发布态', () => {
    const r = addPhoto(draftOf(MAX_PHOTOS), 'file://new.jpg');
    expect(canPublish(r.draft)).toBe(true);
  });
});

describe('removePhoto —— 封面修正', () => {
  it('删掉封面本身：封面回退到第 0 张', () => {
    const d = removePhoto(draftOf(4, 2), 2);
    expect(d.photos.length).toBe(3);
    expect(d.coverIndex).toBe(0);
  });

  it('删掉封面之前的一张：封面下标 -1，仍指向同一张图', () => {
    const before = draftOf(4, 2);
    const coverUri = before.photos[2];
    const d = removePhoto(before, 0);
    expect(d.coverIndex).toBe(1);
    expect(d.photos[d.coverIndex]).toBe(coverUri);
  });

  it('删掉封面之后的一张：封面下标不变', () => {
    const before = draftOf(4, 1);
    const coverUri = before.photos[1];
    const d = removePhoto(before, 3);
    expect(d.coverIndex).toBe(1);
    expect(d.photos[d.coverIndex]).toBe(coverUri);
  });

  it('删到只剩 1 张：封面被夹到 0', () => {
    const d = removePhoto(draftOf(2, 1), 1);
    expect(d.photos.length).toBe(1);
    expect(d.coverIndex).toBe(0);
  });

  it('删空：封面为 0，不会出现 -1', () => {
    const d = removePhoto(draftOf(1, 0), 0);
    expect(d.photos.length).toBe(0);
    expect(d.coverIndex).toBe(0);
  });

  it('越界下标：原样返回，不动封面', () => {
    expect(removePhoto(draftOf(3, 2), 5).coverIndex).toBe(2);
    expect(removePhoto(draftOf(3, 2), -1).photos.length).toBe(3);
  });

  it('封面下标始终落在 photos 范围内 —— 逐张删不变式', () => {
    let d = draftOf(5, 4);
    while (d.photos.length > 0) {
      d = removePhoto(d, 0);
      const inRange = d.coverIndex >= 0 && d.coverIndex <= Math.max(d.photos.length - 1, 0);
      expect(inRange).toBe(true);
    }
  });
});

describe('canPublish —— 硬底 2 张', () => {
  it('0 张：硬底不足，不可发布', () => {
    expect(canPublish(draftOf(0))).toBe(false);
  });

  it('1 张：硬底不足，不可发布 —— 下边界', () => {
    expect(canPublish(draftOf(1))).toBe(false);
  });

  it('2 张：硬底刚好满足，可发布', () => {
    expect(canPublish(draftOf(HARD_PHOTO_MIN))).toBe(true);
  });

  it('2 张时软建议未满，但不阻塞发布', () => {
    const p = photoProgress(draftOf(2));
    expect(p.met).toBe(true);
    expect(p.suggestedMet).toBe(false);
    expect(canPublish(draftOf(2))).toBe(true);
  });

  it('9 张：仍可发布 —— 上边界', () => {
    expect(canPublish(draftOf(MAX_PHOTOS))).toBe(true);
  });

  it('删照片跌破硬底后发布态回落到 false', () => {
    const d = removePhoto(draftOf(2, 0), 0);
    expect(d.photos.length).toBe(1);
    expect(canPublish(d)).toBe(false);
  });

  it('补拍到 2 张后发布态恢复 true', () => {
    const d = addPhoto(draftOf(1), 'file://second.jpg').draft;
    expect(canPublish(d)).toBe(true);
  });
});
