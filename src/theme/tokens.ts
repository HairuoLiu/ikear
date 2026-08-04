/**
 * IKEAR iOS Design System — tokens following Apple Human Interface Guidelines
 * with the IKEA-style minimal look defined in PRODUCT_SPEC.md:
 *   · IKEA blue #0058A3 only for primary actions / brand
 *   · near-white grouped background, white cards, generous whitespace
 *   · system font (no bundled font files), large radii, flat icons
 *
 * On iOS the default system font resolves to SF Pro (San Francisco).
 */

export const colors = {
  // ---- iOS system palette ----
  systemBlue: '#007AFF',
  blue: '#007AFF', // alias of systemBlue (legacy name)
  blueDark: '#0066D6',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  gray: '#8E8E93',
  gray2: '#AEAEB2',
  gray3: '#C7C7CC',
  gray4: '#D1D1D6',
  gray5: '#E5E5EA',
  gray6: '#F2F2F7',

  // ---- semantic (light mode) ----
  label: '#1C1C1E',
  secondaryLabel: '#8E8E93',
  tertiaryLabel: '#C7C7CC',
  quaternaryLabel: '#D1D1D6',
  background: '#FFFFFF',
  secondaryBackground: '#F2F2F7',
  groupedBackground: '#F2F2F7',
  cardBackground: '#FFFFFF',
  separator: 'rgba(60,60,67,0.29)',
  separatorOpaque: '#C6C6C8',
  fill: '#E5E5EA',
  overlay: 'rgba(0,0,0,0.4)',

  // short aliases required by the M0 contract
  groupedBg: '#F2F2F7',
  cardBg: '#FFFFFF',

  // ---- brand (IKEA blue — primary buttons & brand only) ----
  brand: '#0058A3',
  brandPressed: '#00457F',
  brandTint: 'rgba(0,88,163,0.1)',
  onBrand: '#FFFFFF',

  // ---- condition badges ----
  condLikeNewBg: '#E3F9E5',
  condLikeNewFg: '#1A7F37',
  condGoodBg: '#E5F1FB',
  condGoodFg: '#0066D6',
  condFairBg: '#FFF4E0',
  condFairFg: '#B26A00',
  condWornBg: '#FFE9E7',
  condWornFg: '#C0392B',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 28, // whitespace between sections (we group by空间, not separators)
  screen: 20,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
  pill: 999,
} as const;

export const typography = {
  // uses the system font on iOS -> SF Pro
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.37 },
  title1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: 0.36 },
  title2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: 0.35 },
  title3: { fontSize: 20, fontWeight: '600' as const, letterSpacing: 0.38 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.41 },
  body: { fontSize: 17, fontWeight: '400' as const, letterSpacing: -0.41 },
  callout: { fontSize: 16, fontWeight: '400' as const, letterSpacing: -0.32 },
  subhead: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.24 },
  footnote: { fontSize: 13, fontWeight: '400' as const, letterSpacing: -0.08 },
  caption: { fontSize: 12, fontWeight: '400' as const, letterSpacing: 0.07 },
  caption2: { fontSize: 11, fontWeight: '400' as const, letterSpacing: 0.06 },
} as const;

/** Flat by design — only a whisper of depth so white cards read on #F2F2F7. */
export const shadows = {
  none: {},
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export const layout = {
  tabBarHeight: 83, // includes safe area
  navBarHeight: 44,
  controlHeight: 50, // primary button / large control
  rowHeight: 44,
  maxContentWidth: 680,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Typography = typeof typography;

export const tokens = { colors, spacing, radius, typography, shadows, layout } as const;
