import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { Listing } from '../data/types';
import { ConditionBadge } from './Atoms';
import { formatPrice, timeAgo } from '../lib/format';
import { MapPin, ChevronRight, Sparkles } from 'lucide-react-native';

const TINTS = [
  '#E8EEF5', // Nordic Blue tint
  '#F4EFEA', // Sand/Oak tint
  '#EAF2EC', // Forest Sage tint
  '#EFEAF5', // Lavender Grey tint
  '#F6F3E6', // Warm Birch tint
  '#EBEFF5', // Sky Mist tint
];

const isUri = (s?: string) => !!s && (s.startsWith('file:') || s.startsWith('http') || s.startsWith('content:'));

export function ListingCard({
  listing,
  onPress,
  variant = 'grid',
}: {
  listing: Listing;
  onPress?: () => void;
  variant?: 'grid' | 'row';
}) {
  const tint = TINTS[listing.title.length % TINTS.length];
  const first = listing.photos[0];
  const emoji = first && !isUri(first) ? first : '📦';
  const hasDiscount = typeof listing.discount === 'number' && listing.discount > 0;

  const isReference = !!listing.aiMeta?.isReferencePhoto || listing.photos.length === 0;
  const isFullVerified = listing.photos.length >= 5;
  const trustBadge = listing.sellerTrust?.badgeIcon || (listing.seller?.rating && listing.seller.rating >= 4.8 ? '🥇' : null);

  if (variant === 'row') {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, shadows.card, { opacity: pressed ? 0.75 : 1 }]}>
        <View style={[styles.rowThumb, { backgroundColor: tint }]}>
          {isUri(first) ? (
            <Image source={{ uri: first }} style={styles.rowThumb} />
          ) : (
            <View style={styles.emojiBadge}>
              <Text style={{ fontSize: 32 }}>{emoji}</Text>
            </View>
          )}
          {isReference && (
            <View style={styles.refPhotoTagRow}>
              <Text style={styles.refPhotoText}>示意参考图</Text>
            </View>
          )}
        </View>
        <View style={styles.rowBody}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={[typography.subhead, styles.rowTitle, { flex: 1 }]}>{listing.title}</Text>
            {trustBadge && <Text style={{ fontSize: 13 }}>{trustBadge}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Text style={[typography.headline, { color: colors.brand, fontWeight: '700' }]}>{formatPrice(listing.price)}</Text>
            <ConditionBadge condition={listing.condition} />
            {hasDiscount && (
              <View style={styles.discountChip}>
                <Text style={styles.discountText}>降价 {listing.discount}%</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
            <MapPin size={12} color={colors.secondaryLabel} />
            <Text style={[typography.caption, { color: colors.secondaryLabel }]}>
              {listing.location.city} · {timeAgo(listing.createdAt)}
            </Text>
          </View>
        </View>
        <Chevron />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, shadows.card, { opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      <View style={[styles.thumb, { backgroundColor: tint }]}>
        {isUri(first) ? (
          <Image source={{ uri: first }} style={styles.thumbImg} resizeMode="cover" />
        ) : (
          <View style={styles.emojiCircle}>
            <Text style={{ fontSize: 44 }}>{emoji}</Text>
          </View>
        )}
        <View style={styles.thumbBadge}>
          <ConditionBadge condition={listing.condition} />
        </View>
        {isReference ? (
          <View style={styles.refPhotoTag}>
            <Text style={styles.refPhotoText}>官方参考·无实拍</Text>
          </View>
        ) : isFullVerified ? (
          <View style={styles.verifiedTag}>
            <Text style={styles.verifiedText}>5图验真</Text>
          </View>
        ) : null}
        {hasDiscount && (
          <View style={styles.discountBadgeTop}>
            <Sparkles size={10} color="#FFFFFF" />
            <Text style={styles.discountBadgeText}>降 {listing.discount}%</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={2} style={[typography.subhead, styles.cardTitle, { flex: 1 }]}>{listing.title}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={[typography.title3, { color: colors.brand, fontWeight: '800' }]}>{formatPrice(listing.price)}</Text>
          {trustBadge && (
            <View style={styles.trustChip}>
              <Text style={styles.trustChipText}>{trustBadge} 诚信卖家</Text>
            </View>
          )}
        </View>
        <View style={styles.metaRow}>
          <MapPin size={11} color={colors.secondaryLabel} />
          <Text numberOfLines={1} style={[typography.caption, { color: colors.secondaryLabel, flex: 1 }]}>
            {listing.location.city} · {timeAgo(listing.createdAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function Chevron() {
  return <ChevronRight size={18} color={colors.tertiaryLabel} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: radius.lg,
    overflow: 'hidden',
    width: '48.5%',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  thumb: {
    height: 138,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImg: { width: '100%', height: '100%' },
  emojiCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  emojiBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  refPhotoTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    backgroundColor: 'rgba(30, 41, 59, 0.82)',
    paddingVertical: 2,
    borderRadius: radius.xs,
    alignItems: 'center',
  },
  refPhotoTagRow: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    backgroundColor: 'rgba(30, 41, 59, 0.82)',
    paddingVertical: 1,
    borderRadius: 4,
    alignItems: 'center',
  },
  refPhotoText: {
    ...typography.caption2,
    fontSize: 9,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  verifiedTag: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    backgroundColor: colors.condLikeNewBg,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.condLikeNewFg,
  },
  verifiedText: {
    ...typography.caption2,
    fontSize: 9.5,
    color: colors.condLikeNewFg,
    fontWeight: '700',
  },
  trustChip: {
    marginLeft: 6,
    backgroundColor: 'rgba(0,88,163,0.08)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  trustChipText: {
    ...typography.caption2,
    fontSize: 10,
    color: colors.brand,
    fontWeight: '600',
  },
  discountBadgeTop: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  discountBadgeText: {
    ...typography.caption2,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  discountChip: {
    backgroundColor: colors.condFairBg,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  discountText: {
    ...typography.caption2,
    color: colors.condFairFg,
    fontWeight: '600',
  },
  info: { padding: 11 },
  cardTitle: {
    lineHeight: 20,
    color: colors.label,
    minHeight: 40,
  },
  rowTitle: {
    color: colors.label,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: radius.lg,
    padding: 12,
    gap: 12,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  rowThumb: {
    width: 78,
    height: 78,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowBody: { flex: 1 },
});

