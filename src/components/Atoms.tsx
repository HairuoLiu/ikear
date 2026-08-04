/**
 * IKEAR — M0 design system atoms.
 *
 * These names are the shared contract for M1–M4; prefer importing from
 * `src/components/index.ts` (`import { PrimaryButton } from '../components'`).
 */
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';
import { conditionMeta, Condition } from '../data/types';
import { Search, ChevronRight, X, Plus } from 'lucide-react-native';

/* ------------------------------ Screen ---------------------------- */
export type ScreenProps = {
  children: React.ReactNode;
  /** wrap the content in a ScrollView */
  scroll?: boolean;
  /** apply horizontal screen padding */
  padded?: boolean;
  background?: string;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/** Safe-area container with the near-white grouped background. */
export function Screen({
  children,
  scroll = false,
  padded = false,
  background = colors.groupedBg,
  edges = ['top'],
  style,
  contentContainerStyle,
}: ScreenProps) {
  const pad = padded ? { paddingHorizontal: spacing.screen } : null;
  return (
    <SafeAreaView edges={edges} style={[styles.screen, { backgroundColor: background }, style]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[pad, { paddingBottom: spacing.xxxl }, contentContainerStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/* -------------------------- LargeTitleHeader ---------------------- */
export type LargeTitleHeaderProps = {
  title: string;
  subtitle?: string;
  /** trailing slot (icon button, badge, …) */
  right?: React.ReactNode;
};

/** iOS-style large title used at the top of scrollable screens. */
export function LargeTitleHeader({ title, subtitle, right }: LargeTitleHeaderProps) {
  return (
    <View style={styles.largeHeader}>
      <View style={{ flex: 1 }}>
        <Text style={typography.largeTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: 2 }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

/* ----------------------------- Buttons ---------------------------- */
export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const BUTTON_BG: Record<ButtonVariant, string> = {
  primary: colors.brand, // IKEA blue — primary actions only
  secondary: colors.gray5,
  destructive: colors.red,
  ghost: 'transparent',
};

const BUTTON_FG: Record<ButtonVariant, string> = {
  primary: colors.onBrand,
  secondary: colors.label,
  destructive: '#FFFFFF',
  ghost: colors.brand,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  fullWidth = true,
  icon,
  style,
}: ButtonProps) {
  const fg = BUTTON_FG[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor:
            variant === 'primary' && pressed ? colors.brandPressed : BUTTON_BG[variant],
          opacity: disabled ? 0.4 : pressed ? 0.9 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[typography.headline, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export type ActionButtonProps = Omit<ButtonProps, 'variant'>;

/** IKEA-blue call to action. One per screen (一屏一任务). */
export function PrimaryButton(props: ActionButtonProps) {
  return <Button {...props} variant="primary" />;
}

/** Neutral filled button for the secondary action. */
export function SecondaryButton(props: ActionButtonProps) {
  return <Button {...props} variant="secondary" />;
}

/** Text-only button for tertiary / inline actions. */
export function GhostButton(props: ActionButtonProps) {
  return <Button {...props} variant="ghost" />;
}

/** Destructive (delete / 下架) action. */
export function DestructiveButton(props: ActionButtonProps) {
  return <Button {...props} variant="destructive" />;
}

/* ---------------------------- SearchBar --------------------------- */
export type SearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SearchBar({
  value,
  onChange,
  placeholder = '搜索',
  onSubmit,
  autoFocus,
  style,
}: SearchBarProps) {
  return (
    <View style={[styles.searchWrap, style]}>
      <Search size={17} color={colors.secondaryLabel} style={{ marginRight: 6 }} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryLabel}
        autoFocus={autoFocus}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[typography.body, { flex: 1, color: colors.label, padding: 0 }]}
      />
    </View>
  );
}

/* ------------------------- SegmentedControl ----------------------- */
export type SegmentedOption<T extends string> = { label: string; value: T };

export type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && { backgroundColor: colors.cardBg, ...shadows.card }]}
          >
            <Text
              numberOfLines={1}
              style={[typography.subhead, { color: active ? colors.label : colors.secondaryLabel }]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------ Badge ----------------------------- */
export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'muted';

export type BadgeProps = {
  label: string | number;
  tone?: BadgeTone;
  /** pill shape with fixed min width — for unread counters */
  count?: boolean;
  style?: StyleProp<ViewStyle>;
};

const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.gray5, fg: colors.label },
  brand: { bg: colors.brandTint, fg: colors.brand },
  success: { bg: colors.condLikeNewBg, fg: colors.condLikeNewFg },
  warning: { bg: colors.condFairBg, fg: colors.condFairFg },
  danger: { bg: colors.condWornBg, fg: colors.condWornFg },
  muted: { bg: colors.gray6, fg: colors.secondaryLabel },
};

/** Small tag for 未读 / 降价 / 「可能已失效」. */
export function Badge({ label, tone = 'neutral', count, style }: BadgeProps) {
  const t = BADGE_TONES[tone];
  const bg = count && tone === 'neutral' ? colors.red : t.bg;
  const fg = count && tone === 'neutral' ? '#FFFFFF' : t.fg;
  return (
    <View
      style={[
        styles.badge,
        count && styles.badgeCount,
        { backgroundColor: bg },
        style,
      ]}
    >
      <Text style={[typography.caption, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

/** Condition chip driven by `conditionMeta` (成色). */
export function ConditionBadge({ condition }: { condition: Condition }) {
  const m = conditionMeta[condition];
  return (
    <View style={[styles.badge, { backgroundColor: m.bg }]}>
      <Text style={[typography.caption, { color: m.fg, fontWeight: '600' }]}>{m.label}</Text>
    </View>
  );
}

export type TagProps = { label: string; active?: boolean; onPress?: () => void };

/** Pill-shaped filter tag (排序条 / 轻筛选). */
export function Tag({ label, active, onPress }: TagProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.tag, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}
    >
      <Text
        style={[
          typography.footnote,
          { color: active ? '#fff' : colors.label, fontWeight: active ? '600' : '400' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ----------------------------- Avatar ----------------------------- */
export type AvatarProps = { name: string; emoji?: string; size?: number };

export function Avatar({ name, emoji, size = 44 }: AvatarProps) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: emoji ? colors.brandTint : colors.gray5,
        },
      ]}
    >
      <Text style={{ fontSize: size * 0.42 }}>{emoji ?? (name ? name[0] : '?')}</Text>
    </View>
  );
}

/* --------------------------- ListSection -------------------------- */
export type ListSectionProps = {
  header?: string;
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ListSection({ header, footer, children, style }: ListSectionProps) {
  return (
    <View style={[styles.section, style]}>
      {!!header && <Text style={styles.sectionHeader}>{header}</Text>}
      <View style={[styles.sectionCard, shadows.card]}>{children}</View>
      {!!footer && <Text style={styles.sectionFooter}>{footer}</Text>}
    </View>
  );
}

/* ----------------------------- ListRow ---------------------------- */
export type ListRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: React.ReactNode;
  /** trailing custom slot rendered before the chevron */
  accessory?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  /** last row of a section → no hairline */
  last?: boolean;
};

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  accessory,
  chevron,
  onPress,
  destructive,
  last,
}: ListRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowSeparator,
        { opacity: pressed && onPress ? 0.6 : 1 },
      ]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { color: destructive ? colors.red : colors.label }]}>
          {title}
        </Text>
        {!!subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
      </View>
      {!!value && <Text style={[typography.body, { color: colors.secondaryLabel }]}>{value}</Text>}
      {accessory}
      {chevron && <ChevronRight size={18} color={colors.tertiaryLabel} style={{ marginLeft: 6 }} />}
    </Pressable>
  );
}

/* --------------------------- EmptyState --------------------------- */
export type EmptyStateProps = {
  /** flat icon node; falls back to `emoji` */
  icon?: React.ReactNode;
  emoji?: string;
  title: string;
  message?: string;
  /** legacy alias of `message` */
  subtitle?: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon, emoji, title, message, subtitle, action }: EmptyStateProps) {
  const text = message ?? subtitle;
  return (
    <View style={styles.empty}>
      {icon ?? (!!emoji && <Text style={{ fontSize: 46 }}>{emoji}</Text>)}
      <Text style={[typography.title3, { marginTop: spacing.md, textAlign: 'center' }]}>
        {title}
      </Text>
      {!!text && (
        <Text
          style={[
            typography.footnote,
            { color: colors.secondaryLabel, marginTop: 4, textAlign: 'center' },
          ]}
        >
          {text}
        </Text>
      )}
      {!!action && <View style={{ marginTop: spacing.xl }}>{action}</View>}
    </View>
  );
}

/* ------------------------------ Sheet ----------------------------- */
export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/** Bottom sheet. Keep flows linear — 少弹层. */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetGrip} />
          {!!title && (
            <Text
              style={[typography.headline, { textAlign: 'center', marginBottom: spacing.md }]}
            >
              {title}
            </Text>
          )}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* --------------------------- Photo tiles -------------------------- */
export type PhotoTileProps = {
  /** local/remote uri; when absent an emoji placeholder is shown */
  uri?: string;
  emoji?: string;
  size?: number;
  /** renders the 「封面」 marker */
  cover?: boolean;
  /** renders an empty "add photo" tile */
  add?: boolean;
  label?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onRemove?: () => void;
};

const isUri = (s?: string) =>
  !!s && (s.startsWith('file:') || s.startsWith('http') || s.startsWith('content:') || s.startsWith('data:'));

export function PhotoTile({
  uri,
  emoji = '🪑',
  size = 104,
  cover,
  add,
  label,
  onPress,
  onLongPress,
  onRemove,
}: PhotoTileProps) {
  if (add) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.photoTile,
          styles.photoAdd,
          { width: size, height: size, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Plus size={24} color={colors.secondaryLabel} />
        {!!label && (
          <Text style={[typography.caption2, { color: colors.secondaryLabel, marginTop: 4 }]}>
            {label}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.photoTile,
        { width: size, height: size, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {isUri(uri) ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={{ fontSize: size * 0.36 }}>{uri || emoji}</Text>
      )}
      {cover && (
        <View style={styles.photoCover}>
          <Text style={[typography.caption2, { color: '#fff', fontWeight: '600' }]}>封面</Text>
        </View>
      )}
      {!!onRemove && (
        <Pressable hitSlop={layout.hitSlop} onPress={onRemove} style={styles.photoRemove}>
          <X size={12} color="#fff" />
        </Pressable>
      )}
    </Pressable>
  );
}

export type PhotoGridProps = {
  /** uris (or emoji placeholders); index 0 is the cover */
  photos: string[];
  tileSize?: number;
  max?: number;
  onAdd?: () => void;
  onPressPhoto?: (index: number) => void;
  onRemovePhoto?: (index: number) => void;
  /** long-press a tile to make it the cover */
  onSetCover?: (index: number) => void;
  addLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Wrapping photo grid used by the M2 guided camera flow (≤9 张). */
export function PhotoGrid({
  photos,
  tileSize = 104,
  max = 9,
  onAdd,
  onPressPhoto,
  onRemovePhoto,
  onSetCover,
  addLabel,
  style,
}: PhotoGridProps) {
  return (
    <View style={[styles.photoGrid, style]}>
      {photos.map((p, i) => (
        <PhotoTile
          key={`${p}-${i}`}
          uri={p}
          size={tileSize}
          cover={i === 0}
          onPress={onPressPhoto ? () => onPressPhoto(i) : undefined}
          onLongPress={onSetCover ? () => onSetCover(i) : undefined}
          onRemove={onRemovePhoto ? () => onRemovePhoto(i) : undefined}
        />
      ))}
      {!!onAdd && photos.length < max && (
        <PhotoTile add size={tileSize} onPress={onAdd} label={addLabel ?? `${photos.length}/${max}`} />
      )}
    </View>
  );
}

/* ------------------------- CategoryGridTile ----------------------- */
export type CategoryGridTileProps = {
  /** emoji string or a flat icon node */
  icon: string | React.ReactNode;
  name: string;
  onPress?: () => void;
  active?: boolean;
  /** defaults to a 3-column layout inside a wrapping row */
  width?: ViewStyle['width'];
};

/** Tile of the M1 品类九宫格. */
export function CategoryGridTile({
  icon,
  name,
  onPress,
  active,
  width = '31%',
}: CategoryGridTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryTile,
        { width },
        active && { backgroundColor: colors.brandTint },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {typeof icon === 'string' ? <Text style={{ fontSize: 30 }}>{icon}</Text> : icon}
      <Text
        numberOfLines={1}
        style={[
          typography.footnote,
          { marginTop: spacing.sm, color: active ? colors.brand : colors.label },
          active && { fontWeight: '600' },
        ]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

/* ----------------------------- Spinner ---------------------------- */
export function Spinner({ color = colors.brand }: { color?: string }) {
  return <ActivityIndicator color={color} />;
}

/* ----------------------------- Styles ----------------------------- */
const sectionHeaderStyle: TextStyle = {
  ...typography.footnote,
  color: colors.secondaryLabel,
  textTransform: 'uppercase',
  fontWeight: '600',
  marginLeft: 6,
  marginBottom: 7,
  letterSpacing: 0.06,
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  button: {
    borderRadius: radius.md,
    minHeight: layout.controlHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray5,
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.gray5,
    borderRadius: 9,
    padding: 2,
    gap: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 7,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    alignSelf: 'flex-start',
  },
  badgeCount: {
    minWidth: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gray4,
    backgroundColor: colors.cardBg,
  },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  section: { marginHorizontal: spacing.screen, marginBottom: spacing.lg },
  sectionHeader: sectionHeaderStyle,
  sectionCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  sectionFooter: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    marginHorizontal: 6,
    marginTop: 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: layout.rowHeight,
    gap: 12,
    backgroundColor: colors.cardBg,
  },
  rowSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowSub: { ...typography.footnote, color: colors.secondaryLabel, marginTop: 2 },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: 36,
  },
  sheetGrip: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gray4,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  largeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: 'transparent',
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoTile: {
    borderRadius: radius.md,
    backgroundColor: colors.gray6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoAdd: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray4,
    backgroundColor: colors.cardBg,
  },
  photoCover: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  categoryTile: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.sm,
  },
});
