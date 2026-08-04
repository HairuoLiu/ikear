import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { Listing } from '../data/types';
import { ConditionBadge } from './Atoms';
import { formatPrice, timeAgo } from '../lib/format';
import { MapPin, ChevronRight } from 'lucide-react-native';

const TINTS = ['#EAF2FB', '#FBF1E8', '#EAF7ED', '#F6EAFB', '#FBFAEA', '#EAEFFB'];
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

  if (variant === 'row') {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.rowThumb, { backgroundColor: tint }]}>
          {isUri(first) ? (
            <Image source={{ uri: first }} style={styles.rowThumb} />
          ) : (
            <Text style={{ fontSize: 30 }}>{emoji}</Text>
          )}
        </View>
        <View style={styles.rowBody}>
          <Text numberOfLines={1} style={[typography.subhead]}>{listing.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Text style={[typography.headline, { color: colors.blue }]}>{formatPrice(listing.price)}</Text>
            <ConditionBadge condition={listing.condition} />
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
      style={({ pressed }) => [styles.card, shadows.card, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.thumb, { backgroundColor: tint }]}>
        {isUri(first) ? (
          <Image source={{ uri: first }} style={styles.thumbImg} />
        ) : (
          <Text style={{ fontSize: 46 }}>{emoji}</Text>
        )}
        <View style={styles.thumbBadge}>
          <ConditionBadge condition={listing.condition} />
        </View>
      </View>
      <View style={styles.info}>
        <Text numberOfLines={2} style={[typography.subhead]}>{listing.title}</Text>
        <View style={styles.priceRow}>
          <Text style={[typography.title3, { color: colors.blue }]}>{formatPrice(listing.price)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
          <MapPin size={12} color={colors.secondaryLabel} />
          <Text numberOfLines={1} style={[typography.caption, { color: colors.secondaryLabel }]}>
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
    borderRadius: radius.md,
    overflow: 'hidden',
    width: '48.5%',
    marginBottom: spacing.md,
  },
  thumb: {
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  info: { padding: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: radius.md,
    padding: 12,
    gap: 12,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  rowThumb: {
    width: 76,
    height: 76,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
});
