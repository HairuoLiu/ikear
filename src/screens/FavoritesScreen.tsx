/**
 * M3 — 收藏。
 *
 * store.favorites（listing id 数组，已离线持久化）→ 过滤 store.listings → 两列网格。
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { EmptyState, GhostButton, ListingCard, Screen } from '../components';
import { useStore } from '../store/useStore';
import { isExpired } from '../lib/expiry';
import type { Listing } from '../data/types';
import { colors, spacing, typography } from '../theme/tokens';

type Nav = { navigate: (screen: string, params?: object) => void };

export function FavoritesScreen() {
  const navigation = useNavigation() as unknown as Nav;
  const favorites = useStore((s) => s.favorites);
  const listings = useStore((s) => s.listings);

  /** 最近收藏的排在前面；StoreListing 只是多了生命周期字段，展示层按 Listing 读。 */
  const items = useMemo<Listing[]>(
    () =>
      [...favorites]
        .reverse()
        .map((id) => listings.find((l) => l.id === id))
        .filter((l): l is Listing => !!l)
        .map((l) => l as unknown as Listing),
    [favorites, listings]
  );

  const staleCount = items.filter((l) => isExpired(l)).length;

  return (
    <Screen edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {items.length === 0 ? (
          <EmptyState
            emoji="🤍"
            title="还没有收藏"
            message="在商品详情点「收藏」，心仪的家具就会出现在这里"
            action={
              <GhostButton
                title="去逛逛"
                fullWidth={false}
                onPress={() => navigation.navigate('Main', { screen: 'Home' })}
              />
            }
          />
        ) : (
          <>
            <Text style={styles.summary}>
              {items.length} 件收藏
              {staleCount > 0 ? ` · ${staleCount} 件可能已失效` : ''}
            </Text>
            <View style={styles.grid}>
              {items.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  onPress={() => navigation.navigate('ListingDetail', { id: listing.id })}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screen, paddingBottom: spacing.xxl },
  summary: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
