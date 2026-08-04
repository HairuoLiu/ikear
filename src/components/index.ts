/**
 * IKEAR component contract (M0) — single import surface for M1–M4:
 *   import { Screen, LargeTitleHeader, PrimaryButton } from '../components';
 *
 * Atoms:      Screen · LargeTitleHeader · Button · PrimaryButton · SecondaryButton ·
 *             GhostButton · DestructiveButton · SearchBar · SegmentedControl · Sheet ·
 *             ListSection · ListRow · Badge · ConditionBadge · Tag · Avatar ·
 *             EmptyState · PhotoTile · PhotoGrid · CategoryGridTile · Spinner
 * Composites: ListingCard · CategoryChip · SplashScreen
 */
export {
  Screen,
  LargeTitleHeader,
  Button,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  DestructiveButton,
  SearchBar,
  SegmentedControl,
  Sheet,
  ListSection,
  ListRow,
  Badge,
  ConditionBadge,
  Tag,
  Avatar,
  EmptyState,
  PhotoTile,
  PhotoGrid,
  CategoryGridTile,
  Spinner,
} from './Atoms';

export type {
  ScreenProps,
  LargeTitleHeaderProps,
  ButtonProps,
  ButtonVariant,
  ActionButtonProps,
  SearchBarProps,
  SegmentedControlProps,
  SegmentedOption,
  SheetProps,
  ListSectionProps,
  ListRowProps,
  BadgeProps,
  BadgeTone,
  TagProps,
  AvatarProps,
  EmptyStateProps,
  PhotoTileProps,
  PhotoGridProps,
  CategoryGridTileProps,
} from './Atoms';

export { ListingCard } from './ListingCard';
export { CategoryChip } from './CategoryChip';
export { SplashScreen } from './SplashScreen';
