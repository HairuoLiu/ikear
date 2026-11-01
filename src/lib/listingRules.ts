/**
 * 发布校验纯逻辑 —— M2 引导式拍照的规则核心。
 *
 * 约束：本文件**不得** import react-native / expo / 任何原生依赖。
 *
 * 规则：硬底 2 张（正面整体 + 细节/标签）满足即可发布；
 * 第 3 张（侧面/抽屉/瑕疵）只是软建议，不阻塞发布；单条最多 9 张。
 */

export const HARD_PHOTO_MIN = 2;
export const SUGGESTED_PHOTO_MIN = 3;
export const MAX_PHOTOS = 9;

export interface PhotoCarrier {
  photos?: string[] | null;
  /** 数据层历史字段名，读取时兼容 */
  images?: string[] | null;
}

export interface PhotoProgress {
  /** 硬底张数 */
  required: number;
  /** 硬底是否满足 */
  met: boolean;
  /** 建议张数 */
  suggested: number;
  /** 建议是否满足 */
  suggestedMet: boolean;
  /** 当前张数（供 UI 显示 n/2、n/3） */
  count: number;
}

export function photoCount(listing?: PhotoCarrier | null): number {
  const arr = listing?.photos ?? listing?.images;
  return Array.isArray(arr) ? arr.length : 0;
}

export function photoProgress(listing?: PhotoCarrier | null): PhotoProgress {
  const count = photoCount(listing);
  return {
    required: HARD_PHOTO_MIN,
    met: count >= HARD_PHOTO_MIN,
    suggested: SUGGESTED_PHOTO_MIN,
    suggestedMet: count >= SUGGESTED_PHOTO_MIN,
    count,
  };
}

/** 可发布：硬底 2 张满足，且不超过 9 张上限；若为官方参考无图模式，满足 1 张参考图即可发布。 */
export function canPublish(
  listing?: (PhotoCarrier & { aiMeta?: { isReferencePhoto?: boolean } }) | null,
  options?: { allowReferencePhoto?: boolean }
): boolean {
  if (options?.allowReferencePhoto || listing?.aiMeta?.isReferencePhoto) {
    const n = photoCount(listing);
    return n >= 1 && n <= MAX_PHOTOS;
  }
  const n = photoCount(listing);
  return n >= HARD_PHOTO_MIN && n <= MAX_PHOTOS;
}

/** 还能不能再加一张（用于置灰「添加照片」按钮）。 */
export function canAddPhoto(listing?: PhotoCarrier | null): boolean {
  return photoCount(listing) < MAX_PHOTOS;
}
