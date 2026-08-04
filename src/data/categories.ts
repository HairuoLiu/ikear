// 宜家品类 taxonomy —— 纯函数模块，不依赖 React Native，可在 node/jest 下直接测试。
import type { CategoryId, CategoryMeta } from './types';

export const CATEGORIES: CategoryMeta[] = [
  { id: 'sofa', name: '沙发', emoji: '🛋️' },
  { id: 'chair', name: '座椅', emoji: '🪑' },
  { id: 'bed', name: '床与床垫', emoji: '🛏️' },
  { id: 'table', name: '餐桌椅', emoji: '🍽️' },
  { id: 'desk', name: '办公书桌', emoji: '🖥️' },
  { id: 'lighting', name: '照明', emoji: '💡' },
  { id: 'storage', name: '收纳储物', emoji: '📦' },
  { id: 'wardrobe', name: '衣柜', emoji: '🚪' },
  { id: 'kitchen', name: '厨房餐厨', emoji: '🍳' },
  { id: 'bath', name: '浴室', emoji: '🚿' },
  { id: 'kids', name: '儿童', emoji: '🧸' },
  { id: 'textile', name: '纺织品软装', emoji: '🧵' },
  { id: 'decor', name: '装饰小物', emoji: '🖼️' },
  { id: 'outdoor', name: '户外', emoji: '🌿' },
  { id: 'other', name: '其他', emoji: '✨' },
];

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

const BY_ID: Record<string, CategoryMeta> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<string, CategoryMeta>
);

/** 未命中返回 undefined，调用方自行 fallback 到 'other'。 */
export function getCategory(id: string | null | undefined): CategoryMeta | undefined {
  if (!id) return undefined;
  return BY_ID[id];
}

/** 展示用：拿不到品类时回落到「其他」。 */
export function getCategoryLabel(id: string | null | undefined): string {
  const meta = getCategory(id);
  return meta ? `${meta.emoji} ${meta.name}` : '✨ 其他';
}

export function isCategoryId(id: string): id is CategoryId {
  return id in BY_ID;
}
