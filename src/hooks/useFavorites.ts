/**
 * 收藏列表 hook（M3）—— 把 store.favorites（仅 id）组装成完整 Listing，供 FavoritesScreen 渲染。
 *
 * 收藏的增删仍走 store：useStore(s => s.toggleFavorite) / isFavorite，本 hook 只负责读。
 */
import { useEffect, useState } from 'react';
import { dataSource } from '../data/dataSource';
import type { Listing } from '../data/types';
import { useStore } from '../store/useStore';

export interface UseFavoritesResult {
  /** 已收藏且仍存在的挂牌，顺序与 store.favorites 一致（先收藏的在前）。 */
  listings: Listing[];
  loading: boolean;
}

export function useFavorites(): UseFavoritesResult {
  const favorites = useStore((s) => s.favorites);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(favorites.length > 0);

  useEffect(() => {
    let alive = true;

    if (favorites.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(favorites.map((id) => dataSource.getListing(id)))
      .then((rows) => {
        if (!alive) return;
        // 已被删除的收藏项返回 null，直接过滤掉。
        setListings(rows.filter((l): l is Listing => l != null));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setListings([]);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [favorites]);

  return { listings, loading };
}
