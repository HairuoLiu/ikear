/**
 * IKEAR「综合管理 Hub / 我的」屏 —— 极简 5 屏核心枢纽。
 *
 * 整合三大高频模块：
 *   1. 📦 [在售管理]：商品生命周期、一键刷新赠 24h 曝光、降价重上架、卖家诚信等级徽章；
 *   2. 💬 [议价消息]：买卖家即时协商、未读消息汇聚、直达 1v1 聊天；
 *   3. ⚙️ [偏好设置]：支持 9 大主流语言无缝热切换（简中/繁中/英/法/西/日/韩/德/瑞典）、Face ID 生物锁。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Avatar,
  Badge,
  EmptyState,
  GhostButton,
  LargeTitleHeader,
  ListRow,
  ListSection,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SegmentedControl,
  Sheet,
  Tag,
} from '../components';
import type { BadgeTone } from '../components';
import { useStore } from '../store/useStore';
import {
  HOUR_MS,
  REFRESH_REMINDER_DAYS,
  TTL_DAYS,
  daysUntilExpiry,
  isExpired,
  needsRefreshReminder,
} from '../lib/expiry';
import { authenticate, getBiometricSupport } from '../lib/biometrics';
import { clockTime, formatPrice } from '../lib/format';
import { getCategory } from '../data/categories';
import type { Listing, Message } from '../data/types';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import {
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  t,
} from '../lib/i18n';
import { getTrustProfile } from '../lib/aiEstimate';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Clock,
  Fingerprint,
  Globe,
  Heart,
  Info,
  LogOut,
  MessageCircle,
  Package,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
} from 'lucide-react-native';

/* ------------------------------------------------------------------ 展示口径 */

type Bucket = 'active' | 'expired' | 'sold' | 'archived';
type HubSection = 'listings' | 'messages' | 'settings';

const BUCKET_META: Record<Bucket, { label: string; badge: string; tone: BadgeTone }> = {
  active: { label: '在售', badge: '在售', tone: 'success' },
  expired: { label: '已过期', badge: '已过期', tone: 'danger' },
  sold: { label: '已售', badge: '已售出', tone: 'muted' },
  archived: { label: '归档', badge: '已下架', tone: 'muted' },
};

const BUCKET_ORDER: Bucket[] = ['active', 'expired', 'sold', 'archived'];

function bucketOf(l: Listing, now: number): Bucket {
  if (l.status === 'sold') return 'sold';
  if (l.status === 'archived') return 'archived';
  return isExpired(l, now) ? 'expired' : 'active';
}

function boostLeftHours(l: Listing, now: number): number | null {
  if (!l.boostedUntil) return null;
  const left = new Date(l.boostedUntil).getTime() - now;
  return left > 0 ? Math.max(1, Math.ceil(left / HOUR_MS)) : null;
}

function discountLabel(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw > 0 ? `降价 ${raw}%` : null;
  if (typeof raw === 'object') {
    const d = raw as { from?: number; to?: number };
    if (typeof d.from === 'number' && typeof d.to === 'number' && d.from > d.to) {
      return `降价 ${formatPrice(d.from - d.to)}`;
    }
    return '降价';
  }
  return null;
}

function coverOf(l: Listing): string {
  const photos = l.photos ?? [];
  return photos[l.coverIndex ?? 0] ?? photos[0] ?? getCategory(l.category)?.emoji ?? '🪑';
}

function expiryText(l: Listing, bucket: Bucket, now: number): string {
  const days = daysUntilExpiry(l, now);
  if (!Number.isFinite(days)) return '长期有效';
  if (bucket === 'sold') return '已成交';
  if (bucket === 'archived') return '已下架，可降价重上架';
  if (bucket === 'expired') return `已过期 ${Math.abs(days)} 天`;
  return days <= 0 ? '今天到期' : `剩 ${days} 天到期`;
}

function threadTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? clockTime(iso) : `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ------------------------------------------------------------------ 我的发布卡片 */

interface ListingItemProps {
  listing: Listing;
  now: number;
  bucket: Bucket;
  flash?: string;
  onOpen: () => void;
  onRefresh: () => void;
  onDiscount: () => void;
  onSold: () => void;
  onArchive: () => void;
}

function ListingItem({
  listing,
  now,
  bucket,
  flash,
  onOpen,
  onRefresh,
  onDiscount,
  onSold,
  onArchive,
}: ListingItemProps) {
  const meta = BUCKET_META[bucket];
  const soon = bucket === 'active' && needsRefreshReminder(listing, now);
  const boost = boostLeftHours(listing, now);
  const cut = discountLabel(listing.discount);
  const dim = bucket === 'sold' || bucket === 'archived';

  return (
    <View style={[styles.card, shadows.card]}>
      <Pressable style={styles.cardHead} onPress={onOpen}>
        <View style={[styles.cover, dim && { opacity: 0.45 }]}>
          <Text style={styles.coverEmoji}>{coverOf(listing)}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={[typography.subhead, dim && { color: colors.secondaryLabel }]}>
            {listing.title}
          </Text>

          <Text style={[typography.headline, { color: colors.label, marginTop: 4 }]}>
            {formatPrice(listing.price)}
          </Text>

          <View style={styles.badgeRow}>
            <Badge label={meta.badge} tone={meta.tone} />
            {soon && <Badge label="可刷新" tone="warning" />}
            {boost !== null && <Badge label={`曝光中 · 剩 ${boost}h`} tone="brand" />}
            {!!cut && <Badge label={cut} tone="danger" />}
          </View>

          <View style={styles.metaRow}>
            <Clock size={12} color={colors.secondaryLabel} />
            <Text style={styles.metaText}>{expiryText(listing, bucket, now)}</Text>
            {typeof listing.views === 'number' && (
              <Text style={styles.metaText}>· {listing.views} 次浏览</Text>
            )}
          </View>
        </View>
      </Pressable>

      {(soon || bucket === 'expired') && (
        <View style={styles.pushWrap}>
          <View style={styles.pushHint}>
            <AlertTriangle size={13} color={colors.condFairFg} />
            <Text style={styles.pushHintText}>
              {bucket === 'expired'
                ? `已过期，刷新可重新上架并重置 ${TTL_DAYS} 天有效期`
                : `${REFRESH_REMINDER_DAYS} 天内到期，刷新赠 24h 曝光`}
            </Text>
          </View>
          <SecondaryButton
            title={bucket === 'expired' ? '重新上架 · 一键刷新' : '一键刷新 · 赠 24h 曝光'}
            icon={<RefreshCw size={15} color={colors.label} />}
            onPress={onRefresh}
            style={styles.pushBtn}
          />
        </View>
      )}

      {!!flash && (
        <View style={styles.flash}>
          <CheckCircle2 size={13} color={colors.condLikeNewFg} />
          <Text style={styles.flashText}>{flash}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {bucket === 'active' && !soon && (
          <GhostButton
            title="刷新"
            fullWidth={false}
            onPress={onRefresh}
            style={styles.linkBtn}
          />
        )}
        {bucket !== 'sold' && (
          <GhostButton
            title="降价重上架"
            fullWidth={false}
            onPress={onDiscount}
            style={styles.linkBtn}
          />
        )}
        {(bucket === 'active' || bucket === 'expired') && (
          <GhostButton
            title="标记已售"
            fullWidth={false}
            onPress={onSold}
            style={styles.linkBtn}
          />
        )}
        {bucket !== 'archived' && (
          <GhostButton
            title="下架"
            fullWidth={false}
            onPress={onArchive}
            style={styles.linkBtn}
          />
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ 屏幕主组件 */

export function ProfileScreen({ navigation }: any) {
  const currentUser = useStore((s) => s.currentUser);
  const allListings = useStore((s) => s.listings) as unknown as Listing[];
  const favorites = useStore((s) => s.favorites);
  const biometricEnabled = useStore((s) => s.biometricEnabled);

  const refreshListing = useStore((s) => s.refreshListing);
  const discountRelist = useStore((s) => s.discountRelist);
  const markSold = useStore((s) => s.markSold);
  const archiveListing = useStore((s) => s.archiveListing);
  const setBiometric = useStore((s) => s.setBiometric);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFavorite = useStore((s) => s.isFavorite);
  const logout = useStore((s) => s.logout);
  const language = (useStore((s) => s.language) ?? 'zh-CN') as SupportedLanguage;
  const setLanguage = useStore((s) => s.setLanguage);
  const messages = useStore((s) => s.messages);

  const [tab, setTab] = useState<Bucket>('active');
  const [hubSection, setHubSection] = useState<HubSection>('listings');
  const [langSheet, setLangSheet] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);
  const [priceTarget, setPriceTarget] = useState<Listing | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = Date.now();
  const myId = currentUser?.id ?? 'u_me';

  const mine = useMemo(
    () => allListings.filter((l) => (l.sellerId ?? l.seller_id) === myId),
    [allListings, myId]
  );

  // 卖家诚信画像
  const trustProfile = useMemo(
    () => getTrustProfile(currentUser?.rating ?? 4.9, mine.length + 3, true),
    [currentUser?.rating, mine.length]
  );

  // 议价对话聚合 (按商品+聊天对象)
  const threads = useMemo(() => {
    const at = (m: Message) => new Date(m.created_at).getTime();
    const nameOf = (m: Message, peerId: string) => {
      if (m.sender_id === peerId && m.sender?.nickname) return m.sender.nickname;
      const seller = allListings.find((l) => l.id === m.listing_id)?.seller;
      if (seller && seller.id === peerId && seller.nickname) return seller.nickname;
      return '宜家邻居';
    };
    const map = new Map<string, any>();
    messages.forEach((m) => {
      const peerId = m.sender_id === myId ? m.receiver_id : m.sender_id;
      const key = `${m.listing_id}|${peerId}`;
      const unreadInc = m.sender_id === peerId && !m.read ? 1 : 0;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          key,
          listingId: m.listing_id,
          peerId,
          peerName: nameOf(m, peerId),
          last: m,
          unread: unreadInc,
        });
        return;
      }
      prev.unread += unreadInc;
      if (at(m) >= at(prev.last)) prev.last = m;
    });
    return Array.from(map.values()).sort((a, b) => at(b.last) - at(a.last));
  }, [messages, allListings, myId]);

  const totalUnread = threads.reduce((n, t) => n + t.unread, 0);

  const grouped = useMemo(() => {
    const acc: Record<Bucket, Listing[]> = { active: [], expired: [], sold: [], archived: [] };
    mine.forEach((l) => acc[bucketOf(l, now)].push(l));
    BUCKET_ORDER.forEach((b) =>
      acc[b].sort(
        (a, c) => new Date(a.expiresAt ?? 0).getTime() - new Date(c.expiresAt ?? 0).getTime()
      )
    );
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, Math.floor(now / 60_000)]);

  const needAttention = useMemo(
    () => [...grouped.active.filter((l) => needsRefreshReminder(l, now)), ...grouped.expired],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grouped, Math.floor(now / 60_000)]
  );

  const favoriteListings = useMemo(
    () => favorites.map((id) => allListings.find((l) => l.id === id)).filter(Boolean) as Listing[],
    [favorites, allListings]
  );

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  const showFlash = (id: string, text: string) => {
    setFlash({ id, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3200);
  };

  /* ---------------------------------------------------------- 生命周期动作 */

  const onRefresh = (l: Listing) => {
    refreshListing(l.id);
    showFlash(l.id, `已刷新 · 赠 24h 曝光，有效期重置为 ${TTL_DAYS} 天`);
  };

  const onRefreshAll = () => {
    const ids = needAttention.map((l) => l.id);
    if (!ids.length) return;
    ids.forEach(refreshListing);
    Alert.alert('已全部刷新', `${ids.length} 件商品有效期已重置，并各赠 24h 曝光。`);
  };

  const openDiscount = (l: Listing) => {
    setPriceTarget(l);
    setPriceInput('');
  };

  const closeDiscount = () => {
    setPriceTarget(null);
    setPriceInput('');
  };

  const nextPrice = Number(priceInput);
  const priceValid =
    !!priceTarget &&
    priceInput.trim() !== '' &&
    Number.isFinite(nextPrice) &&
    nextPrice > 0 &&
    nextPrice < priceTarget.price;

  const submitDiscount = () => {
    if (!priceTarget || !priceValid) return;
    const id = priceTarget.id;
    discountRelist(id, Math.round(nextPrice));
    closeDiscount();
    setTab('active');
    showFlash(id, `已降价重上架 · 有效期重置为 ${TTL_DAYS} 天`);
  };

  const onSold = (l: Listing) => {
    Alert.alert('标记已售', `确认「${l.title}」已经卖出？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '已售出',
        onPress: () => {
          markSold(l.id);
          setTab('sold');
        },
      },
    ]);
  };

  const onArchive = (l: Listing) => {
    Alert.alert('下架并归档', '下架后买家不再看到该商品，你仍可在「归档」中降价重上架。', [
      { text: '取消', style: 'cancel' },
      {
        text: '下架',
        style: 'destructive',
        onPress: () => {
          archiveListing(l.id);
          setTab('archived');
        },
      },
    ]);
  };

  /* ---------------------------------------------------------- Face ID 锁 */

  const onToggleBiometric = async (next: boolean) => {
    if (bioBusy) return;
    if (!next) {
      setBiometric(false);
      return;
    }
    setBioBusy(true);
    const support = await getBiometricSupport();
    if (!support.available) {
      Alert.alert('无法启用', support.reason);
      setBioBusy(false);
      return;
    }
    const ok = await authenticate(support.reason);
    setBiometric(ok);
    if (!ok) Alert.alert('已取消', '未通过生物识别验证，锁未开启');
    setBioBusy(false);
  };

  const openListing = (id: string) =>
    navigation?.getParent?.()?.navigate('ListingDetail', { id });

  const currentLangMeta =
    SUPPORTED_LANGUAGES.find((item) => item.code === language) ?? SUPPORTED_LANGUAGES[0];

  /* ---------------------------------------------------------- 渲染 Hub 顶部分段 */

  const hubOptions = [
    { value: 'listings' as const, label: `📦 ${t('tab_my_listings', language)}` },
    {
      value: 'messages' as const,
      label: `💬 ${t('tab_messages', language)}${totalUnread > 0 ? ` (${totalUnread})` : ''}`,
    },
    { value: 'settings' as const, label: `⚙️ ${t('tab_settings', language)}` },
  ];

  const tabOptions = BUCKET_ORDER.map((b) => ({
    value: b,
    label: grouped[b].length ? `${BUCKET_META[b].label} ${grouped[b].length}` : BUCKET_META[b].label,
  }));

  const list = grouped[tab];

  return (
    <Screen scroll contentContainerStyle={styles.scrollPad}>
      <LargeTitleHeader
        title={t('hub_title', language)}
        subtitle="极简 5 屏控制台 · 在售 / 议价 / 系统设置"
        right={
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="切换语言"
            onPress={() => setLangSheet(true)}
            style={styles.langPill}
          >
            <Globe size={16} color={colors.brand} />
            <Text style={styles.langPillText}>{currentLangMeta.flag}</Text>
          </Pressable>
        }
      />

      {/* 3 合 1 核心枢纽切换：在售管理 | 议价消息 | 偏好设置 */}
      <SegmentedControl
        options={hubOptions}
        value={hubSection}
        onChange={setHubSection}
        style={styles.hubSegmented}
      />

      {/* =========================================================================
          分区 1：在售管理 (My Listings)
      ========================================================================= */}
      {hubSection === 'listings' && (
        <View>
          {/* 用户名片 & 诚信等级徽章 */}
          <View style={[styles.userCard, shadows.card]}>
            <Avatar name={currentUser?.nickname ?? 'IKEAR'} emoji="🧑" size={56} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={typography.title3} numberOfLines={1}>
                  {currentUser?.nickname ?? '未登录'}
                </Text>
                <Badge
                  label={`${trustProfile.badge} · ${trustProfile.score}分`}
                  tone={
                    trustProfile.tier === 'crown'
                      ? 'brand'
                      : trustProfile.tier === 'gold'
                      ? 'warning'
                      : 'neutral'
                  }
                />
              </View>
              <Text style={styles.userMeta} numberOfLines={1}>
                {currentUser?.city ?? '未设置城市'} · {mine.length} 件发布 · 优先曝光加成{' '}
                {trustProfile.exposureMultiplier}x
              </Text>
            </View>
          </View>

          {/* 统计指标 */}
          <View style={[styles.stats, shadows.card]}>
            <Stat
              icon={<Package size={17} color={colors.brand} />}
              value={mine.length}
              label={t('tab_my_listings', language)}
            />
            <View style={styles.statDivider} />
            <Stat
              icon={<Heart size={17} color={colors.red} />}
              value={favorites.length}
              label="收藏"
            />
            <View style={styles.statDivider} />
            <Stat
              icon={<ShoppingBag size={17} color={colors.green} />}
              value={grouped.sold.length}
              label="已售出"
            />
          </View>

          {/* 临期 / 过期处理横幅 */}
          {needAttention.length > 0 && (
            <View style={styles.banner}>
              <View style={styles.bannerHead}>
                <AlertTriangle size={17} color={colors.condFairFg} />
                <Text style={styles.bannerTitle}>{needAttention.length} 件商品需要处理</Text>
              </View>
              <Text style={styles.bannerBody}>
                {grouped.expired.length > 0 && `${grouped.expired.length} 件已过期，`}
                剩余 {REFRESH_REMINDER_DAYS} 天内到期的商品刷新后可重置 {TTL_DAYS} 天有效期，并赠
                24h 曝光。
              </Text>
              <PrimaryButton
                title={`全部刷新（${needAttention.length}）`}
                icon={<RefreshCw size={16} color={colors.onBrand} />}
                onPress={onRefreshAll}
                style={{ marginTop: spacing.md }}
              />
            </View>
          )}

          {/* 在售 / 已过期 / 已售 / 归档 */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>商品状态</Text>
          </View>
          <SegmentedControl
            options={tabOptions}
            value={tab}
            onChange={setTab}
            style={styles.segmented}
          />

          {list.length === 0 ? (
            <EmptyState
              icon={<EmptyIcon bucket={tab} />}
              title={EMPTY_TITLE[tab]}
              message={EMPTY_MESSAGE[tab]}
            />
          ) : (
            <View style={styles.cardList}>
              {list.map((l) => (
                <ListingItem
                  key={l.id}
                  listing={l}
                  now={now}
                  bucket={tab}
                  flash={flash?.id === l.id ? flash.text : undefined}
                  onOpen={() => openListing(l.id)}
                  onRefresh={() => onRefresh(l)}
                  onDiscount={() => openDiscount(l)}
                  onSold={() => onSold(l)}
                  onArchive={() => onArchive(l)}
                />
              ))}
            </View>
          )}

          {/* 我的收藏快捷入口 */}
          <ListSection header="我的收藏" style={styles.section}>
            {favoriteListings.slice(0, 3).map((l, i, arr) => (
              <ListRow
                key={l.id}
                title={l.title}
                subtitle={`${formatPrice(l.price)} · ${getCategory(l.category)?.name ?? '其他'}`}
                onPress={() => openListing(l.id)}
                accessory={
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="取消收藏"
                    onPress={() => toggleFavorite(l.id)}
                  >
                    <Heart
                      size={19}
                      color={colors.red}
                      fill={isFavorite(l.id) ? colors.red : 'transparent'}
                    />
                  </Pressable>
                }
                last={i === arr.length - 1 && favoriteListings.length <= 3}
              />
            ))}
            {favoriteListings.length > 3 && (
              <ListRow
                title="查看全部收藏"
                icon={<Heart size={19} color={colors.red} />}
                value={`${favoriteListings.length}`}
                chevron
                last
                onPress={() => navigation?.getParent?.()?.navigate('Favorites')}
              />
            )}
            {favoriteListings.length === 0 && (
              <ListRow
                title="我的收藏"
                subtitle="还没有收藏，去首页逛逛"
                icon={<Heart size={19} color={colors.red} />}
                chevron
                last
                onPress={() => navigation?.getParent?.()?.navigate('Favorites')}
              />
            )}
          </ListSection>
        </View>
      )}

      {/* =========================================================================
          分区 2：议价消息 (Messages & Negotiation)
      ========================================================================= */}
      {hubSection === 'messages' && (
        <View style={{ marginTop: spacing.md }}>
          {threads.length === 0 ? (
            <EmptyState
              emoji="💬"
              title="还没有议价消息"
              message="在任何二手商品详情页点击「联系卖家 / 议价」即可发起实时沟通。"
            />
          ) : (
            <ListSection header={`最近议价沟通 (${threads.length})`}>
              {threads.map((t, i) => (
                <ListRow
                  key={t.key}
                  icon={<Avatar name={t.peerName} emoji="🧑" size={44} />}
                  title={t.peerName}
                  subtitle={t.last.content}
                  value={threadTime(t.last.created_at)}
                  accessory={
                    t.unread > 0 ? (
                      <Badge label={t.unread} count style={{ marginLeft: spacing.sm }} />
                    ) : undefined
                  }
                  chevron
                  last={i === threads.length - 1}
                  onPress={() =>
                    navigation?.getParent?.()?.navigate('Chat', {
                      listingId: t.listingId,
                      peerId: t.peerId,
                      sellerId: t.peerId,
                    })
                  }
                />
              ))}
            </ListSection>
          )}
        </View>
      )}

      {/* =========================================================================
          分区 3：偏好设置 (Settings & 9 Languages)
      ========================================================================= */}
      {hubSection === 'settings' && (
        <View>
          {/* 多语言切换 */}
          <ListSection
            header="语言与本地化"
            footer="切换语言将立即全站热更新，支持全部 9 大主流地区语言。"
            style={styles.section}
          >
            <ListRow
              title={t('lang_switcher', language)}
              subtitle="支持中/繁/英/法/西/日/韩/德/瑞典"
              icon={<Globe size={20} color={colors.brand} />}
              value={`${currentLangMeta.flag} ${currentLangMeta.name}`}
              chevron
              last
              onPress={() => setLangSheet(true)}
            />
          </ListSection>

          {/* 账户安全 */}
          <ListSection
            header="安全与隐私"
            footer="开启后每次进入 App 需通过 Face ID / 触控 ID 验证。"
            style={styles.section}
          >
            <ListRow
              title={t('biometric_lock', language)}
              subtitle={biometricEnabled ? '已开启 · 生物识别保护中' : '使用 Face ID 保护账户资产'}
              icon={<Fingerprint size={20} color={colors.brand} />}
              last
              accessory={
                <Switch
                  value={biometricEnabled}
                  onValueChange={onToggleBiometric}
                  disabled={bioBusy}
                  trackColor={{ false: colors.gray4, true: colors.brand }}
                  ios_backgroundColor={colors.gray4}
                />
              }
            />
          </ListSection>

          {/* 卖家合规与信用 */}
          <ListSection header="平台规则与信用" style={styles.section}>
            <ListRow
              title={t('trust_tier_label', language)}
              subtitle={`${trustProfile.badge} · 评分 ${currentUser?.rating ?? 4.9} 分`}
              icon={<ShieldCheck size={20} color={colors.green} />}
              value={`${trustProfile.score} 分`}
              chevron
              onPress={() =>
                Alert.alert(
                  '卖家诚信等级',
                  `当前等级：${trustProfile.badge}\n综合得分：${trustProfile.score} 分\n当前享受曝光加成：${trustProfile.exposureMultiplier}x。\n提示：多传实拍照片、按时履约可迅速提升诚信分。`
                )
              }
            />
            <ListRow
              title="到期提醒与曝光机制"
              subtitle={`临期 ${REFRESH_REMINDER_DAYS} 天站内提醒，刷新赠 24h 曝光`}
              icon={<Clock size={20} color={colors.secondaryLabel} />}
              value="已开启"
              chevron
              onPress={() =>
                Alert.alert(
                  '到期机制',
                  `闲置挂牌有效期为 ${TTL_DAYS} 天，到期前 ${REFRESH_REMINDER_DAYS} 天系统将提醒您刷新。一键刷新即可获得 24 小时首页曝光扶持。`
                )
              }
            />
            <ListRow
              title="关于 IKEAR 与版权声明"
              icon={<Info size={20} color={colors.secondaryLabel} />}
              chevron
              last
              onPress={() =>
                Alert.alert(
                  '关于 IKEAR',
                  'IKEAR 二手家具集市 v1.0.0\n\n本平台为第三方独立二手流通撮合工具，与宜家 (Inter IKEA Systems B.V.) 无隶属关联。所有官方参考图仅用于型号对照示意，严禁商标混淆。让北欧设计继续流通 ♻️'
                )
              }
            />
          </ListSection>

          {/* 退出登录 */}
          <ListSection style={styles.section}>
            <ListRow
              title={t('logout', language)}
              icon={<LogOut size={20} color={colors.red} />}
              destructive
              last
              onPress={() =>
                Alert.alert('退出登录', '确定要退出当前账户吗？', [
                  { text: '取消', style: 'cancel' },
                  { text: '退出', style: 'destructive', onPress: logout },
                ])
              }
            />
          </ListSection>
        </View>
      )}

      {/* ---- 降价重上架弹窗 ---- */}
      <Sheet visible={!!priceTarget} onClose={closeDiscount} title="降价重上架">
        {!!priceTarget && (
          <View style={{ gap: spacing.md }}>
            <Text numberOfLines={2} style={typography.subhead}>
              {priceTarget.title}
            </Text>
            <Text style={styles.sheetHint}>
              原价 {formatPrice(priceTarget.price)}。新价格需低于原价，确认后重置 {TTL_DAYS}{' '}
              天有效期并打「降价」标。
            </Text>

            <View style={styles.priceField}>
              <Text style={styles.priceSymbol}>¥</Text>
              <TextInput
                value={priceInput}
                onChangeText={(t) => setPriceInput(t.replace(/[^0-9.]/g, ''))}
                keyboardType="number-pad"
                placeholder={String(Math.max(1, Math.round(priceTarget.price * 0.9)))}
                placeholderTextColor={colors.tertiaryLabel}
                autoFocus
                style={styles.priceInput}
              />
            </View>

            <View style={styles.presetRow}>
              {[5, 10, 20].map((p) => {
                const v = String(Math.max(1, Math.round(priceTarget.price * (1 - p / 100))));
                return (
                  <Tag
                    key={p}
                    label={`-${p}%`}
                    active={priceInput === v}
                    onPress={() => setPriceInput(v)}
                  />
                );
              })}
            </View>

            {priceInput.trim() !== '' && !priceValid && (
              <Text style={styles.sheetError}>
                请输入低于 {formatPrice(priceTarget.price)} 的有效价格
              </Text>
            )}

            <PrimaryButton
              title="确认降价并重上架"
              icon={<TrendingDown size={16} color={colors.onBrand} />}
              disabled={!priceValid}
              onPress={submitDiscount}
            />
            <GhostButton title="取消" onPress={closeDiscount} />
          </View>
        )}
      </Sheet>

      {/* ---- 全球 9 大主流语言切换抽屉 (Language Selection Sheet) ---- */}
      <Sheet
        visible={langSheet}
        onClose={() => setLangSheet(false)}
        title={t('lang_switcher', language)}
      >
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: spacing.xs, paddingVertical: spacing.xs }}>
            {SUPPORTED_LANGUAGES.map((item) => {
              const active = item.code === language;
              return (
                <Pressable
                  key={item.code}
                  style={[styles.langRow, active && styles.langRowActive]}
                  onPress={() => {
                    setLanguage(item.code);
                    setLangSheet(false);
                  }}
                >
                  <Text style={styles.langFlag}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        typography.subhead,
                        active && { color: colors.brand, fontWeight: '700' },
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={styles.langCode}>{item.code}</Text>
                  </View>
                  {active && <Check size={18} color={colors.brand} strokeWidth={2.5} />}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ 小部件 */

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <View style={styles.stat}>
      {icon}
      <Text style={[typography.title3, { marginTop: 4 }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.secondaryLabel }]}>{label}</Text>
    </View>
  );
}

const EMPTY_TITLE: Record<Bucket, string> = {
  active: '暂无在售商品',
  expired: '没有过期商品',
  sold: '还没有成交记录',
  archived: '归档是空的',
};

const EMPTY_MESSAGE: Record<Bucket, string> = {
  active: '点击底部 + 发布你的第一件闲置家具',
  expired: `商品有效期 ${TTL_DAYS} 天，临期 ${REFRESH_REMINDER_DAYS} 天会在这里提醒你刷新`,
  sold: '卖出后点「标记已售」，成交记录会出现在这里',
  archived: '下架的商品会保留在这里，可随时降价重上架',
};

function EmptyIcon({ bucket }: { bucket: Bucket }) {
  const size = 40;
  if (bucket === 'sold') return <ShoppingBag size={size} color={colors.gray3} />;
  if (bucket === 'archived') return <Archive size={size} color={colors.gray3} />;
  if (bucket === 'expired') return <Clock size={size} color={colors.gray3} />;
  return <Package size={size} color={colors.gray3} />;
}

/* ------------------------------------------------------------------ 样式 */

const styles = StyleSheet.create({
  scrollPad: { paddingBottom: 110 },

  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gray6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  langPillText: { fontSize: 14 },

  hubSegmented: {
    marginHorizontal: spacing.screen,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.screen,
    marginTop: spacing.xs,
  },
  userMeta: { ...typography.footnote, color: colors.secondaryLabel, marginTop: 4 },

  stats: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    marginHorizontal: spacing.screen,
    marginTop: spacing.md,
    paddingVertical: spacing.lg,
  },
  stat: { alignItems: 'center', flex: 1 },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginVertical: 4,
  },

  banner: {
    backgroundColor: colors.condFairBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.screen,
    marginTop: spacing.lg,
  },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bannerTitle: { ...typography.subhead, color: colors.condFairFg },
  bannerBody: {
    ...typography.footnote,
    color: colors.condFairFg,
    marginTop: 6,
    lineHeight: 19,
  },

  sectionHead: {
    marginTop: spacing.section,
    marginHorizontal: spacing.screen,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.title3 },
  segmented: { marginHorizontal: spacing.screen },

  cardList: { marginTop: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    marginHorizontal: spacing.screen,
    padding: spacing.md,
  },
  cardHead: { flexDirection: 'row', gap: spacing.md },
  cover: {
    width: 62,
    height: 62,
    borderRadius: radius.md,
    backgroundColor: colors.gray6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmoji: { fontSize: 28 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  metaText: { ...typography.caption, color: colors.secondaryLabel },

  pushWrap: {
    marginTop: spacing.md,
    backgroundColor: colors.condFairBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pushHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  pushHintText: { ...typography.caption, color: colors.condFairFg, flex: 1 },
  pushBtn: { minHeight: 40, borderRadius: radius.sm },

  flash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: colors.condLikeNewBg,
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  flashText: { ...typography.caption, color: colors.condLikeNewFg, flex: 1 },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 2,
  },
  linkBtn: { minHeight: 38, paddingHorizontal: 0, marginRight: spacing.lg },

  section: { marginTop: spacing.section, marginBottom: 0 },

  sheetHint: { ...typography.footnote, color: colors.secondaryLabel, lineHeight: 19 },
  priceField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.gray6,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 56,
  },
  priceSymbol: { ...typography.title3, color: colors.secondaryLabel },
  priceInput: { ...typography.title2, color: colors.label, flex: 1, padding: 0 },
  presetRow: { flexDirection: 'row', gap: spacing.sm },
  sheetError: { ...typography.caption, color: colors.red },

  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.cardBg,
    gap: 12,
  },
  langRowActive: {
    backgroundColor: colors.tintBlue,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  langFlag: { fontSize: 24 },
  langCode: { ...typography.caption, color: colors.secondaryLabel, marginTop: 2 },
});
