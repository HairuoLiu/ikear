# IKEAR Design System Specification

This document defines the visual design language, foundations, component specifications, and usage guidelines for the **IKEAR** application. Follow these standards to maintain visual consistency across iOS, Android, and Web platforms.

---

## 1. Design Philosophy

The IKEAR design system blends Scandinavian minimalism with Apple's Human Interface Guidelines (HIG):

*   **Clarity and Content-First:** Furniture photography and product details take priority over heavy chrome.
*   **Restrained Color Application:** IKEA Brand Blue (`#0058A3`) is reserved exclusively for primary calls-to-action, branding moments, and active states.
*   **Generous Breathing Room:** Sections and components are grouped using whitespace rather than dense divider lines.
*   **Tactile Feedback:** Subtle micro-interactions, spring physics, and gentle elevation (`shadowOpacity: 0.04`) provide depth without visual noise.

---

## 2. Color Palette

All colors are exported from `src/theme/tokens.ts` under the `colors` namespace.

### Brand Colors

| Token | Value | Preview | Purpose |
| :--- | :--- | :--- | :--- |
| `brand` | `#0058A3` | ![#0058A3](https://via.placeholder.com/15/0058A3/000000?text=+) | Primary brand color, primary buttons, price tags |
| `brandPressed` | `#00457F` | ![#00457F](https://via.placeholder.com/15/00457F/000000?text=+) | Pressed state for primary actions |
| `brandTint` | `rgba(0, 88, 163, 0.1)` | ![rgba(0,88,163,0.1)](https://via.placeholder.com/15/0058A31A/000000?text=+) | Accent container backgrounds, selected pills |
| `onBrand` | `#FFFFFF` | ![#FFFFFF](https://via.placeholder.com/15/FFFFFF/000000?text=+) | Text and icons placed on brand backgrounds |

### Surface and Semantic Colors

| Token | Value | Role |
| :--- | :--- | :--- |
| `background` | `#FFFFFF` | Primary screen surface for modal dialogs and sheets |
| `groupedBackground` | `#F2F2F7` | Grouped list background and primary screen canvas |
| `cardBackground` | `#FFFFFF` | Elevated card surface |
| `label` | `#1C1C1E` | Primary typography color (high contrast) |
| `secondaryLabel` | `#8E8E93` | Metadata, timestamps, locations, and secondary captions |
| `tertiaryLabel` | `#C7C7CC` | Placeholder text and non-interactive icons |
| `separator` | `rgba(60,60,67,0.29)` | Fine borders and list dividers |

### Condition Badges (C2C Furniture Quality)

| Condition | Background (`bg`) | Text (`fg`) | Description |
| :--- | :--- | :--- | :--- |
| **全新 (Brand New)** | `#E3F9E5` | `#1A7F37` | Unopened or pristine condition |
| **良好 (Good)** | `#E5F1FB` | `#0066D6` | Minor signs of gentle use, fully functional |
| **一般 (Fair)** | `#FFF4E0` | `#B26A00` | Noticeable wear or cosmetic scratches |
| **磨损 (Worn)** | `#FFE9E7` | `#C0392B` | Structural or heavy visual imperfections |

---

## 3. Typography Scale

IKEAR relies on native system font stacks (`SF Pro` on iOS and macOS, `Roboto` on Android).

| Style | Font Size | Weight | Tracking (Letter Spacing) | Usage Example |
| :--- | :--- | :--- | :--- | :--- |
| `largeTitle` | `34px` | `700` (Bold) | `+0.37` | Main navigation headers (e.g., "发现", "消息") |
| `title1` | `28px` | `700` (Bold) | `+0.36` | Product detail prices |
| `title2` | `22px` | `700` (Bold) | `+0.35` | Section titles, modal headers |
| `title3` | `20px` | `600` (Semibold) | `+0.38` | Card prices, subsection titles |
| `headline` | `17px` | `600` (Semibold) | `-0.41` | Button labels, list row primary titles |
| `body` | `17px` | `400` (Regular) | `-0.41` | Long-form descriptions, input fields |
| `callout` | `16px` | `400` (Regular) | `-0.32` | Secondary body text, empty state messages |
| `subhead` | `15px` | `600` (Semibold) | `-0.24` | Product card titles, subsection headers |
| `footnote` | `13px` | `400` (Regular) | `-0.08` | Meta text, badge labels, timestamps |
| `caption` | `12px` | `400` (Regular) | `+0.07` | Location chips, auxiliary indicators |
| `caption2` | `11px` | `400` (Regular) | `+0.06` | Bottom tab bar labels, micro badges |

---

## 4. Spacing and Geometry

Spacing intervals use an 8-point base grid with 4-point half-steps:

```typescript
export const spacing = {
  xs: 4,      // Micro gaps (icon-to-text)
  sm: 8,      // Padding inside chips, compact tags
  md: 12,     // Default component internal padding
  lg: 16,     // Card padding, list item margin
  xl: 20,     // Section horizontal margins
  xxl: 24,    // Large group spacing
  xxxl: 32,   // Screen footer margins
  section: 28,// Gap between distinct screen sections
  screen: 20, // Standard screen horizontal gutter
};
```

### Corner Radius System

```typescript
export const radius = {
  xs: 6,      // Small tags
  sm: 8,      // Buttons, input fields
  md: 12,     // Standard cards, image thumbnails
  lg: 16,     // Large cards, category tiles
  xl: 22,     // Feature cards, floating sheets
  xxl: 28,    // Modal tops
  pill: 999,  // Filter chips, action pills
};
```

---

## 5. Component Anatomy & Guidelines

### 5.1 Primary Button (`PrimaryButton`)
*   **Height:** Fixed at `50px` (`layout.controlHeight`).
*   **Background:** `#0058A3`.
*   **Text:** White `#FFFFFF`, `headline` (17px Semibold).
*   **Constraint:** Use at most one primary button per screen to maintain clear visual hierarchy (一屏一任务).

### 5.2 Product Card (`ListingCard`)
*   **Width:** Responsive `48.5%` in two-column grid.
*   **Thumbnail:** Fixed `138px` height with subtle pastel background tint matching item title hash.
*   **Badges:** Top-left condition badge (`ConditionBadge`); top-right discount chip if discounted.
*   **Interactions:** Opacity drops to `0.88` with a micro-scale of `0.985` on press.

### 5.3 Category Tile (`CategoryGridTile`)
*   **Aspect Ratio:** `1:1` square tile.
*   **Border:** `1px` subtle border with `radius.xl` (22px).
*   **Active State:** Background switches to `colors.brandTint` with brand-colored text and icon accent.

---

## 6. Accessibility & Inclusivity

1.  **Touch Targets:** All interactive pressables have a minimum touch target of `44x44` points via `layout.hitSlop`.
2.  **Color Contrast:** All body text meets WCAG 2.1 AA standards (minimum 4.5:1 contrast against `#FFFFFF` or `#F2F2F7`).
3.  **Semantic Roles:** Interactive components expose appropriate `accessibilityRole` and `accessibilityLabel` attributes.
