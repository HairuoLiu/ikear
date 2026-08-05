/**
 * M3 — 商品详情屏。
 *
 * 结构（一屏一任务：看货 → 联系卖家）：
 *   照片轮播 → 品类/成色/「可能已失效」灰标 → 标题 → 宜家蓝价格 → 地点与时间
 *   → 卖家卡（Avatar + 昵称 + 查看主页）→ 商品描述 → 「搭配周边」占位卡
 *   → 底部固定栏（收藏 + 联系卖家）
 *
 * 路由参数兼容 { id } 与 { listingId } 两种写法。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Eye, Heart, MapPin, MessageCircle } from 'lucide-react-native';
import {
  Avatar,
  Badge,
  ConditionBadge,
  EmptyState,
  GhostButton,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from '../components';
import { useStore } from '../store/useStore';
import { daysUntilExpiry, isExpired, needsRefreshReminder } from '../lib/expiry';
import { formatPrice, timeAgo } from '../lib/format';
import { getCategory } from '../data/categories';
import { dataSource } from '../data/dataSource';
import type { Listing } from '../data/types';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';

/** 本屏只用 navigate，避免与并行里程碑的 ParamList 定义耦合。 */
type Nav = { navigate: (screen: string, params?: object) => void };

const isUri = (s?: string) =>
  !!s && (s.startsWith('file:') || s.startsWith('http') || s.startsWith('content:'));

export function ListingDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation() as unknown as Nav;
  const { width } = useWindowDimensions();

  const params = (route.params ?? {}) as { id?: string; listingId?: string };
  const listingId = params.id ?? params.listingId ?? '';

  const listing = useStore((s) => s.listings.find((l) => l.id === listingId));
  const favorite = useStore((s) => s.isFavorite(listingId));
  const toggleFavorite = useStore((s) => s.toggleFavorite);

  const [page, setPage] = useState(0);
  const [accessories, setAccessories] = useState<Listing[]>([]);

  // 「搭配周边」占位数据：accessory 类型，仅展示不可交易（M5 商城落地）
  useEffect(() => {
    let alive = true;
    dataSource
      .getListings({ type: 'accessory' })
      .then((rows) => alive && setAccessories(rows.slice(0, 3)))
      .catch(() => alive && setAccessories([]));
    return () => {
      alive = false;
    };
  }, []);

  // 浏览量 +1：fire-and-forget，失败静默（浏览体验不依赖它）。
  // mock 数据源没有该方法，可选调用天然退化为 no-op。
  useEffect(() => {
    if (!listingId) return;
    dataSource.incrementListingViews?.(listingId).catch(() => {
      /* 计数失败不影响浏览 */
    });
  }, [listingId]);

  /** 封面（coverIndex）排到第一张 */
  const photos = useMemo(() => {
    const src = listing?.photos?.length ? listing.photos : listing?.images ?? [];
    const cover = listing?.coverIndex ?? 0;
    if (cover <= 0 || cover >= src.length) return [...src];
    return [src[cover], ...src.filter((_, i) => i !== cover)];
  }, [listing]);

  if (!listing) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState emoji="🔍" title="商品不存在或已下架" message="返回上一页看看其他好物" />
      </Screen>
    );
  }

  const expired = isExpired(listing);
  const expiringSoon = needsRefreshReminder(listing);
  const stale = expired || expiringSoon;
  const staleNote = expired
    ? '该商品已超过展示有效期，卖家可能已售出或未再维护。'
    : `该商品还有 ${Math.max(daysUntilExpiry(listing), 0)} 天到期，建议先与卖家确认。`;

  const category = getCategory(listing.category);
  const seller = listing.seller;
  const sellerId = listing.sellerId ?? listing.seller_id ?? '';
  const slides = photos.length ? photos : ['📦'];

  return (
    <Screen edges={['bottom']} background={colors.background}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ---------------- 照片轮播 ---------------- */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)))
          }
        >
          {slides.map((photo, i) => (
            <View key={`${photo}-${i}`} style={[styles.slide, { width }]}>
              {isUri(photo) ? (
                <Image source={{ uri: photo }} style={styles.slideImage} resizeMode="cover" />
              ) : (
                <Text style={styles.slideEmoji}>{photo}</Text>
              )}
            </View>
          ))}
        </ScrollView>
        {slides.length > 1 && (
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        )}

        <View style={styles.body}>
          {/* ---------------- 成色 / 品类 / 失效灰标 ---------------- */}
          <View style={styles.badgeRow}>
            <ConditionBadge condition={listing.condition} />
            {!!category && <Badge label={`${category.emoji} ${category.name}`} tone="muted" />}
            {stale && <Badge label="可能已失效" tone="muted" />}
          </View>

          <Text style={[typography.title2, styles.title]}>{listing.title}</Text>
          <Text style={styles.price}>{formatPrice(listing.price)}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MapPin size={13} color={colors.secondaryLabel} />
              <Text style={styles.meta}>
                {listing.location?.city ?? listing.city}
                {listing.location?.district ? ` · ${listing.location.district}` : ''}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Eye size={13} color={colors.secondaryLabel} />
              <Text style={styles.meta}>{listing.views ?? 0}</Text>
            </View>
            <Text style={styles.meta}>{timeAgo(listing.createdAt ?? listing.created_at ?? '')}</Text>
          </View>

          {/* 失效仍允许联系，只做灰色提示，不拦截 */}
          {stale && <Text style={styles.staleNote}>{staleNote}</Text>}

          {!!listing.damage_description && (
            <View style={styles.damage}>
              <Text style={[typography.footnote, { color: colors.condWornFg }]}>
                瑕疵说明：{listing.damage_description}
              </Text>
            </View>
          )}

          {/* ---------------- 卖家卡 ---------------- */}
          <Text style={styles.sectionTitle}>卖家</Text>
          <View style={[styles.card, styles.sellerCard]}>
            <Avatar name={seller?.nickname ?? '卖家'} emoji="🧑" size={46} />
            <View style={{ flex: 1 }}>
              <Text style={typography.headline} numberOfLines={1}>
                {seller?.nickname ?? '宜家邻居'}
              </Text>
              <Text style={styles.meta}>
                {seller?.city ?? listing.location?.city ?? ''}
                {seller?.rating ? ` · 评分 ${seller.rating}` : ''}
                {seller?.soldCount ? ` · 成交 ${seller.soldCount}` : ''}
              </Text>
            </View>
            <GhostButton
              title="查看主页"
              fullWidth={false}
              // 卖家主页由 M4「我的」承接，先跳 Profile tab
              onPress={() => navigation.navigate('Main', { screen: 'Profile', params: { sellerId } })}
            />
          </View>

          {/* ---------------- 描述 ---------------- */}
          <Text style={styles.sectionTitle}>商品描述</Text>
          <Text style={styles.description}>{listing.description || '卖家没有填写描述。'}</Text>

          {/* ---------------- 搭配周边（占位，M5 商城） ---------------- */}
          <Text style={styles.sectionTitle}>搭配周边</Text>
          <View style={styles.card}>
            <EmptyState
              emoji="🛍️"
              title="宜家周边配件即将上线"
              message="搬家袋、五金补件、清洁保养 —— 买家具时顺手带走"
              action={
                accessories.length > 0 ? (
                  <View style={styles.accessoryRow}>
                    {accessories.map((a) => (
                      <View key={a.id} style={styles.accessory}>
                        <Text style={styles.accessoryEmoji}>{a.photos?.[0] ?? '📦'}</Text>
                        <Text style={styles.accessoryName} numberOfLines={2}>
                          {a.title}
                        </Text>
                        <Text style={styles.accessoryPrice}>{formatPrice(a.price)}</Text>
                      </View>
                    ))}
                  </View>
                ) : undefined
              }
            />
          </View>
        </View>
      </ScrollView>

      {/* ---------------- 底部固定栏 ---------------- */}
      <View style={styles.bottomBar}>
        <SecondaryButton
          title={favorite ? '已收藏' : '收藏'}
          style={styles.favButton}
          icon={
            <Heart
              size={18}
              color={favorite ? colors.red : colors.label}
              fill={favorite ? colors.red : 'transparent'}
            />
          }
          onPress={() => toggleFavorite(listing.id)}
        />
        <PrimaryButton
          title="联系卖家"
          style={{ flex: 1 }}
          icon={<MessageCircle size={18} color={colors.onBrand} />}
          onPress={() =>
            navigation.navigate('Chat', {
              listingId: listing.id,
              sellerId,
              peerId: sellerId,
            })
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  slide: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.groupedBg,
  },
  slideImage: { width: '100%', height: '100%' },
  slideEmoji: { fontSize: 112 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.md,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gray4 },
  dotActive: { width: 18, backgroundColor: colors.brand },
  body: { paddingHorizontal: spacing.screen, paddingTop: spacing.lg },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  title: { marginTop: spacing.md },
  price: {
    ...typography.title1,
    color: colors.brand, // 宜家蓝仅用于价格与主按钮
    marginTop: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { ...typography.footnote, color: colors.secondaryLabel },
  staleNote: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    backgroundColor: colors.gray6,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  damage: {
    backgroundColor: colors.condWornBg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  sectionTitle: { ...typography.subhead, marginTop: spacing.section, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  description: { ...typography.callout, color: colors.label, lineHeight: 24 },
  accessoryRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  accessory: {
    width: 92,
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.groupedBg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    opacity: 0.75, // 占位：不可点、不可购买
  },
  accessoryEmoji: { fontSize: 26 },
  accessoryName: { ...typography.caption2, color: colors.secondaryLabel, textAlign: 'center' },
  accessoryPrice: { ...typography.caption, color: colors.label, fontWeight: '600' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  favButton: { width: 108 },
});
