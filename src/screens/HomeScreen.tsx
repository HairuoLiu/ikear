/**
 * 首页「发现」（M1）—— 宜家式浏览入口。
 *
 * 版式（自上而下）：
 *   大标题「发现」 → iOS 圆角搜索框 → 轻量排序条（附近/最新/降价）
 *   → 地点 chip（点开 LocationPicker） → 品类九宫格
 *
 * 状态全部来自 store：`sort` / `setSort`、`location` / `setLocation`、`favorites` / `isFavorite`。
 * 选中品类或输入搜索词后，同屏切换为该品类的商品列表（本屏 state，不新增路由），
 * 点商品卡走父级 Stack 的 `ListingDetail`。
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronDown, ChevronLeft, Heart, MapPin } from 'lucide-react-native';
import {
  Badge,
  CategoryGridTile,
  EmptyState,
  LargeTitleHeader,
  ListingCard,
  PrimaryButton,
  Screen,
  SearchBar,
  SegmentedControl,
} from '../components';
import { useStore } from '../store/useStore';
import type { AppLocation, SortMode } from '../store/useStore';
import { CATEGORIES, getCategory } from '../data/categories';
import type { CategoryId, Listing } from '../data/types';
import type { RootStackParamList } from '../App';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { LocationPicker } from './LocationPicker';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SORT_OPTIONS: { label: string; value: SortMode }[] = [
  { label: '附近', value: 'near' },
  { label: '最新', value: 'new' },
  { label: '降价', value: 'price' },
];

/** 兼容旧字段：M2 发布出来的挂牌目前只写 created_at。 */
const createdMs = (l: Listing) => new Date(l.createdAt ?? l.created_at ?? 0).getTime();

/** 同区 2 分、同城 1 分、其余 0 分。 */
const nearScore = (l: Listing, loc: AppLocation) => {
  const city = l.location?.city;
  const district = l.location?.district;
  if (!loc.city || city !== loc.city) return 0;
  return loc.district && district === loc.district ? 2 : 1;
};

function sortListings(list: Listing[], sort: SortMode, loc: AppLocation): Listing[] {
  const out = [...list];
  if (sort === 'near') {
    return out.sort(
      (a, b) => nearScore(b, loc) - nearScore(a, loc) || createdMs(b) - createdMs(a)
    );
  }
  if (sort === 'price') {
    // 降价：有降价记录的排前，其次价格由低到高
    return out.sort(
      (a, b) => Number(!!b.discount) - Number(!!a.discount) || a.price - b.price
    );
  }
  return out.sort((a, b) => createdMs(b) - createdMs(a));
}

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const listings = useStore((s) => s.listings);
  const location = useStore((s) => s.location);
  const sort = useStore((s) => s.sort);
  const setSort = useStore((s) => s.setSort);
  const favorites = useStore((s) => s.favorites);
  const isFavorite = useStore((s) => s.isFavorite);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** 首页在 Tab 内，详情/发布挂在父级 Stack 上。 */
  const rootNav = () => navigation.getParent<Nav>() ?? navigation;

  const keyword = query.trim().toLowerCase();
  const browsing = !!category || keyword.length > 0;

  const results = useMemo(() => {
    const base = listings.filter((l) => l.status === 'active' && l.type !== 'accessory');
    const hit = base.filter(
      (l) =>
        (!category || l.category === category) &&
        (!keyword ||
          l.title.toLowerCase().includes(keyword) ||
          (l.description ?? '').toLowerCase().includes(keyword))
    );
    return sortListings(hit, sort, location);
  }, [listings, category, keyword, sort, location]);

  const favCount = useMemo(
    () => results.filter((l) => isFavorite(l.id)).length,
    // favorites 变化时重算收藏计数
    [results, isFavorite, favorites]
  );

  const meta = getCategory(category);
  const locationLabel = location.city
    ? location.district
      ? `${location.city} · ${location.district}`
      : location.city
    : '选择地点';

  return (
    <Screen scroll>
      <LargeTitleHeader
        title="发现"
        subtitle={browsing ? undefined : '宜家好物，就在附近'}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="我的收藏"
            onPress={() => rootNav().navigate('Favorites')}
            style={({ pressed }) => [styles.favBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Heart size={20} color={colors.label} />
            {favorites.length > 0 && (
              <Badge label={favorites.length} count style={styles.favBadge} />
            )}
          </Pressable>
        }
      />

      <View style={styles.controls}>
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="搜索沙发、书桌、收纳…"
        />

        <SegmentedControl
          options={SORT_OPTIONS}
          value={sort}
          onChange={setSort}
          style={styles.sortBar}
        />

        <View style={styles.locationRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`当前地点 ${locationLabel}`}
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.6 : 1 }]}
          >
            <MapPin size={14} color={location.city ? colors.brand : colors.secondaryLabel} />
            <Text
              numberOfLines={1}
              style={[
                typography.footnote,
                { color: location.city ? colors.label : colors.secondaryLabel },
              ]}
            >
              {locationLabel}
            </Text>
            <ChevronDown size={14} color={colors.secondaryLabel} />
          </Pressable>
        </View>
      </View>

      {browsing ? (
        <>
          <View style={styles.resultHead}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回全部品类"
              onPress={() => {
                setCategory(null);
                setQuery('');
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <ChevronLeft size={20} color={colors.brand} />
            </Pressable>
            <Text numberOfLines={1} style={[typography.title3, styles.resultTitle]}>
              {meta ? `${meta.emoji} ${meta.name}` : `「${query.trim()}」`}
            </Text>
            <Text style={styles.count}>
              {results.length} 件{favCount > 0 ? ` · 收藏 ${favCount}` : ''}
            </Text>
          </View>

          {results.length > 0 ? (
            <View style={styles.listGrid}>
              {results.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  onPress={() => rootNav().navigate('ListingDetail', { id: l.id })}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              emoji="🪑"
              title="这里还没有好物"
              message="换个品类或地点看看，也可以把家里的闲置发布出来。"
              action={
                <PrimaryButton
                  title="发布闲置"
                  fullWidth={false}
                  onPress={() => rootNav().navigate('CreateListing')}
                />
              }
            />
          )}
        </>
      ) : (
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((c) => (
            <CategoryGridTile
              key={c.id}
              icon={c.emoji}
              name={c.name}
              width="31.5%"
              onPress={() => setCategory(c.id)}
            />
          ))}
        </View>
      )}

      <LocationPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: spacing.screen,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sortBar: { marginTop: spacing.xs },
  locationRow: { flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBg,
  },
  favBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favBadge: { position: 'absolute', top: -2, right: -4 },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
    paddingHorizontal: spacing.screen,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.screen,
    marginBottom: spacing.md,
  },
  backBtn: { marginLeft: -4 },
  resultTitle: { flex: 1 },
  count: { ...typography.footnote, color: colors.secondaryLabel },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screen,
  },
});
