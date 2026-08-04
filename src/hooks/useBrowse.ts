/**
 * useBrowse —— 浏览列表的唯一读取入口（M1）。
 *
 * 把 store 的 listings / location / sort 与纯逻辑 `applyBrowseFilters` 组合起来，
 * UI 只需 `const list = useBrowse('sofa')` 即可拿到「已过滤 + 已排序」的公开挂牌。
 * 纯计算全部在 src/lib/browse.ts，本文件只做状态订阅与记忆化。
 */
import { useMemo } from 'react';
import type { CategoryId } from '../data/types';
import { applyBrowseFilters } from '../lib/browse';
import { useStore } from '../store/useStore';

/**
 * @param category 品类页传入；首页/全部列表不传
 * @param query    搜索框实时输入；不传则用 store.filters.query
 */
export function useBrowse(category?: CategoryId, query?: string) {
  const listings = useStore((s) => s.listings);
  const location = useStore((s) => s.location);
  const sort = useStore((s) => s.sort);
  const storeQuery = useStore((s) => s.filters.query);

  const keyword = query ?? storeQuery;

  return useMemo(
    () => applyBrowseFilters(listings, { category, location, query: keyword, sort }),
    [listings, category, location, keyword, sort]
  );
}
